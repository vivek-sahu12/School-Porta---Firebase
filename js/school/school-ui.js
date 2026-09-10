import {
  auth,
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  increment
} from "../firebase.js";

import {
  saveDocToCache,
  getDocFromCache,
  getCollectionFromCache,
  saveCollectionToCache,
  enqueuePendingOp
} from "../offline-store.js";

import {
  onSyncCompleted,
  syncPendingQueueToFirebase,
  performForcedLogout
} from "../session-manager.js";

import { handleModalBackEvent } from "./modal-history-manager.js";

import {
  STANDARD_SENIOR_SUBJECTS,
  validateClassRange,
  includesSeniorClasses,
  normalizeClassLabel,
  formatClassDisplay,
  escapeHtml,
  highlightSearchMatches
} from "../school-config.js";

import {
  DATASET_KEYS,
  DATASET_LABELS,
  loadSchoolDatasets,
  getDatasetTotals,
  getDatasetStudents,
  calculateDatasetAnalytics,
  filterStudents,
  getStudentById
} from "./student-service.js";

import { generateStudentListPdf } from "./pdf-service.js";
import { openPdfColumnModal } from "./pdf-column-modal.js";
import { generateStudentListExcel } from "./excel-service.js";
import { openExcelConfirmModal, closeExcelConfirmModal } from "./excel-confirm-modal.js";
import { SUPER_ADMIN_UID } from "../admin/firestore-service.js";

import {
  calculateExactAge,
  evaluateClassEligibility,
  formatDateDMY,
  formatDateVerbose,
  parseDateSafe
} from "./age-calculator.js";
import { createDatePicker } from "./date-picker-sheet.js";

// Current Active School Session Context
let currentSchoolId = "";
let currentSchoolAccount = null;
let currentSchoolEntity = null;
let liveSchoolUsers = [];
let liveSchoolSessions = [];
let selectedUserForPerms = null;
let unsubSchoolDoc = null;
let unsubSchoolUsers = null;
let unsubSchoolSessions = null;

// Student Dashboard State & Hierarchical History Stack
let activeDataset = DATASET_KEYS.SCHOOL_DATA;
let activeStudentListFilters = { search: "", className: "", gender: "", category: "" };
let activeDetailStudent = null;

const VIEW_TITLES = {
  dashboard: "Dashboard",
  "student-list": "Student Records",
  "student-detail": "Student Profile",
  "school-info": "School Information",
  "school-users": "School Users",
  sessions: "Active Sessions",
  "student-data": "Student Data",
  "age-calculator": "Age Calculator"
};

let currentPortalState = {
  view: "dashboard",
  dataset: DATASET_KEYS.SCHOOL_DATA,
  filters: { search: "", className: "", gender: "", category: "" },
  studentId: null,
  title: "Dashboard",
  scrollY: 0
};
let internalNavStack = [];
let isNavHistoryInitialized = false;

// Toast Engine
export function showSchoolToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// Modal Helpers
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add("open");
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("open");
}

window.openModal = openModal;
window.closeModal = closeModal;

/**
 * Initialize School Portal UI (Loads cached state instantly, then listens to live Firestore updates)
 */
export async function initSchoolPortalUI(user, userAccountData, initialSchoolData) {
  currentSchoolId = userAccountData.schoolId;
  currentSchoolAccount = userAccountData;
  currentSchoolEntity = initialSchoolData || (await getDocFromCache("schools", currentSchoolId));

  // 1. Instantly populate from IndexedDB local cache if available
  try {
    const cachedUsers = await getCollectionFromCache("users");
    const filteredCachedUsers = cachedUsers.filter((u) => u.schoolId === currentSchoolId);
    if (filteredCachedUsers.length > 0) {
      liveSchoolUsers = filteredCachedUsers;
    }

    const cachedSessions = await getCollectionFromCache("sessions");
    const filteredCachedSessions = cachedSessions.filter((s) => s.schoolId === currentSchoolId && s.status === "active");
    if (filteredCachedSessions.length > 0) {
      liveSchoolSessions = filteredCachedSessions;
    }
  } catch (cacheErr) {
    console.warn("Offline cache preload warning:", cacheErr);
  }

  setupSchoolNavigation();
  setupSchoolForms();
  setupManualSync();
  renderSchoolHeaderInfo();
  renderSchoolInfoView();
  updateSchoolMetrics();
  renderSchoolUsersTable();
  renderSchoolSessionsTable();
  setupMobileDrawer();

  // Initialize Student Datasets & Analytics Dashboard
  await initStudentDashboard();

  // Initialize or restore hierarchical router state without reload/redirect
  if (history.state && history.state.portalState) {
    const restoredState = { ...history.state.portalState };
    if (restoredState.view === "dashboard") {
      restoredState.dataset = DATASET_KEYS.SCHOOL_DATA;
    }
    navigateSchoolPortal(restoredState, { replace: true, fromHistory: true });
  } else {
    navigateSchoolPortal({ view: "dashboard", dataset: DATASET_KEYS.SCHOOL_DATA }, { replace: true });
  }

  // 2. Setup real-time listeners when online
  if (navigator.onLine) {
    setupSchoolLiveListeners();
  }

  // 3. Re-render on sync completion
  onSyncCompleted(() => {
    renderSchoolHeaderInfo();
    renderSchoolInfoView();
    updateSchoolMetrics();
    renderSchoolUsersTable();
    renderSchoolSessionsTable();
    renderDatasetDashboard();
  });
}

/**
 * Refresh all active School Portal UI views immediately from current memory/cache
 */
export function refreshSchoolPortalDataViews() {
  renderSchoolHeaderInfo();
  renderSchoolInfoView();
  updateSchoolMetrics();
  renderSchoolUsersTable();
  renderSchoolSessionsTable();
  renderDatasetDashboard();

  const studentListView = document.getElementById("view-student-list");
  if (studentListView && studentListView.classList.contains("active")) {
    renderStudentListCards();
  }
}

/**
 * Setup Manual Data Synchronization Action
 */
let isManualSyncRunning = false;

function setupManualSync() {
  const syncBtn = document.getElementById("manual-sync-btn");
  if (!syncBtn) return;

  syncBtn.addEventListener("click", async () => {
    if (isManualSyncRunning) return;
    isManualSyncRunning = true;
    syncBtn.disabled = true;
    syncBtn.innerHTML = `
      <span class="sync-spinner" style="width:11px; height:11px;"></span>
      <span>Syncing...</span>
    `;

    try {
      if (!navigator.onLine) {
        showSchoolToast("Sync failed. Please check your connection and try again.", "error");
        return;
      }

      // 1. Process pending offline operations queue
      await syncPendingQueueToFirebase();

      // 2. Authoritative latest datasets fetch from Cloud Firestore
      const datasetResult = await loadSchoolDatasets(currentSchoolId, { forceRefresh: true });

      // 3. Targeted fetch for school document and users records
      if (currentSchoolId) {
        const schoolDocRef = doc(db, "schools", currentSchoolId);
        const schoolDocSnap = await getDoc(schoolDocRef);
        if (schoolDocSnap.exists()) {
          currentSchoolEntity = schoolDocSnap.data();
          await saveDocToCache("schools", currentSchoolId, currentSchoolEntity);
        }

        const usersCol = collection(db, "users");
        const qUsers = query(usersCol, where("schoolId", "==", currentSchoolId));
        const usersSnap = await getDocs(qUsers);
        liveSchoolUsers = usersSnap.docs.map((d) => ({
          id: d.id,
          firebaseUid: d.data().firebaseUid || d.id,
          ...d.data()
        }));
        await saveCollectionToCache("users", liveSchoolUsers, "firebaseUid");
      }

      // 4. Re-render ALL related dashboard information together
      refreshSchoolPortalDataViews();

      if (datasetResult.updated) {
        showSchoolToast("Data synced successfully.", "success");
      } else {
        showSchoolToast("Data is already up to date.", "info");
      }
    } catch (err) {
      console.warn("Manual sync error:", err);
      showSchoolToast("Sync failed. Please check your connection and try again.", "error");
    } finally {
      syncBtn.disabled = false;
      syncBtn.innerHTML = `
        <svg style="width: 13px; height: 13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
        <span>Sync Data</span>
      `;
      isManualSyncRunning = false;
    }
  });
}

/**
 * Navigation View Router & Hierarchical History Controller
 */
function setupSchoolNavigation() {
  if (!isNavHistoryInitialized) {
    window.addEventListener("popstate", (e) => {
      // 1. If an open modal handled this back press on mobile, prevent underlying page navigation
      if (handleModalBackEvent(e)) {
        return;
      }

      if (e.state && e.state.portalState) {
        if (internalNavStack.length > 0) {
          internalNavStack.pop();
        }
        navigateSchoolPortal(e.state.portalState, { fromHistory: true });
      } else if (internalNavStack.length > 0) {
        const prevState = internalNavStack.pop();
        navigateSchoolPortal(prevState, { fromHistory: true });
      } else {
        // Safe fallback to dashboard (NEVER logout or jump to login!)
        navigateSchoolPortal({ view: "dashboard", dataset: activeDataset }, { fromHistory: true });
      }
    });

    isNavHistoryInitialized = true;
  }

  window.navigateSchoolView = (viewName) => {
    navigateSchoolPortal({ view: viewName, dataset: activeDataset });
  };

  const navLinks = document.querySelectorAll(".nav-link");
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const datasetKey = link.getAttribute("data-dataset");
      const targetView = link.getAttribute("data-view");

      if (datasetKey) {
        switchDataset(datasetKey);
        openStudentListView({ title: `All Records (${DATASET_LABELS[datasetKey] || datasetKey})` });
      } else if (targetView) {
        navigateSchoolPortal({ view: targetView, dataset: activeDataset });
      }
    });
  });
}

/**
 * Universal Hierarchical Back Navigation Handler
 */
export function handlePortalBack() {
  if (internalNavStack.length > 0) {
    history.back();
  } else {
    // If entered directly into a deeper view without prior session history stack:
    if (currentPortalState.view === "student-detail") {
      navigateSchoolPortal({
        view: "student-list",
        dataset: activeDataset,
        filters: { ...activeStudentListFilters }
      }, { replace: true });
    } else {
      navigateSchoolPortal({
        view: "dashboard",
        dataset: activeDataset
      }, { replace: true });
    }
  }
}

/**
 * Central State-Preserving Navigation Router
 */
export function navigateSchoolPortal(targetState, { replace = false, fromHistory = false } = {}) {
  // Capture scroll position on outgoing view if available
  if (currentPortalState && currentPortalState.view) {
    currentPortalState.scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  }

  const targetView = targetState.view || "dashboard";
  // When opening/resetting Dashboard, always default strictly to School Data
  const targetDataset = targetView === "dashboard"
    ? (targetState.dataset || DATASET_KEYS.SCHOOL_DATA)
    : (targetState.dataset || activeDataset);
  const targetFilters = targetState.filters
    ? { ...targetState.filters }
    : (targetView === "student-list" ? { ...activeStudentListFilters } : { search: "", className: "", gender: "", category: "" });
  const targetStudentId = targetState.studentId || null;
  const targetTitle = targetState.title || VIEW_TITLES[targetView] || "School Portal";
  const targetScrollY = targetState.scrollY || 0;

  const fullState = {
    view: targetView,
    dataset: targetDataset,
    filters: targetFilters,
    studentId: targetStudentId,
    title: targetTitle,
    scrollY: targetScrollY
  };

  if (!fromHistory) {
    if (replace) {
      history.replaceState({ portalState: fullState }, "", window.location.href);
      if (internalNavStack.length > 0) {
        internalNavStack[internalNavStack.length - 1] = { ...fullState };
      }
    } else {
      // Avoid duplicate history entries if navigating to exact same view and parameters
      const isIdentical = currentPortalState &&
        currentPortalState.view === fullState.view &&
        currentPortalState.dataset === fullState.dataset &&
        currentPortalState.studentId === fullState.studentId &&
        JSON.stringify(currentPortalState.filters) === JSON.stringify(fullState.filters);

      if (!isIdentical) {
        internalNavStack.push({ ...currentPortalState });
        history.pushState({ portalState: fullState }, "", window.location.href);
      }
    }
  }

  currentPortalState = { ...fullState };
  activeDataset = targetDataset;

  applySchoolPortalState(fullState);
}

/**
 * Apply School Portal Navigation State to DOM
 */
function applySchoolPortalState(state) {
  const { view, dataset, filters, studentId, title, scrollY } = state;

  // 1. Sync active dataset
  if (dataset && DATASET_LABELS[dataset]) {
    activeDataset = dataset;
    const topSelect = document.getElementById("dataset-selector");
    if (topSelect && topSelect.value !== dataset) {
      topSelect.value = dataset;
    }
  }

  // 2. Sync sidebar active navigation link
  const navLinks = document.querySelectorAll(".nav-link");
  navLinks.forEach((l) => {
    const v = l.getAttribute("data-view");
    const ds = l.getAttribute("data-dataset");
    if (v === view) {
      l.classList.add("active");
    } else if (view === "student-list" && ds === activeDataset) {
      l.classList.add("active");
    } else {
      l.classList.remove("active");
    }
  });

  // 3. Switch active view panel
  const views = document.querySelectorAll(".school-view");
  views.forEach((v) => {
    if (v.id === `view-${view}`) v.classList.add("active");
    else v.classList.remove("active");
  });

  const titleEl = document.getElementById("page-view-title");
  if (titleEl) {
    titleEl.textContent = VIEW_TITLES[view] || "School Portal";
  }

  // 4. Close mobile drawer & backdrop
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("active");

  // 5. View-specific DOM state restoration
  if (view === "dashboard") {
    renderDatasetDashboard();
    window.scrollTo(0, scrollY || 0);
  } else if (view === "student-list") {
    activeStudentListFilters = { ...filters };

    // Update list title
    const listTitleEl = document.getElementById("student-list-view-title");
    if (listTitleEl && title) {
      listTitleEl.textContent = title;
    }

    // Sync search input and clear button
    const searchInput = document.getElementById("student-list-search-input");
    const clearBtn = document.getElementById("student-list-search-clear");
    if (searchInput) {
      searchInput.value = filters.search || "";
      if (clearBtn) clearBtn.style.display = filters.search ? "flex" : "none";
    }

    // Sync class dropdown
    const classSelect = document.getElementById("filter-class-select");
    if (classSelect) {
      const analytics = calculateDatasetAnalytics(activeDataset);
      classSelect.innerHTML = `<option value="">All Classes</option>` + analytics.classList.map(c => `
        <option value="${c.className}" ${c.className === filters.className ? "selected" : ""}>${formatClassDisplay(c.className)} (${c.count})</option>
      `).join("");
      classSelect.value = filters.className || "";
    }

    // Sync gender & category dropdowns
    const genderSelect = document.getElementById("filter-gender-select");
    if (genderSelect) genderSelect.value = filters.gender || "";

    const catSelect = document.getElementById("filter-category-select");
    if (catSelect) catSelect.value = filters.category || "";

    renderStudentListCards();
    updateExcelExportVisibility();
    window.scrollTo(0, scrollY || 0);
  } else if (view === "student-detail") {
    if (studentId) {
      renderStudentDetailContent(studentId);
    }
    window.scrollTo(0, scrollY || 0);
  } else if (view === "school-info") {
    renderSchoolInfoView();
    window.scrollTo(0, 0);
  } else if (view === "school-users") {
    renderSchoolUsersTable();
    window.scrollTo(0, 0);
  } else if (view === "sessions") {
    renderSchoolSessionsTable();
    window.scrollTo(0, 0);
  } else if (view === "age-calculator") {
    initAgeCalculator();
    window.scrollTo(0, scrollY || 0);
  }
}

/**
 * Real-Time Firestore Listeners Scoped Strictly to Current School
 */
function setupSchoolLiveListeners() {
  if (!currentSchoolId) return;

  // 1. Subscribe to School Entity Document
  const schoolDocRef = doc(db, "schools", currentSchoolId);
  unsubSchoolDoc = onSnapshot(schoolDocRef, async (snap) => {
    if (snap.exists()) {
      currentSchoolEntity = snap.data();
      saveDocToCache("schools", currentSchoolId, currentSchoolEntity);
      renderSchoolHeaderInfo();
      renderSchoolInfoView();
      updateSchoolMetrics();

      // Automatically refresh datasets if updated by Admin
      if (currentSchoolEntity.datasets) {
        await loadSchoolDatasets(currentSchoolId);
        renderDatasetDashboard();
        const studentListView = document.getElementById("view-student-list");
        if (studentListView && studentListView.classList.contains("active")) {
          renderStudentListCards();
        }
      }
    }
  }, (err) => console.warn("School live listener note:", err));

  // 2. Subscribe to Users belonging to this school
  const usersCol = collection(db, "users");
  const qUsers = query(usersCol, where("schoolId", "==", currentSchoolId));
  unsubSchoolUsers = onSnapshot(qUsers, (snap) => {
    liveSchoolUsers = snap.docs.map((d) => ({
      id: d.id,
      firebaseUid: d.data().firebaseUid || d.id,
      ...d.data()
    }));
    saveCollectionToCache("users", liveSchoolUsers, "firebaseUid");
    updateSchoolMetrics();
    renderSchoolUsersTable();

    // Propagate live permission changes or revoke access if deleted/deactivated
    const currentUid = currentSchoolAccount?.firebaseUid || currentSchoolAccount?.uid;
    if (currentUid && currentUid !== SUPER_ADMIN_UID) {
      const me = liveSchoolUsers.find((u) => (u.firebaseUid || u.uid || u.id) === currentUid);
      if (me) {
        if (me.status === "Inactive" || me.status === "Deleted") {
          console.warn("User account marked inactive or deleted. Revoking access.");
          performForcedLogout("Your account has been deactivated or deleted by the administrator.", "./index.html");
          return;
        }
        updateUserAccountData(me);
      } else if (currentSchoolAccount?.type !== "school" && liveSchoolUsers.length > 0) {
        console.warn("Current user no longer present in school user list. Revoking access.");
        performForcedLogout("Your account has been deleted by an administrator.", "./index.html");
        return;
      }
    }
  }, (err) => console.warn("Users live listener note:", err));

  // 3. Subscribe to Active Sessions belonging to this school
  const sessionsCol = collection(db, "sessions");
  const qSessions = query(sessionsCol, where("schoolId", "==", currentSchoolId), where("status", "==", "active"));
  unsubSchoolSessions = onSnapshot(qSessions, (snap) => {
    liveSchoolSessions = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        sessionId: data.sessionId || d.id,
        ...data,
        formattedLoginTime: data.loginTime?.toDate 
          ? data.loginTime.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) 
          : "Active",
        formattedLastActive: data.lastActive?.toDate 
          ? data.lastActive.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) 
          : "Now"
      };
    });
    saveCollectionToCache("sessions", liveSchoolSessions, "sessionId");
    updateSchoolMetrics();
    renderSchoolUsersTable();
    renderSchoolSessionsTable();
  }, (err) => console.warn("Sessions live listener note:", err));
}

import { resolveImageUrl, getSchoolLogoHtml } from "../image-resolver.js";
export { resolveImageUrl, getSchoolLogoHtml };

/**
 * Render Header & Top Bar with School Logo and Redesigned Account Area
 */
function renderSchoolHeaderInfo() {
  const school = currentSchoolEntity || {};
  const schoolName = school.schoolName || school.name || "School Portal";
  const schoolId = school.schoolId || currentSchoolId;
  const initial = school.logoInitial || schoolName.substring(0, 2).toUpperCase() || "SC";
  const rawLogoUrl = school.logoUrl;
  const isUserAccount = currentSchoolAccount?.type === "user";

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  // Top/Header IDs
  setTxt("sidebar-school-title", schoolName);
  setTxt("sidebar-school-id-badge", schoolId);
  setTxt("top-school-name", schoolName);
  setTxt("student-school-id-display", schoolId);

  // Redesigned Sidebar Account Area
  setTxt("sidebar-account-school-name", schoolName);
  setTxt("sidebar-account-school-id", schoolId);
  
  const roleLabel = document.getElementById("sidebar-account-role-label");
  const userNameEl = document.getElementById("sidebar-account-user-name");
  
  if (isUserAccount) {
    if (roleLabel) roleLabel.textContent = "User Account";
    if (userNameEl) {
      userNameEl.textContent = currentSchoolAccount.displayName || currentSchoolAccount.name || "School User";
      userNameEl.style.display = "block";
    }
  } else {
    if (roleLabel) roleLabel.textContent = "School Account";
    if (userNameEl) {
      userNameEl.style.display = "none";
    }
  }

  // Account Circular Logo / Avatar
  const accountLogoEl = document.getElementById("sidebar-account-logo");
  if (accountLogoEl) {
    if (rawLogoUrl && rawLogoUrl.trim()) {
      accountLogoEl.innerHTML = getSchoolLogoHtml(rawLogoUrl, schoolName, "school-avatar-lg");
    } else {
      accountLogoEl.innerHTML = `
        <div class="school-avatar school-avatar-lg">
          <span class="avatar-fallback">${initial}</span>
        </div>
      `;
    }
  }

  // Legacy avatar fallback support
  const legacyAvatar = document.getElementById("sidebar-user-avatar");
  if (legacyAvatar) {
    if (rawLogoUrl && rawLogoUrl.trim()) {
      legacyAvatar.innerHTML = getSchoolLogoHtml(rawLogoUrl, schoolName, "school-avatar-sm");
    } else {
      legacyAvatar.innerHTML = `<span class="avatar-fallback">${initial}</span>`;
    }
  }

  const topStatus = document.getElementById("top-school-status");
  if (topStatus) {
    topStatus.className = `badge ${school.status === 'Active' ? 'badge-active' : 'badge-inactive'}`;
    topStatus.textContent = school.status || "Active";
  }

  // Dashboard quick card info
  setTxt("dash-school-name", schoolName);
  setTxt("dash-school-id", schoolId);
  setTxt("dash-school-email", school.adminEmail || currentSchoolAccount?.email || "None");
  setTxt("dash-school-address", school.address || "Campus Address");
}

/**
 * Update 4 Overview Metric Cards
 */
function updateSchoolMetrics() {
  const school = currentSchoolEntity || {};
  const totalStudents = school.studentsCount || 0;
  const staffUsers = liveSchoolUsers.filter((u) => u.type !== "school");
  const totalUsers = staffUsers.length;
  const activeUsers = staffUsers.filter((u) => u.status === "Active").length;
  const activeSessions = liveSchoolSessions.length;

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt("metric-students", totalStudents);
  setTxt("metric-users", totalUsers);
  setTxt("metric-active-users", activeUsers);
  setTxt("metric-sessions", activeSessions);

  const countEl = document.getElementById("school-sessions-count");
  if (countEl) countEl.textContent = activeSessions;
}

/**
 * Render View 2: School Information
 */
function renderSchoolInfoView() {
  const school = currentSchoolEntity || {};
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt("info-name", school.schoolName || school.name || "—");
  setTxt("info-id", school.schoolId || currentSchoolId);
  setTxt("info-uid", school.firebaseUid || currentSchoolAccount?.firebaseUid || "—");
  setTxt("info-email", school.adminEmail || currentSchoolAccount?.email || "—");
  setTxt("info-phone", school.phoneNumber || school.phone || "—");
  setTxt("info-address", school.address || "Campus Address");
  setTxt("info-logourl", school.logoUrl || "None configured");

  const startCls = school.startingClass || "Nursery";
  const endCls = school.endingClass || "Class 10";
  setTxt("info-class-range", `${startCls} → ${endCls}`);

  const subjectsContainer = document.getElementById("info-subjects-container");
  const subjectsList = document.getElementById("info-subjects-list");
  if (subjectsContainer && subjectsList) {
    if (includesSeniorClasses(startCls, endCls) && Array.isArray(school.subjects) && school.subjects.length > 0) {
      subjectsContainer.style.display = "block";
      subjectsList.innerHTML = school.subjects.map(sub => `
        <span class="badge" style="background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; font-size: 0.725rem; padding: 2px 8px;">${sub}</span>
      `).join("");
    } else if (includesSeniorClasses(startCls, endCls)) {
      subjectsContainer.style.display = "block";
      subjectsList.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-muted);">No specific subjects configured</span>`;
    } else {
      subjectsContainer.style.display = "none";
    }
  }

  const statusBadge = document.getElementById("info-status");
  if (statusBadge) {
    statusBadge.innerHTML = `<span class="badge ${school.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${school.status || 'Active'}</span>`;
  }

  // Check Editable Permission for School Account
  const editBtn = document.getElementById("btn-edit-school-info");
  if (editBtn) {
    const isEditable = currentSchoolAccount?.permissions?.editable !== false;
    if (isEditable) {
      editBtn.style.display = "inline-flex";
      editBtn.onclick = () => window.openEditSchoolModal();
    } else {
      editBtn.style.display = "none";
    }
  }
}

/**
 * Render View 3: School Users Table
 */
function renderSchoolUsersTable() {
  const tbody = document.getElementById("school-users-tbody");
  if (!tbody) return;

  const staffUsers = liveSchoolUsers.filter((u) => u.type !== "school");

  if (staffUsers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">
          No staff users registered for this school yet.
          <div style="margin-top: 10px;">
            <button class="btn btn-primary btn-sm" onclick="window.openAddSchoolUserModal()">+ Add First User</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = staffUsers.map((u) => {
    const p = u.permissions || {};
    const activeDevCount = liveSchoolSessions.filter((ses) => ses.userUid === (u.firebaseUid || u.uid)).length;
    const limit = u.deviceLimit || 3;

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">${u.displayName || u.name}</div>
          <span class="chip-uid">UID: ${u.firebaseUid || u.uid}</span>
        </td>
        <td><span style="font-size: 0.85rem;">${u.email || '—'}</span></td>
        <td><span class="badge ${u.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${u.status || 'Active'}</span></td>
        <td><span style="font-size: 0.85rem; font-weight: 600;">${limit} Devices</span></td>
        <td>
          <span style="font-size: 0.85rem; font-weight: 700; color: ${activeDevCount >= limit ? '#dc2626' : '#2563eb'};">
            ${activeDevCount} / ${limit} Active
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            ${p.editable ? '<span class="badge badge-active" style="font-size:0.675rem;">Editable</span>' : ''}
            ${p.addStudent ? '<span class="badge badge-active" style="font-size:0.675rem;">+Student</span>' : ''}
            ${p.deleteStudent ? '<span class="badge" style="background:#fee2e2; color:#991b1b; border:1px solid #fecaca; font-size:0.675rem;">Delete</span>' : ''}
            ${p.excelExport ? '<span class="badge badge-active" style="font-size:0.675rem;">Excel</span>' : ''}
            ${p.reports ? '<span class="badge badge-active" style="font-size:0.675rem;">Reports</span>' : ''}
          </div>
        </td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="window.openEditSchoolUserPermsModal('${u.firebaseUid || u.uid}')">Manage User</button>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * Render View 4: Active Sessions Table (Scoped to current school)
 */
function renderSchoolSessionsTable() {
  const tbody = document.getElementById("school-sessions-tbody");
  if (!tbody) return;

  if (liveSchoolSessions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
          No active device sessions currently connected.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = liveSchoolSessions.map((ses) => `
    <tr>
      <td>
        <span class="chip-uid">${ses.userUid}</span>
      </td>
      <td><span style="font-size: 0.85rem; font-weight: 500;">${ses.deviceName || 'Web Browser'}</span></td>
      <td><span style="font-family: monospace; font-size: 0.725rem; color: var(--text-muted);">${ses.deviceId || 'DEV'}</span></td>
      <td><span style="font-size: 0.8rem; color: var(--text-muted);">${ses.formattedLoginTime || 'Active'}</span></td>
      <td><span style="font-size: 0.8rem; color: var(--text-muted);">${ses.formattedLastActive || 'Now'}</span></td>
      <td><span class="badge badge-active">Active</span></td>
      <td style="text-align: right;">
        <button class="btn btn-danger-outline btn-sm" onclick="window.forceLogoutSchoolSession('${ses.sessionId || ses.id}')">
          Force Logout
        </button>
      </td>
    </tr>
  `).join("");
}

/**
 * Force Logout Action (Offline safe with pending queue)
 */
window.forceLogoutSchoolSession = async (sessionId) => {
  try {
    // Optimistically update local session list
    liveSchoolSessions = liveSchoolSessions.filter((s) => (s.sessionId || s.id) !== sessionId);
    renderSchoolSessionsTable();
    updateSchoolMetrics();

    if (navigator.onLine) {
      try {
        const sessionDocRef = doc(db, "sessions", sessionId);
        await updateDoc(sessionDocRef, {
          status: "terminated",
          logoutTime: serverTimestamp()
        });
        showSchoolToast("Device session terminated.", "success");
      } catch (err) {
        console.warn("Direct terminate error, enqueuing offline op:", err);
        await enqueuePendingOp({
          collection: "sessions",
          docId: sessionId,
          action: "update",
          payload: { status: "terminated" }
        });
        showSchoolToast("Device session terminated (will sync online).", "success");
      }
    } else {
      await enqueuePendingOp({
        collection: "sessions",
        docId: sessionId,
        action: "update",
        payload: { status: "terminated" }
      });
      showSchoolToast("Device session terminated offline. Will sync when reconnected.", "success");
    }
  } catch (err) {
    console.error("Force logout error:", err);
    showSchoolToast("Failed to terminate session.", "error");
  }
};

/**
 * Setup Forms (Add School User & Edit School Info) with Offline Pending Support
 */
function setupSchoolForms() {
  // 1. Add School User Form
  const formAddUser = document.getElementById("form-add-school-user");
  if (formAddUser) {
    formAddUser.addEventListener("submit", async (e) => {
      e.preventDefault();
      const firebaseUid = document.getElementById("add-user-uid").value.trim();
      const displayName = document.getElementById("add-user-name").value.trim();
      const email = document.getElementById("add-user-email").value.trim();
      const status = document.getElementById("add-user-status").value;
      const deviceLimit = document.getElementById("add-user-device-limit").value;

      const permissions = {
        editable: document.getElementById("add-perm-editable")?.checked || false,
        addStudent: document.getElementById("add-perm-addStudent")?.checked || false,
        deleteStudent: document.getElementById("add-perm-deleteStudent")?.checked || false,
        excelExport: document.getElementById("add-perm-excelExport")?.checked || false,
        reports: document.getElementById("add-perm-reports")?.checked || false
      };

      if (!firebaseUid || !displayName) {
        showSchoolToast("Please enter Firebase UID and Name.", "error");
        return;
      }

      const newUserObj = {
        firebaseUid,
        uid: firebaseUid,
        type: "user",
        schoolId: currentSchoolId,
        name: displayName,
        displayName,
        email,
        status: status || "Active",
        deviceLimit: Math.max(1, Math.min(15, Number(deviceLimit) || 3)),
        permissions,
        updatedAt: Date.now()
      };

      // Optimistic update
      const existingIdx = liveSchoolUsers.findIndex((u) => u.firebaseUid === firebaseUid || u.uid === firebaseUid);
      if (existingIdx >= 0) {
        liveSchoolUsers[existingIdx] = { ...liveSchoolUsers[existingIdx], ...newUserObj };
      } else {
        liveSchoolUsers.push(newUserObj);
      }

      renderSchoolUsersTable();
      updateSchoolMetrics();
      await saveDocToCache("users", firebaseUid, newUserObj);

      formAddUser.reset();
      closeModal("modal-add-school-user");

      if (navigator.onLine) {
        try {
          const userDocRef = doc(db, "users", firebaseUid);
          const existingDoc = await getDoc(userDocRef);

          await setDoc(userDocRef, {
            ...newUserObj,
            updatedAt: serverTimestamp(),
            ...(existingDoc.exists() ? {} : { createdAt: serverTimestamp() })
          }, { merge: true });

          if (!existingDoc.exists()) {
            try {
              const schoolDocRef = doc(db, "schools", currentSchoolId);
              await updateDoc(schoolDocRef, { usersCount: increment(1) });
            } catch (err) {}
          }

          showSchoolToast(`School User ${displayName} added successfully!`, "success");
        } catch (err) {
          console.warn("Online save user failed, enqueuing offline op:", err);
          await enqueuePendingOp({
            collection: "users",
            docId: firebaseUid,
            action: "set",
            payload: newUserObj
          });
          showSchoolToast(`User ${displayName} saved offline. Will sync when online.`, "success");
        }
      } else {
        await enqueuePendingOp({
          collection: "users",
          docId: firebaseUid,
          action: "set",
          payload: newUserObj
        });
        showSchoolToast(`User ${displayName} saved offline. Will sync when online.`, "success");
      }
    });
  }

  // Dynamic Class Range & Subject Visibility for School Edit Modal
  const editStartClass = document.getElementById("edit-start-class");
  const editEndClass = document.getElementById("edit-end-class");
  const editSubSection = document.getElementById("edit-subjects-section");
  const editSubGrid = document.getElementById("edit-subjects-grid");
  const editAddSubBtn = document.getElementById("edit-add-subject-btn");
  const editCustomSubInput = document.getElementById("edit-custom-subject");

  const updateEditSeniorVisibility = () => {
    const start = editStartClass?.value || "";
    const end = editEndClass?.value || "";
    const isSenior = includesSeniorClasses(start, end);
    if (editSubSection) {
      editSubSection.style.display = isSenior ? "block" : "none";
    }
  };

  editStartClass?.addEventListener("change", updateEditSeniorVisibility);
  editEndClass?.addEventListener("change", updateEditSeniorVisibility);

  if (editAddSubBtn && editCustomSubInput && editSubGrid) {
    editAddSubBtn.addEventListener("click", () => {
      const customSub = editCustomSubInput.value.trim();
      if (!customSub) return;
      const existing = getSelectedSubjectsSchool("edit-subjects-grid");
      if (!existing.includes(customSub)) {
        existing.push(customSub);
      }
      renderSeniorSubjectCheckboxesSchool("edit-subjects-grid", existing);
      editCustomSubInput.value = "";
    });
  }

  // 2. Edit School Information Form
  const formEditSchool = document.getElementById("form-edit-school");
  if (formEditSchool) {
    formEditSchool.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("edit-name").value.trim();
      const logoUrl = document.getElementById("edit-logo").value.trim();
      const email = document.getElementById("edit-email").value.trim();
      const phone = document.getElementById("edit-phone") ? document.getElementById("edit-phone").value.trim() : "";
      const address = document.getElementById("edit-address").value.trim();
      const startingClass = document.getElementById("edit-start-class").value;
      const endingClass = document.getElementById("edit-end-class").value;

      // Validate Class Range
      const classValidation = validateClassRange(startingClass, endingClass);
      if (!classValidation.valid) {
        showSchoolToast(classValidation.error, "error");
        return;
      }

      const subjects = includesSeniorClasses(startingClass, endingClass)
        ? getSelectedSubjectsSchool("edit-subjects-grid")
        : (currentSchoolEntity?.subjects || []);

      const updateData = {
        schoolName: name,
        name,
        logoUrl,
        adminEmail: email,
        phoneNumber: phone,
        address,
        startingClass,
        endingClass,
        subjects,
        updatedAt: Date.now()
      };

      // Optimistic update
      currentSchoolEntity = { ...(currentSchoolEntity || {}), ...updateData };
      await saveDocToCache("schools", currentSchoolId, currentSchoolEntity);
      renderSchoolHeaderInfo();
      renderSchoolInfoView();
      closeModal("modal-edit-school-info");

      if (navigator.onLine) {
        try {
          const schoolDocRef = doc(db, "schools", currentSchoolId);
          await updateDoc(schoolDocRef, {
            ...updateData,
            updatedAt: serverTimestamp()
          });
          showSchoolToast("School information updated successfully!", "success");
        } catch (err) {
          console.warn("Online school update failed, enqueuing offline op:", err);
          await enqueuePendingOp({
            collection: "schools",
            docId: currentSchoolId,
            action: "update",
            payload: updateData,
            schoolId: currentSchoolId
          });
          showSchoolToast("School info saved offline. Will sync when online.", "success");
        }
      } else {
        await enqueuePendingOp({
          collection: "schools",
          docId: currentSchoolId,
          action: "update",
          payload: updateData,
          schoolId: currentSchoolId
        });
        showSchoolToast("School info saved offline. Will sync when online.", "success");
      }
    });
  }
}

/**
 * Render standard senior subject checkboxes inside a target container
 */
function renderSeniorSubjectCheckboxesSchool(containerId, activeSubjects = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const currentSelected = new Set(Array.isArray(activeSubjects) ? activeSubjects : []);
  const allSubjects = Array.from(new Set([...STANDARD_SENIOR_SUBJECTS, ...(Array.isArray(activeSubjects) ? activeSubjects : [])]));

  container.innerHTML = allSubjects.map(sub => `
    <label style="display: flex; align-items: center; gap: 6px; font-size: 0.775rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 8px; cursor: pointer; user-select: none;">
      <input type="checkbox" value="${sub}" ${currentSelected.has(sub) ? "checked" : ""} class="subject-checkbox">
      <span style="color: var(--text-main); font-weight: 500;">${sub}</span>
    </label>
  `).join("");
}

/**
 * Extract selected subject values from a grid container
 */
function getSelectedSubjectsSchool(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  const checked = container.querySelectorAll("input.subject-checkbox:checked");
  return Array.from(checked).map(cb => cb.value.trim()).filter(Boolean);
}

/**
 * Open Modal Helpers
 */
window.openAddSchoolUserModal = () => {
  openModal("modal-add-school-user");
};

window.openEditSchoolModal = () => {
  const school = currentSchoolEntity || {};
  const nameInput = document.getElementById("edit-name");
  const logoInput = document.getElementById("edit-logo");
  const emailInput = document.getElementById("edit-email");
  const phoneInput = document.getElementById("edit-phone");
  const addressInput = document.getElementById("edit-address");
  const startClassInput = document.getElementById("edit-start-class");
  const endClassInput = document.getElementById("edit-end-class");

  const startClass = school.startingClass || "Nursery";
  const endClass = school.endingClass || "Class 10";

  if (nameInput) nameInput.value = school.schoolName || school.name || "";
  if (logoInput) logoInput.value = school.logoUrl || "";
  if (emailInput) emailInput.value = school.adminEmail || currentSchoolAccount?.email || "";
  if (phoneInput) phoneInput.value = school.phoneNumber || school.phone || "";
  if (addressInput) addressInput.value = school.address || "";
  if (startClassInput) startClassInput.value = startClass;
  if (endClassInput) endClassInput.value = endClass;

  renderSeniorSubjectCheckboxesSchool("edit-subjects-grid", school.subjects || []);

  const subSection = document.getElementById("edit-subjects-section");
  if (subSection) {
    subSection.style.display = includesSeniorClasses(startClass, endClass) ? "block" : "none";
  }

  openModal("modal-edit-school-info");
};

window.openEditSchoolUserPermsModal = (firebaseUid) => {
  const user = liveSchoolUsers.find((u) => u.firebaseUid === firebaseUid || u.uid === firebaseUid);
  if (!user) return;

  selectedUserForPerms = user;
  const titleEl = document.getElementById("m-perm-user-title");
  const subEl = document.getElementById("m-perm-user-sub");

  if (titleEl) titleEl.textContent = user.displayName || user.name || "User";
  if (subEl) subEl.textContent = `UID: ${user.firebaseUid || user.uid} • School ID: ${currentSchoolId}`;

  const statusSel = document.getElementById("m-perm-status");
  if (statusSel) statusSel.value = user.status || "Active";

  const devVal = document.getElementById("m-perm-device-limit-val");
  if (devVal) devVal.textContent = user.deviceLimit || 3;

  const perms = user.permissions || { editable: true, addStudent: true, deleteStudent: false, excelExport: true, reports: false };
  const setCb = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  };

  setCb("m-perm-editable", perms.editable);
  setCb("m-perm-addStudent", perms.addStudent);
  setCb("m-perm-deleteStudent", perms.deleteStudent);
  setCb("m-perm-excelExport", perms.excelExport);
  setCb("m-perm-reports", perms.reports);

  openModal("modal-edit-user-perms");
};

window.stepUserDeviceLimit = (delta) => {
  const el = document.getElementById("m-perm-device-limit-val");
  if (!el) return;
  const current = Number(el.textContent) || 3;
  const next = Math.max(1, Math.min(15, current + delta));
  el.textContent = next;
};

// Save User Permissions
const savePermsBtn = document.getElementById("save-user-perms-btn");
if (savePermsBtn) {
  savePermsBtn.addEventListener("click", async () => {
    if (!selectedUserForPerms) return;

    const status = document.getElementById("m-perm-status")?.value || "Active";
    const deviceLimit = Number(document.getElementById("m-perm-device-limit-val")?.textContent) || 3;
    const permissions = {
      editable: document.getElementById("m-perm-editable")?.checked || false,
      addStudent: document.getElementById("m-perm-addStudent")?.checked || false,
      deleteStudent: document.getElementById("m-perm-deleteStudent")?.checked || false,
      excelExport: document.getElementById("m-perm-excelExport")?.checked || false,
      reports: document.getElementById("m-perm-reports")?.checked || false
    };

    const targetUid = selectedUserForPerms.firebaseUid || selectedUserForPerms.uid;
    const updatedUserObj = {
      ...selectedUserForPerms,
      status,
      deviceLimit,
      permissions,
      updatedAt: Date.now()
    };

    // Optimistic Update
    const idx = liveSchoolUsers.findIndex((u) => (u.firebaseUid || u.uid) === targetUid);
    if (idx >= 0) {
      liveSchoolUsers[idx] = updatedUserObj;
    }
    if (targetUid === (currentSchoolAccount?.firebaseUid || currentSchoolAccount?.uid)) {
      updateUserAccountData(updatedUserObj);
    }
    renderSchoolUsersTable();
    await saveDocToCache("users", targetUid, updatedUserObj);
    closeModal("modal-edit-user-perms");

    if (navigator.onLine) {
      try {
        const userDocRef = doc(db, "users", targetUid);
        await updateDoc(userDocRef, {
          status,
          deviceLimit,
          permissions,
          updatedAt: serverTimestamp()
        });

        showSchoolToast(`Settings saved for ${selectedUserForPerms.displayName || targetUid}!`, "success");
      } catch (err) {
        console.warn("Online save perms error, enqueuing offline op:", err);
        await enqueuePendingOp({
          collection: "users",
          docId: targetUid,
          action: "update",
          payload: { status, deviceLimit, permissions }
        });
        showSchoolToast("Settings saved offline. Will sync when online.", "success");
      }
    } else {
      await enqueuePendingOp({
        collection: "users",
        docId: targetUid,
        action: "update",
        payload: { status, deviceLimit, permissions }
      });
      showSchoolToast("Settings saved offline. Will sync when online.", "success");
    }
  });
}

/**
 * Mobile Drawer
 */
function setupMobileDrawer() {
  const btn = document.getElementById("mobile-menu-btn");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (btn && sidebar) {
    btn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      if (overlay) overlay.classList.toggle("active", sidebar.classList.contains("open"));
    });
  }
  if (overlay && sidebar) {
    overlay.addEventListener("click", () => {
      sidebar.classList.remove("open");
      overlay.classList.remove("active");
    });
  }
}

/* ==========================================================================
   STUDENT DATA ANALYTICS, DATASET SELECTOR & INTERACTIVE EXPLORATION CONTROLLER
   ========================================================================== */

/**
 * Initialize Student Dashboard Datasets & Setup Interactions
 */
async function initStudentDashboard() {
  activeDataset = DATASET_KEYS.SCHOOL_DATA;
  await loadSchoolDatasets(currentSchoolId);
  setupStudentDashboardInteractions();
  renderDatasetDashboard();
}

/**
 * Wire up all dashboard dataset switches and interactive buttons
 */
function setupStudentDashboardInteractions() {
  // 1. Top Bar Dataset Selector Dropdown
  const topSelect = document.getElementById("dataset-selector");
  if (topSelect) {
    topSelect.value = DATASET_KEYS.SCHOOL_DATA;
    topSelect.addEventListener("change", (e) => {
      switchDataset(e.target.value);
    });
  }

  // 2. Top Comparison Strip Cards (1-Tap Dataset Switchers)
  const compareCards = document.querySelectorAll(".dataset-compare-card");
  compareCards.forEach((card) => {
    card.addEventListener("click", () => {
      const ds = card.getAttribute("data-dataset");
      if (ds) switchDataset(ds);
    });
  });

  // 3. Hero Metric Card (Opens All Records in Active Dataset)
  const heroCard = document.getElementById("hero-total-students-btn");
  if (heroCard) {
    heroCard.addEventListener("click", () => {
      const label = DATASET_LABELS[activeDataset] || "School Data";
      openStudentListView({ title: `All Records (${label})` });
    });
  }

  // 4. Gender Cards (Boys & Girls filters)
  const boysCard = document.getElementById("gender-card-boys");
  if (boysCard) {
    boysCard.addEventListener("click", () => {
      const label = DATASET_LABELS[activeDataset] || "School Data";
      openStudentListView({ gender: "Boy", title: `Boys (${label})` });
    });
  }

  const girlsCard = document.getElementById("gender-card-girls");
  if (girlsCard) {
    girlsCard.addEventListener("click", () => {
      const label = DATASET_LABELS[activeDataset] || "School Data";
      openStudentListView({ gender: "Girl", title: `Girls (${label})` });
    });
  }

  // 5. Explore Students Search Action
  const exploreInput = document.getElementById("explore-search-input");
  const exploreBtn = document.getElementById("explore-search-btn");
  const exploreClear = document.getElementById("explore-search-clear");

  const triggerExplore = () => {
    const q = exploreInput ? exploreInput.value.trim() : "";
    const label = DATASET_LABELS[activeDataset] || "School Data";
    openStudentListView({ search: q, title: q ? `Search: "${q}" (${label})` : `All Records (${label})` });
  };

  if (exploreBtn) exploreBtn.addEventListener("click", triggerExplore);
  if (exploreInput) {
    exploreInput.addEventListener("input", () => {
      if (exploreClear) {
        exploreClear.style.display = exploreInput.value.trim() ? "flex" : "none";
      }
    });
    exploreInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") triggerExplore();
    });
  }
  if (exploreClear) {
    exploreClear.addEventListener("click", () => {
      if (exploreInput) {
        exploreInput.value = "";
        exploreInput.focus();
      }
      exploreClear.style.display = "none";
    });
  }

  // 6. Navigation Back Buttons
  const backToDashBtn = document.getElementById("btn-back-to-dashboard");
  if (backToDashBtn) {
    backToDashBtn.addEventListener("click", () => {
      handlePortalBack();
    });
  }

  const backToListBtn = document.getElementById("btn-back-to-student-list");
  if (backToListBtn) {
    backToListBtn.addEventListener("click", () => {
      handlePortalBack();
    });
  }

  const backFromAgeCalcBtn = document.getElementById("btn-back-from-age-calculator");
  if (backFromAgeCalcBtn) {
    backFromAgeCalcBtn.addEventListener("click", () => {
      handlePortalBack();
    });
  }

  // 7. Student List Toolbar Filters & Search
  const listSearch = document.getElementById("student-list-search-input");
  const listClear = document.getElementById("student-list-search-clear");
  const filterClass = document.getElementById("filter-class-select");
  const filterGender = document.getElementById("filter-gender-select");
  const filterCategory = document.getElementById("filter-category-select");

  const syncListFilterState = () => {
    currentPortalState.filters = { ...activeStudentListFilters };
    currentPortalState.scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    // Update header title dynamically if clearing/changing search
    const label = DATASET_LABELS[activeDataset] || "School Data";
    const listTitleEl = document.getElementById("student-list-view-title");
    if (listTitleEl) {
      if (activeStudentListFilters.search) {
        listTitleEl.textContent = `Search: "${activeStudentListFilters.search}" (${label})`;
      } else if (activeStudentListFilters.className) {
        listTitleEl.textContent = `${formatClassDisplay(activeStudentListFilters.className)} (${label})`;
      } else if (activeStudentListFilters.gender) {
        listTitleEl.textContent = `${activeStudentListFilters.gender}s (${label})`;
      } else if (activeStudentListFilters.category) {
        listTitleEl.textContent = `${activeStudentListFilters.category} Category (${label})`;
      } else {
        listTitleEl.textContent = `All Records (${label})`;
      }
      currentPortalState.title = listTitleEl.textContent;
    }

    history.replaceState({ portalState: currentPortalState }, "", window.location.href);
    renderStudentListCards();
  };

  if (listSearch) {
    listSearch.addEventListener("input", () => {
      activeStudentListFilters.search = listSearch.value;
      if (listClear) listClear.style.display = listSearch.value ? "flex" : "none";
      syncListFilterState();
    });
  }

  if (listClear) {
    listClear.addEventListener("click", () => {
      if (listSearch) {
        listSearch.value = "";
        listSearch.focus();
      }
      activeStudentListFilters.search = "";
      listClear.style.display = "none";
      syncListFilterState();
    });
  }

  if (filterClass) {
    filterClass.addEventListener("change", (e) => {
      activeStudentListFilters.className = e.target.value;
      syncListFilterState();
    });
  }

  if (filterGender) {
    filterGender.addEventListener("change", (e) => {
      activeStudentListFilters.gender = e.target.value;
      syncListFilterState();
    });
  }

  if (filterCategory) {
    filterCategory.addEventListener("change", (e) => {
      activeStudentListFilters.category = e.target.value;
      syncListFilterState();
    });
  }

  // 8. Setup Context-Aware PDF & Excel Export
  setupPdfExport();
  setupExcelExport();
}

/**
 * Setup Context-Aware PDF Export from Student List (both desktop & mobile triggers)
 */
function setupPdfExport() {
  const pdfButtons = document.querySelectorAll(".btn-pdf-export");
  if (!pdfButtons.length) return;

  const handleExport = (clickedBtn) => {
    if (clickedBtn.disabled) return;

    // Fail safe if user account has been deactivated or deleted
    if (currentSchoolAccount?.status === "Inactive" || currentSchoolAccount?.status === "Deleted") {
      showSchoolToast("Access denied: account deactivated or deleted.", "error");
      performForcedLogout("Your account has been deactivated or deleted by the administrator.", "./index.html");
      return;
    }

    // Context-Aware: exact currently filtered & viewed students
    const students = filterStudents(activeDataset, activeStudentListFilters);
    if (!students || students.length === 0) {
      showSchoolToast("No students to export in current view.", "info");
      return;
    }

    // Open the Column Selection Popup (Centered Modal)
    openPdfColumnModal({
      datasetKey: activeDataset,
      onToast: showSchoolToast,
      onGenerate: async (columnConfig) => {
        const result = await generateStudentListPdf({
          school: currentSchoolEntity || { schoolId: currentSchoolId, schoolName: "School" },
          datasetKey: activeDataset,
          students,
          filterContext: activeStudentListFilters,
          columnConfig
        });

        if (result.success) {
          showSchoolToast(`PDF generated successfully (${students.length} student${students.length === 1 ? '' : 's'}).`, "success");
        } else {
          showSchoolToast(result.error || "Failed to generate PDF.", "error");
        }
      }
    });
  };

  pdfButtons.forEach(btn => {
    btn.addEventListener("click", () => handleExport(btn));
  });
}

/**
 * Authoritative check: Does the currently logged-in user have Excel export permission?
 * - Layer 1 & 2 Security: Evaluates real-time user permissions
 * - Loading Safety: returns false if currentSchoolAccount not yet initialized
 * - Super Admin clearance: honors SUPER_ADMIN_UID & admin types
 * - Explicit user permissions: checks currentSchoolAccount.permissions.excelExport
 * - Primary school accounts default to true if permissions object is not yet populated
 */
export function hasExcelExportPermission() {
  if (!currentSchoolAccount) return false;
  if (currentSchoolAccount.status === "Inactive" || currentSchoolAccount.status === "Deleted") return false;

  // Super Admin bypass
  const uid = currentSchoolAccount.firebaseUid || currentSchoolAccount.uid || auth?.currentUser?.uid;
  if (uid === SUPER_ADMIN_UID || currentSchoolAccount.type === "admin") {
    return true;
  }

  const perms = currentSchoolAccount.permissions;
  if (perms && typeof perms.excelExport !== "undefined") {
    return perms.excelExport === true;
  }

  // Primary school account defaults to true if permissions object omitted
  if (currentSchoolAccount.type === "school") {
    return true;
  }

  return false;
}

/**
 * Update UI visibility of Excel export buttons across desktop, tablet, and mobile.
 * - When permission is ON: button is visible (display: "")
 * - When permission is OFF: button is completely hidden (display: "none")
 * - If permission is revoked while confirmation modal is open, closes modal safely
 */
export function updateExcelExportVisibility() {
  const isAllowed = hasExcelExportPermission();
  const excelButtons = document.querySelectorAll(".btn-excel-export");
  excelButtons.forEach(btn => {
    if (isAllowed) {
      btn.style.setProperty("display", "");
      btn.removeAttribute("aria-hidden");
      btn.removeAttribute("disabled");
      btn.removeAttribute("hidden");
      btn.classList.remove("hidden");
    } else {
      btn.style.setProperty("display", "none", "important");
      btn.setAttribute("aria-hidden", "true");
      btn.setAttribute("hidden", "hidden");
      btn.classList.add("hidden");
    }
  });

  if (!isAllowed) {
    closeExcelConfirmModal();
  }
}

/**
 * Live update of user account permissions (e.g. from real-time Firestore monitor)
 */
export function updateUserAccountData(userData) {
  if (!userData) return;
  currentSchoolAccount = { ...(currentSchoolAccount || {}), ...userData };
  updateExcelExportVisibility();
}

/**
 * Setup Context-Aware Excel Export from Student List (both desktop & mobile triggers)
 */
function setupExcelExport() {
  const excelButtons = document.querySelectorAll(".btn-excel-export");
  if (!excelButtons.length) return;

  // Enforce initial visibility state based on current user permissions
  updateExcelExportVisibility();

  const handleExcelExport = (clickedBtn) => {
    if (clickedBtn && clickedBtn.disabled) return;

    // Layer 2 Action Authorization Check: Fail safely if permission missing/revoked
    if (!hasExcelExportPermission()) {
      showSchoolToast("You do not have permission to export Excel files.", "error");
      updateExcelExportVisibility();
      return;
    }

    // Context-Aware: exact currently filtered & viewed students (0 extra Firebase calls)
    const students = filterStudents(activeDataset, activeStudentListFilters);
    if (!students || students.length === 0) {
      showSchoolToast("No students to export in current view.", "info");
      return;
    }

    // Open Centered Confirmation Modal (NO bottom sheet)
    openExcelConfirmModal({
      datasetKey: activeDataset,
      students,
      filterContext: activeStudentListFilters,
      onConfirm: async () => {
        // Re-verify authorization immediately prior to workbook generation
        if (!hasExcelExportPermission()) {
          showSchoolToast("Permission denied: You do not have Excel export clearance.", "error");
          updateExcelExportVisibility();
          return;
        }

        const result = await generateStudentListExcel({
          school: currentSchoolEntity || { schoolId: currentSchoolId, schoolName: "School" },
          datasetKey: activeDataset,
          students,
          isAuthorized: hasExcelExportPermission()
        });

        if (result.success) {
          showSchoolToast(`Excel exported successfully (${students.length} student${students.length === 1 ? '' : 's'}).`, "success");
        } else {
          showSchoolToast(result.error || "Failed to generate Excel.", "error");
        }
      }
    });
  };

  excelButtons.forEach(btn => {
    btn.addEventListener("click", () => handleExcelExport(btn));
  });
}

/**
 * Switch Active Dataset and re-compute dashboard
 */
function switchDataset(datasetKey) {
  if (!DATASET_LABELS[datasetKey]) return;
  activeDataset = datasetKey;
  renderDatasetDashboard();
}

/**
 * Render Dataset Analytics & Dashboard Cards
 */
function renderDatasetDashboard() {
  // 1. Update Comparison Strip Counts
  const totals = getDatasetTotals();
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt("count-dataset-sd", totals[DATASET_KEYS.SCHOOL_DATA] || 0);
  setTxt("count-dataset-ud", totals[DATASET_KEYS.UDISE] || 0);
  setTxt("count-dataset-p3", totals[DATASET_KEYS.THREE_POINT_ZERO] || 0);

  // Update Active Indicators on Comparison Strip
  const sdCard = document.getElementById("card-dataset-sd");
  const udCard = document.getElementById("card-dataset-ud");
  const p3Card = document.getElementById("card-dataset-p3");
  const sdBadge = document.getElementById("badge-active-sd");
  const udBadge = document.getElementById("badge-active-ud");
  const p3Badge = document.getElementById("badge-active-p3");

  [sdCard, udCard, p3Card].forEach(c => c?.classList.remove("active"));
  if (sdBadge) sdBadge.style.display = "none";
  if (udBadge) udBadge.style.display = "none";
  if (p3Badge) p3Badge.style.display = "none";

  if (activeDataset === DATASET_KEYS.SCHOOL_DATA) {
    sdCard?.classList.add("active");
    if (sdBadge) sdBadge.style.display = "inline-block";
  } else if (activeDataset === DATASET_KEYS.UDISE) {
    udCard?.classList.add("active");
    if (udBadge) udBadge.style.display = "inline-block";
  } else if (activeDataset === DATASET_KEYS.THREE_POINT_ZERO) {
    p3Card?.classList.add("active");
    if (p3Badge) p3Badge.style.display = "inline-block";
  }

  // Sync Top-Bar Dataset Dropdown
  const topSelect = document.getElementById("dataset-selector");
  if (topSelect && topSelect.value !== activeDataset) {
    topSelect.value = activeDataset;
  }

  // 2. Compute Analytics for Current Selected Dataset
  const analytics = calculateDatasetAnalytics(activeDataset);

  // Hero Card
  setTxt("hero-dataset-tag", analytics.datasetLabel);
  setTxt("dash-total-students-count", analytics.totalStudents);

  // 3. Render Class Strength Grid
  const classGrid = document.getElementById("class-strength-grid");
  if (classGrid) {
    if (analytics.classList.length === 0) {
      classGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px;">No class records available for ${analytics.datasetLabel}.</div>`;
    } else {
      classGrid.innerHTML = analytics.classList.map(c => `
        <div class="class-strength-card" data-class="${c.className}" role="button" tabindex="0">
          <div class="class-card-header">
            <span class="class-card-name">${formatClassDisplay(c.className)}</span>
            <span class="class-card-count">${c.count}</span>
          </div>
          <div class="class-card-bar-bg">
            <div class="class-card-bar-fill" style="width: ${c.percent}%;"></div>
          </div>
        </div>
      `).join("");

      // Add click listeners on class cards
      classGrid.querySelectorAll(".class-strength-card").forEach(card => {
        card.addEventListener("click", () => {
          const className = card.getAttribute("data-class");
          openStudentListView({ className, title: `${formatClassDisplay(className)} Students (${analytics.datasetLabel})` });
        });
      });
    }
  }

  // 4. Render Gender Analytics
  setTxt("dash-boys-count", analytics.gender.boys);
  setTxt("dash-girls-count", analytics.gender.girls);

  const boysBar = document.getElementById("gender-bar-boys");
  const girlsBar = document.getElementById("gender-bar-girls");
  if (boysBar) boysBar.style.width = `${analytics.gender.boysPercent}%`;
  if (girlsBar) girlsBar.style.width = `${analytics.gender.girlsPercent}%`;

  // 5. Render Category Distribution (4-Column Layout: GEN | OBC | SC | ST - No Percentages)
  const catGrid = document.getElementById("category-cards-grid");
  if (catGrid) {
    if (analytics.categories.length === 0) {
      catGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; font-size: 0.8rem; color: var(--text-muted); padding: 14px;">No category records available</div>`;
    } else {
      catGrid.innerHTML = analytics.categories.map(cat => {
        const catSlug = cat.category.toLowerCase().replace(/[^a-z0-9]/g, "");
        return `
          <div class="category-four-col-card cat-card-${catSlug}" data-category="${cat.category}" role="button" tabindex="0" title="Tap to view ${cat.category} students">
            <div class="cat-card-header">
              <span class="category-dot cat-dot-${catSlug}"></span>
              <span class="cat-card-label">${cat.category}</span>
            </div>
            <div class="cat-card-count">${cat.count}</div>
          </div>
        `;
      }).join("");

      catGrid.querySelectorAll(".category-four-col-card").forEach(card => {
        card.addEventListener("click", () => {
          const catName = card.getAttribute("data-category");
          openStudentListView({ category: catName, title: `${catName} Category Students (${analytics.datasetLabel})` });
        });
      });
    }
  }
}

/**
 * Open Dedicated Student List View
 */
function openStudentListView({ search = "", className = "", gender = "", category = "", title = "" } = {}) {
  const datasetLabel = DATASET_LABELS[activeDataset] || "School Data";
  const finalTitle = title || (search
    ? `Search: "${search}" (${datasetLabel})`
    : (className ? `Class ${className} (${datasetLabel})` : (gender ? `${gender}s (${datasetLabel})` : (category ? `${category} Category (${datasetLabel})` : `All Students (${datasetLabel})`))));

  navigateSchoolPortal({
    view: "student-list",
    dataset: activeDataset,
    filters: { search, className, gender, category },
    title: finalTitle,
    scrollY: 0
  });
}

/**
 * Render Student Cards Feed in Dedicated List Screen
 */
function renderStudentListCards() {
  const container = document.getElementById("student-cards-feed");
  const countBadge = document.getElementById("student-list-count-badge");
  if (!container) return;

  const filtered = filterStudents(activeDataset, activeStudentListFilters);
  if (countBadge) {
    const countText = `${filtered.length} Student${filtered.length === 1 ? '' : 's'}`;
    const textEl = countBadge.querySelector(".count-val-text");
    if (textEl) {
      textEl.textContent = countText;
    } else {
      countBadge.textContent = countText;
    }
  }

  if (filtered.length === 0) {
    const allStudentsInDataset = getDatasetStudents(activeDataset);
    let emptyTitle = "No Students Found";
    let emptySubtitle = "No matching records found for the current search or filters.";

    if (allStudentsInDataset.length === 0) {
      emptyTitle = "No student data available.";
      if (activeDataset === "school_data") {
        emptySubtitle = "The master school student dataset has not been uploaded yet by Admin.";
      } else if (activeDataset === "udise") {
        emptySubtitle = "No weekly UDISE compliance dataset has been uploaded for this school.";
      } else if (activeDataset === "three_point_zero") {
        emptySubtitle = "No weekly 3.0 enrollment dataset has been uploaded for this school.";
      }
    }

    container.innerHTML = `
      <div class="student-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <h4 style="font-size: 0.95rem; font-weight: 700; color: #0f172a; margin-bottom: 4px;">${emptyTitle}</h4>
        <p style="font-size: 0.8rem; color: #64748b;">${emptySubtitle}</p>
      </div>
    `;
    return;
  }

  const currentSearchQuery = (activeStudentListFilters.search || "").trim();

  container.innerHTML = filtered.map(st => {
    const initial = (st.studentName || "S").substring(0, 1).toUpperCase();
    const displayClass = formatClassDisplay(st.className);

    // Highlight student name safely preserving casing
    const rawStudentName = st.studentName || 'Unnamed Student';
    const highlightedName = highlightSearchMatches(rawStudentName, currentSearchQuery);

    // Format dataset-specific identifier with highlighted matches if matching
    let idBadgeHtml = "";
    if (activeDataset === DATASET_KEYS.UDISE) {
      const penVal = st.penNo || st.udiseId || "";
      if (penVal) {
        const highlightedPen = highlightSearchMatches(penVal, currentSearchQuery);
        idBadgeHtml = `<span class="student-id-pill u-pen" title="Student PEN: ${escapeHtml(penVal)}">PEN: <strong>${highlightedPen}</strong></span>`;
      }
    } else if (activeDataset === DATASET_KEYS.THREE_POINT_ZERO) {
      const samagraVal = st.samagraId || st.samagraMemberId || "";
      if (samagraVal) {
        const highlightedSamagra = highlightSearchMatches(samagraVal, currentSearchQuery);
        idBadgeHtml = `<span class="student-id-pill u-samagra" title="Samagra ID: ${escapeHtml(samagraVal)}">Samagra: <strong>${highlightedSamagra}</strong></span>`;
      }
    } else {
      const scholarVal = st.scholarNo || "";
      if (scholarVal) {
        const highlightedScholar = highlightSearchMatches(scholarVal, currentSearchQuery);
        idBadgeHtml = `<span class="student-id-pill u-scholar" title="Scholar No: ${escapeHtml(scholarVal)}">Scholar: <strong>${highlightedScholar}</strong></span>`;
      }
    }

    // Highlight father name if present
    let fatherHtml = "";
    if (st.fatherName && st.fatherName !== "—") {
      const highlightedFather = highlightSearchMatches(st.fatherName, currentSearchQuery);
      fatherHtml = `<span>Father: ${highlightedFather}</span>`;
    }

    // Additional match indicators for other searchable fields (Mother Name, Roll No)
    let extraMatchHtml = "";
    if (currentSearchQuery) {
      const qLower = currentSearchQuery.toLowerCase();
      if (st.motherName && st.motherName.toLowerCase().includes(qLower)) {
        extraMatchHtml = `<span>Mother: ${highlightSearchMatches(st.motherName, currentSearchQuery)}</span>`;
      } else if (st.rollNo && String(st.rollNo).toLowerCase().includes(qLower)) {
        extraMatchHtml = `<span>Roll: ${highlightSearchMatches(String(st.rollNo), currentSearchQuery)}</span>`;
      }
    }

    const subParts = [];
    if (idBadgeHtml) subParts.push(idBadgeHtml);
    if (fatherHtml) subParts.push(fatherHtml);
    if (extraMatchHtml) subParts.push(extraMatchHtml);
    const subTextHtml = subParts.join('<span class="sub-sep">•</span>');

    return `
      <div class="student-card-item" data-id="${st.id}" role="button" tabindex="0">
        <div class="student-card-main">
          <div class="student-card-avatar">${initial}</div>
          <div class="student-card-details">
            <div class="student-card-name" title="${escapeHtml(rawStudentName)}">${highlightedName}</div>
            ${subTextHtml ? `<div class="student-card-sub">${subTextHtml}</div>` : ''}
          </div>
        </div>
        <div class="student-card-meta-group">
          <div class="student-cell student-cell-class">
            <span class="meta-label-mobile">Class</span>
            <span class="meta-pill class-pill">${displayClass || '—'}</span>
          </div>
          <div class="student-cell student-cell-gender">
            <span class="meta-label-mobile">Gender</span>
            <span class="meta-pill gender-pill">${st.gender || '—'}</span>
          </div>
          <div class="student-cell student-cell-cat">
            <span class="meta-label-mobile">Category</span>
            <span class="meta-pill cat-pill">${st.category || 'GEN'}</span>
          </div>
        </div>
        <div class="student-card-action">
          <span>View</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
      </div>
    `;
  }).join("");

  // Add click listeners to student card items
  container.querySelectorAll(".student-card-item").forEach(card => {
    card.addEventListener("click", () => {
      const studentId = card.getAttribute("data-id");
      openStudentDetailView(studentId);
    });
  });
}

/**
 * Open Dedicated Student Profile Screen Router
 */
function openStudentDetailView(studentId) {
  const student = getStudentById(activeDataset, studentId);
  if (!student) return;

  navigateSchoolPortal({
    view: "student-detail",
    studentId,
    dataset: activeDataset,
    filters: { ...activeStudentListFilters }
  });
}

/**
 * Render Student Profile Screen Details
 */
function renderStudentDetailContent(studentId) {
  const student = getStudentById(activeDataset, studentId);
  if (!student) return;

  activeDetailStudent = student;
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || "";
  };

  const initial = (student.studentName || "S").substring(0, 1).toUpperCase();
  setTxt("detail-avatar", initial);
  setTxt("detail-name", student.studentName || "Unnamed Student");
  setTxt("detail-dataset-badge", DATASET_LABELS[activeDataset] || "School Data");

  const classSectionEl = document.getElementById("detail-class-section");
  const genderEl = document.getElementById("detail-gender");
  const catEl = document.getElementById("detail-category");
  const statusEl = document.getElementById("detail-status");
  const sectionsContainer = document.getElementById("profile-sections-container");

  const normClass = normalizeClassLabel(student.className);

  if (activeDataset === DATASET_KEYS.UDISE) {
    // Requirements: Show ONLY Class, Name, Gender, Student PEN, Father Name, Social Category
    if (classSectionEl) {
      classSectionEl.style.display = "";
      classSectionEl.textContent = formatClassDisplay(student.className);
    }
    if (genderEl) {
      genderEl.style.display = "";
      genderEl.textContent = student.gender || "—";
    }
    if (catEl) {
      catEl.style.display = "";
      catEl.textContent = student.category || "GEN";
    }
    if (statusEl) {
      statusEl.style.display = "none";
    }

    if (sectionsContainer) {
      sectionsContainer.innerHTML = `
        <div class="profile-section-card" style="grid-column: 1 / -1; max-width: 680px; margin: 0 auto; width: 100%;">
          <div class="profile-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            <span>UDISE Student Details</span>
          </div>
          <div class="profile-field-list">
            <div class="profile-field-item"><span class="field-label">Class</span><span class="field-value">${normClass || '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Name</span><span class="field-value">${student.studentName || '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Gender</span><span class="field-value">${student.gender || '—'}</span></div>
            <div class="profile-field-item profile-field-highlight">
              <span class="field-label">Student PEN</span>
              <span class="field-value-id pen-highlight" title="Click to copy Student PEN">${student.penNo || student.udiseId || '—'}</span>
            </div>
            <div class="profile-field-item"><span class="field-label">Father Name</span><span class="field-value">${student.fatherName && student.fatherName !== '—' ? student.fatherName : '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Social Category</span><span class="field-value">${student.category || '—'}</span></div>
          </div>
        </div>
      `;
    }
  } else if (activeDataset === DATASET_KEYS.THREE_POINT_ZERO) {
    // Requirements: Show ONLY Class, Samagra ID, Student Name, Father Name, Category, Gender
    if (classSectionEl) {
      classSectionEl.style.display = "";
      classSectionEl.textContent = normClass ? `Class ${normClass}` : "Class —";
    }
    if (genderEl) {
      genderEl.style.display = "";
      genderEl.textContent = student.gender || "—";
    }
    if (catEl) {
      catEl.style.display = "";
      catEl.textContent = student.category || "GEN";
    }
    if (statusEl) {
      statusEl.style.display = "none";
    }

    if (sectionsContainer) {
      sectionsContainer.innerHTML = `
        <div class="profile-section-card" style="grid-column: 1 / -1; max-width: 680px; margin: 0 auto; width: 100%;">
          <div class="profile-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            <span>3.0 Student Details</span>
          </div>
          <div class="profile-field-list">
            <div class="profile-field-item"><span class="field-label">Class</span><span class="field-value">${normClass || '—'}</span></div>
            <div class="profile-field-item profile-field-highlight">
              <span class="field-label">Samagra ID</span>
              <span class="field-value-id samagra-highlight" title="Click to copy Samagra ID">${student.samagraId || student.samagraMemberId || '—'}</span>
            </div>
            <div class="profile-field-item"><span class="field-label">Student Name</span><span class="field-value">${student.studentName || '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Father Name</span><span class="field-value">${student.fatherName && student.fatherName !== '—' ? student.fatherName : '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Category</span><span class="field-value">${student.category || '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Gender</span><span class="field-value">${student.gender || '—'}</span></div>
          </div>
        </div>
      `;
    }
  } else {
    // Master School Data: Full comprehensive student profile
    if (classSectionEl) {
      classSectionEl.style.display = "";
      classSectionEl.textContent = `${normClass || 'Class'} • Sec ${student.section || 'A'}`;
    }
    if (genderEl) {
      genderEl.style.display = "";
      genderEl.textContent = student.gender || "—";
    }
    if (catEl) {
      catEl.style.display = "";
      catEl.textContent = student.category || "GEN";
    }
    if (statusEl) {
      statusEl.style.display = "";
      statusEl.textContent = student.status || "Active";
    }

    if (sectionsContainer) {
      sectionsContainer.innerHTML = `
        <!-- Section 1: Basic Details -->
        <div class="profile-section-card">
          <div class="profile-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <span>Basic Information</span>
          </div>
          <div class="profile-field-list">
            <div class="profile-field-item"><span class="field-label">Student Name</span><span class="field-value">${student.studentName || '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Date of Birth</span><span class="field-value">${student.dob || '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Gender</span><span class="field-value">${student.gender || '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Class & Section</span><span class="field-value">${formatClassDisplay(student.className)} (Sec ${student.section || 'A'})</span></div>
            <div class="profile-field-item"><span class="field-label">Roll Number</span><span class="field-value">${student.rollNo || '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Scholar / Reg. No</span><span class="field-value">${student.scholarNo || student.id || '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Admission Date</span><span class="field-value">${student.admissionDate || '—'}</span></div>
          </div>
        </div>

        <!-- Section 2: Parent Information -->
        <div class="profile-section-card">
          <div class="profile-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
            <span>Parent & Guardian Information</span>
          </div>
          <div class="profile-field-list">
            <div class="profile-field-item"><span class="field-label">Father's Name</span><span class="field-value">${student.fatherName || '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Mother's Name</span><span class="field-value">${student.motherName || '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Primary Contact</span><span class="field-value">${student.mobile || '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Residential Address</span><span class="field-value">${student.address || 'Campus Address'}</span></div>
          </div>
        </div>

        <!-- Section 3: Dataset Identifiers -->
        <div class="profile-section-card">
          <div class="profile-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
            <span>School Data Identifiers</span>
          </div>
          <div class="profile-field-list">
            <div class="profile-field-item"><span class="field-label">Internal Record ID</span><span class="field-value">${student.id}</span></div>
            <div class="profile-field-item"><span class="field-label">Samagra ID</span><span class="field-value">${student.samagraId || '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">PAN Number</span><span class="field-value">${student.panNo || '—'}</span></div>
            <div class="profile-field-item"><span class="field-label">Scholar Number</span><span class="field-value">${student.scholarNo || '—'}</span></div>
          </div>
        </div>
      `;
    }
  }
}

/**
 * ============================================================================
 * AGE CALCULATOR CONTROLLER
 * Mobile-First, Native PWA Age & Class Eligibility Calculation Engine
 * ============================================================================
 */
let dobPickerInstance = null;
let asofPickerInstance = null;

function initAgeCalculator() {
  const dobInput = document.getElementById("age-input-dob");
  const asofInput = document.getElementById("age-input-asof");
  const dobTrigger = document.getElementById("btn-trigger-dob");
  const asofTrigger = document.getElementById("btn-trigger-asof");
  const dobDisplay = document.getElementById("dob-display-val");
  const asofDisplay = document.getElementById("asof-display-val");
  const calcBtn = document.getElementById("btn-calculate-age");

  const currentYear = new Date().getFullYear();

  // 1. Create Date of Birth Picker instance
  if (dobInput && !dobPickerInstance) {
    dobPickerInstance = createDatePicker({
      inputEl: dobInput,
      triggerEl: dobTrigger,
      displayEl: dobDisplay,
      title: "Select Date of Birth",
      minYear: 1950,
      maxYear: currentYear, // DOB cannot be in the future
      defaultDate: new Date(2020, 6, 31),
      onCommit: () => {
        clearAgeInputErrors();
        // Hide previous results if user changes the date; user must tap Calculate
        const resultsArea = document.getElementById("age-calc-results-area");
        const emptyState = document.getElementById("age-calc-empty-state");
        if (resultsArea && resultsArea.style.display !== "none") {
          resultsArea.style.display = "none";
          if (emptyState) emptyState.style.display = "block";
        }
      }
    });
  }

  // 2. Create Calculate Age As Of Picker instance
  if (asofInput && !asofPickerInstance) {
    // Ensure default calculation date is strictly 31 July 2026
    if (!asofInput.value || asofInput.value === "2026-09-30") {
      asofInput.value = "2026-07-31";
    }

    asofPickerInstance = createDatePicker({
      inputEl: asofInput,
      triggerEl: asofTrigger,
      displayEl: asofDisplay,
      title: "Calculate Age As Of",
      minYear: 1950,
      maxYear: currentYear + 5, // Allow future eligibility planning
      defaultDate: new Date(2026, 6, 31),
      onCommit: () => {
        clearAgeInputErrors();
        // Hide previous results if user changes the date; user must tap Calculate
        const resultsArea = document.getElementById("age-calc-results-area");
        const emptyState = document.getElementById("age-calc-empty-state");
        if (resultsArea && resultsArea.style.display !== "none") {
          resultsArea.style.display = "none";
          if (emptyState) emptyState.style.display = "block";
        }
      }
    });
  }

  // 3. Primary Calculate Button
  if (calcBtn && !calcBtn.dataset.bound) {
    calcBtn.dataset.bound = "true";
    calcBtn.addEventListener("click", () => {
      executeAgeCalculation();
    });
  }
}

function clearAgeInputErrors() {
  const dobError = document.getElementById("dob-error-msg");
  const asofError = document.getElementById("asof-error-msg");
  if (dobError) {
    dobError.style.display = "none";
    dobError.textContent = "";
  }
  if (asofError) {
    asofError.style.display = "none";
    asofError.textContent = "";
  }
}

/**
 * Executes Age Calculation and Class Eligibility Assessment
 */
function executeAgeCalculation() {
  const dobInput = document.getElementById("age-input-dob");
  const asofInput = document.getElementById("age-input-asof");
  const dobError = document.getElementById("dob-error-msg");
  const asofError = document.getElementById("asof-error-msg");
  const resultsArea = document.getElementById("age-calc-results-area");
  const emptyState = document.getElementById("age-calc-empty-state");
  const resAgeVal = document.getElementById("res-student-age");
  const eligList = document.getElementById("eligibility-cards-list");

  clearAgeInputErrors();

  if (!dobInput || !dobInput.value) {
    if (dobError) {
      dobError.textContent = "Please select the student's Date of Birth.";
      dobError.style.display = "flex";
    }
    document.getElementById("btn-trigger-dob")?.focus();
    return;
  }

  const dobDate = parseDateSafe(dobInput.value);
  if (!dobDate) {
    if (dobError) {
      dobError.textContent = "Invalid Date of Birth format.";
      dobError.style.display = "flex";
    }
    return;
  }

  // Default editable general calculation date is strictly 31 July 2026
  const asofDate = parseDateSafe(asofInput ? asofInput.value : "2026-07-31");
  if (!asofDate) {
    if (asofError) {
      asofError.textContent = "Invalid calculation date format.";
      asofError.style.display = "flex";
    }
    return;
  }

  // Calculate General Student Age using user's chosen "Calculate Age As Of" date
  const generalAge = calculateExactAge(dobDate, asofDate);
  if (!generalAge || generalAge.isFuture) {
    if (dobError) {
      dobError.textContent = "Date of Birth cannot be after the calculation date.";
      dobError.style.display = "flex";
    }
    return;
  }

  // 1. Display Bold, Focused Student Age
  if (resAgeVal) {
    resAgeVal.textContent = `${generalAge.years} Years ${generalAge.months} Months ${generalAge.days} Days`;
  }
  const statYears = document.getElementById("stat-years");
  const statMonths = document.getElementById("stat-months");
  const statDays = document.getElementById("stat-days");
  if (statYears) statYears.textContent = generalAge.years;
  if (statMonths) statMonths.textContent = generalAge.months;
  if (statDays) statDays.textContent = generalAge.days;

  // 2. Evaluate Standard Class Eligibility
  // Rule:
  // - Nursery/KG1/KG2 strictly calculated as of 31 July 2026
  // - Class 1 strictly calculated as of 30 September 2026
  const eligibility = evaluateClassEligibility(dobDate);
  const eligContainer = document.getElementById("eligibility-container") || document.querySelector(".eligibility-container");

  if (eligList) {
    if (eligibility.allEligible.length === 0) {
      // User request: Only show Class Eligibility if student is eligible for a class
      if (eligContainer) eligContainer.style.display = "none";
      eligList.innerHTML = "";
    } else {
      if (eligContainer) eligContainer.style.display = "block";
      let cardsHtml = "";

      // Render Primary Class card first with clean, concise presentation
      if (eligibility.primary) {
        const p = eligibility.primary;
        cardsHtml += `
          <div class="eligibility-card is-primary">
            <div class="elig-card-header">
              <span class="elig-tag tag-primary">PRIMARY CLASS</span>
              <h3 class="elig-class-name">${p.className.toUpperCase()}</h3>
            </div>
            <div class="elig-details-grid">
              <div class="elig-detail-item">
                <span class="elig-detail-label">Student Age</span>
                <span class="elig-detail-value">${p.age.years} Years ${p.age.months} Months ${p.age.days} Days</span>
              </div>
              <div class="elig-detail-item">
                <span class="elig-detail-label">Calculated</span>
                <span class="elig-detail-value">${p.dateUsed}</span>
              </div>
            </div>
          </div>
        `;
      }

      // Render Also Eligible cards with identical clean format
      eligibility.alsoEligible.forEach(item => {
        cardsHtml += `
          <div class="eligibility-card is-also">
            <div class="elig-card-header">
              <span class="elig-tag tag-also">ALSO ELIGIBLE FOR</span>
              <h3 class="elig-class-name">${item.className.toUpperCase()}</h3>
            </div>
            <div class="elig-details-grid">
              <div class="elig-detail-item">
                <span class="elig-detail-label">Student Age</span>
                <span class="elig-detail-value">${item.age.years} Years ${item.age.months} Months ${item.age.days} Days</span>
              </div>
              <div class="elig-detail-item">
                <span class="elig-detail-label">Calculated</span>
                <span class="elig-detail-value">${item.dateUsed}</span>
              </div>
            </div>
          </div>
        `;
      });

      eligList.innerHTML = cardsHtml;
    }
  }

  // Reveal results smoothly and hide empty state
  if (emptyState) emptyState.style.display = "none";
  if (resultsArea) resultsArea.style.display = "block";

  // Smoothly scroll down so the results are clearly in view on mobile devices
  if (window.innerWidth <= 768) {
    resultsArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

