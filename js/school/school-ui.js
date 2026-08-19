import {
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
  syncPendingQueueToFirebase
} from "../session-manager.js";

import {
  STANDARD_SENIOR_SUBJECTS,
  validateClassRange,
  includesSeniorClasses
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

// Student Dashboard State
let activeDataset = DATASET_KEYS.SCHOOL_DATA;
let activeStudentListFilters = { search: "", className: "", gender: "", category: "" };
let activeDetailStudent = null;

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
 * Setup Manual Data Synchronization Action
 */
function setupManualSync() {
  const syncBtn = document.getElementById("manual-sync-btn");
  if (!syncBtn) return;

  syncBtn.addEventListener("click", async () => {
    syncBtn.disabled = true;
    syncBtn.innerHTML = `
      <span class="sync-spinner" style="width:11px; height:11px;"></span>
      <span>Syncing...</span>
    `;

    try {
      // 1. Process pending offline operations
      await syncPendingQueueToFirebase();

      // 2. Targeted single fetch for school and user records
      if (navigator.onLine && currentSchoolId) {
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

      renderSchoolHeaderInfo();
      renderSchoolInfoView();
      updateSchoolMetrics();
      renderSchoolUsersTable();
      renderSchoolSessionsTable();
      renderDatasetDashboard();

      showSchoolToast("Data synchronized successfully!", "success");
    } catch (err) {
      console.warn("Manual sync error:", err);
      showSchoolToast("Local cache up to date.", "info");
    } finally {
      syncBtn.disabled = false;
      syncBtn.innerHTML = `
        <svg style="width: 13px; height: 13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
        <span>Sync Data</span>
      `;
    }
  });
}

/**
 * Navigation View Router & Direct Dataset Link Handler
 */
function setupSchoolNavigation() {
  const navLinks = document.querySelectorAll(".nav-link");
  const views = document.querySelectorAll(".school-view");
  const titleEl = document.getElementById("page-view-title");

  const titles = {
    dashboard: "Dashboard",
    "student-list": "Student Records",
    "student-detail": "Student Profile",
    "school-info": "School Information",
    "school-users": "School Users",
    sessions: "Active Sessions",
    "student-data": "Student Data"
  };

  window.navigateSchoolView = (viewName) => {
    navLinks.forEach((l) => {
      const v = l.getAttribute("data-view");
      const ds = l.getAttribute("data-dataset");
      if (v === viewName) {
        l.classList.add("active");
      } else if (viewName === "student-list" && ds === activeDataset) {
        l.classList.add("active");
      } else {
        l.classList.remove("active");
      }
    });

    views.forEach((v) => {
      if (v.id === `view-${viewName}`) v.classList.add("active");
      else v.classList.remove("active");
    });

    if (titleEl) {
      titleEl.textContent = titles[viewName] || "School Portal";
    }

    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.remove("open");
  };

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const datasetKey = link.getAttribute("data-dataset");
      const targetView = link.getAttribute("data-view");

      if (datasetKey) {
        // Direct dataset navigation to student list
        switchDataset(datasetKey);
        openStudentListView({ title: `All Records (${DATASET_LABELS[datasetKey] || datasetKey})` });
        navLinks.forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
        const sidebar = document.getElementById("sidebar");
        if (sidebar) sidebar.classList.remove("open");
      } else if (targetView) {
        window.navigateSchoolView(targetView);
      }
    });
  });
}

/**
 * Real-Time Firestore Listeners Scoped Strictly to Current School
 */
function setupSchoolLiveListeners() {
  if (!currentSchoolId) return;

  // 1. Subscribe to School Entity Document
  const schoolDocRef = doc(db, "schools", currentSchoolId);
  unsubSchoolDoc = onSnapshot(schoolDocRef, (snap) => {
    if (snap.exists()) {
      currentSchoolEntity = snap.data();
      saveDocToCache("schools", currentSchoolId, currentSchoolEntity);
      renderSchoolHeaderInfo();
      renderSchoolInfoView();
      updateSchoolMetrics();
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
            payload: updateData
          });
          showSchoolToast("School info saved offline. Will sync when online.", "success");
        }
      } else {
        await enqueuePendingOp({
          collection: "schools",
          docId: currentSchoolId,
          action: "update",
          payload: updateData
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
  const addressInput = document.getElementById("edit-address");
  const startClassInput = document.getElementById("edit-start-class");
  const endClassInput = document.getElementById("edit-end-class");

  const startClass = school.startingClass || "Nursery";
  const endClass = school.endingClass || "Class 10";

  if (nameInput) nameInput.value = school.schoolName || school.name || "";
  if (logoInput) logoInput.value = school.logoUrl || "";
  if (emailInput) emailInput.value = school.adminEmail || currentSchoolAccount?.email || "";
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
  if (btn && sidebar) {
    btn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
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
  await loadSchoolDatasets(currentSchoolId, currentSchoolEntity || {});
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
  const triggerExplore = () => {
    const q = exploreInput ? exploreInput.value.trim() : "";
    const label = DATASET_LABELS[activeDataset] || "School Data";
    openStudentListView({ search: q, title: q ? `Search: "${q}" (${label})` : `All Records (${label})` });
  };

  if (exploreBtn) exploreBtn.addEventListener("click", triggerExplore);
  if (exploreInput) {
    exploreInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") triggerExplore();
    });
  }

  // 6. Navigation Back Buttons
  const backToDashBtn = document.getElementById("btn-back-to-dashboard");
  if (backToDashBtn) {
    backToDashBtn.addEventListener("click", () => {
      window.navigateSchoolView("dashboard");
    });
  }

  const backToListBtn = document.getElementById("btn-back-to-student-list");
  if (backToListBtn) {
    backToListBtn.addEventListener("click", () => {
      window.navigateSchoolView("student-list");
    });
  }

  // 7. Student List Toolbar Filters & Search
  const listSearch = document.getElementById("student-list-search-input");
  const listClear = document.getElementById("student-list-search-clear");
  const filterClass = document.getElementById("filter-class-select");
  const filterGender = document.getElementById("filter-gender-select");
  const filterCategory = document.getElementById("filter-category-select");

  if (listSearch) {
    listSearch.addEventListener("input", () => {
      activeStudentListFilters.search = listSearch.value;
      if (listClear) listClear.style.display = listSearch.value ? "block" : "none";
      renderStudentListCards();
    });
  }

  if (listClear) {
    listClear.addEventListener("click", () => {
      if (listSearch) listSearch.value = "";
      activeStudentListFilters.search = "";
      listClear.style.display = "none";
      renderStudentListCards();
    });
  }

  if (filterClass) {
    filterClass.addEventListener("change", (e) => {
      activeStudentListFilters.className = e.target.value;
      renderStudentListCards();
    });
  }

  if (filterGender) {
    filterGender.addEventListener("change", (e) => {
      activeStudentListFilters.gender = e.target.value;
      renderStudentListCards();
    });
  }

  if (filterCategory) {
    filterCategory.addEventListener("change", (e) => {
      activeStudentListFilters.category = e.target.value;
      renderStudentListCards();
    });
  }
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
            <span class="class-card-name">${c.className}</span>
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
          openStudentListView({ className, title: `${className} Students (${analytics.datasetLabel})` });
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
  activeStudentListFilters = { search, className, gender, category };

  const datasetLabel = DATASET_LABELS[activeDataset] || "School Data";
  const titleEl = document.getElementById("student-list-view-title");
  if (titleEl) {
    titleEl.textContent = title || `All Students (${datasetLabel})`;
  }

  // Sync toolbar input & selects
  const searchInput = document.getElementById("student-list-search-input");
  const clearBtn = document.getElementById("student-list-search-clear");
  if (searchInput) {
    searchInput.value = search;
    if (clearBtn) clearBtn.style.display = search ? "block" : "none";
  }

  // Populate Class filter dropdown options based on current dataset classes
  const classSelect = document.getElementById("filter-class-select");
  if (classSelect) {
    const analytics = calculateDatasetAnalytics(activeDataset);
    classSelect.innerHTML = `<option value="">All Classes</option>` + analytics.classList.map(c => `
      <option value="${c.className}" ${c.className === className ? "selected" : ""}>${c.className} (${c.count})</option>
    `).join("");
  }

  const genderSelect = document.getElementById("filter-gender-select");
  if (genderSelect) genderSelect.value = gender;

  const catSelect = document.getElementById("filter-category-select");
  if (catSelect) catSelect.value = category;

  renderStudentListCards();
  window.navigateSchoolView("student-list");
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
    countBadge.textContent = `${filtered.length} Student${filtered.length === 1 ? '' : 's'}`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="student-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <h4 style="font-size: 0.95rem; font-weight: 700; color: #0f172a; margin-bottom: 4px;">No Students Found</h4>
        <p style="font-size: 0.8rem; color: #64748b;">No matching records found for the current search or filters.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(st => {
    const initial = (st.studentName || "S").substring(0, 1).toUpperCase();
    const subText = st.fatherName ? `Father: ${st.fatherName}` : (st.scholarNo ? `ID: ${st.scholarNo}` : "");

    return `
      <div class="student-card-item" data-id="${st.id}" role="button" tabindex="0">
        <div class="student-card-main">
          <div class="student-card-avatar">${initial}</div>
          <div class="student-card-details">
            <div class="student-card-name">${st.studentName}</div>
            <div class="student-card-sub">${subText}</div>
          </div>
        </div>
        <div class="student-card-tags">
          <span class="meta-pill class-pill">${st.className || 'Class —'}</span>
          <span class="meta-pill gender-pill">${st.gender || '—'}</span>
          <span class="meta-pill cat-pill">${st.category || 'GEN'}</span>
        </div>
        <div class="student-card-chevron">
          <span>View</span>
          <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
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
 * Open Dedicated Student Profile Screen
 */
function openStudentDetailView(studentId) {
  const student = getStudentById(activeDataset, studentId);
  if (!student) return;

  activeDetailStudent = student;
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || "—";
  };

  const initial = (student.studentName || "S").substring(0, 1).toUpperCase();
  setTxt("detail-avatar", initial);
  setTxt("detail-name", student.studentName);
  setTxt("detail-class-section", `${student.className || 'Class'} • Sec ${student.section || 'A'}`);
  setTxt("detail-gender", student.gender || "—");
  setTxt("detail-category", student.category || "GEN");
  setTxt("detail-status", student.status || "Active");
  setTxt("detail-dataset-badge", DATASET_LABELS[activeDataset] || "School Data");

  // Section 1: Basic Information
  setTxt("detail-field-name", student.studentName);
  setTxt("detail-field-dob", student.dob || "—");
  setTxt("detail-field-gender", student.gender || "—");
  setTxt("detail-field-class", `${student.className || '—'} (Sec ${student.section || 'A'})`);
  setTxt("detail-field-roll", student.rollNo || "—");
  setTxt("detail-field-scholar", student.scholarNo || student.id || "—");
  setTxt("detail-field-admission", student.admissionDate || "—");

  // Section 2: Parent & Guardian
  setTxt("detail-field-father", student.fatherName || "—");
  setTxt("detail-field-mother", student.motherName || "—");
  setTxt("detail-field-parent-contact", student.mobile || "—");
  setTxt("detail-field-address", student.address || "Campus Address");

  // Section 3: Dataset-Specific Fields
  const datasetFieldsTitle = document.getElementById("detail-dataset-fields-title");
  const datasetFieldsContainer = document.getElementById("detail-dataset-fields-container");

  if (datasetFieldsTitle && datasetFieldsContainer) {
    if (activeDataset === DATASET_KEYS.SCHOOL_DATA) {
      datasetFieldsTitle.textContent = "School Data Identifiers";
      datasetFieldsContainer.innerHTML = `
        <div class="profile-field-item"><span class="field-label">Internal Record ID</span><span class="field-value">${student.id}</span></div>
        <div class="profile-field-item"><span class="field-label">Samagra ID</span><span class="field-value">${student.samagraId || '—'}</span></div>
        <div class="profile-field-item"><span class="field-label">PAN Number</span><span class="field-value">${student.panNo || '—'}</span></div>
        <div class="profile-field-item"><span class="field-label">Scholar Number</span><span class="field-value">${student.scholarNo || '—'}</span></div>
      `;
    } else if (activeDataset === DATASET_KEYS.UDISE) {
      datasetFieldsTitle.textContent = "UDISE National Identifiers";
      datasetFieldsContainer.innerHTML = `
        <div class="profile-field-item"><span class="field-label">National Student Code (PEN)</span><span class="field-value">${student.penNo || '—'}</span></div>
        <div class="profile-field-item"><span class="field-label">UDISE Student ID</span><span class="field-value">${student.udiseId || '—'}</span></div>
        <div class="profile-field-item"><span class="field-label">UDISE School Code</span><span class="field-value">${student.udiseSchoolCode || '—'}</span></div>
        <div class="profile-field-item"><span class="field-label">Aadhar Verification</span><span class="field-value">${student.aadharNo || '—'}</span></div>
      `;
    } else if (activeDataset === DATASET_KEYS.THREE_POINT_ZERO) {
      datasetFieldsTitle.textContent = "Portal 3.0 Government Identifiers";
      datasetFieldsContainer.innerHTML = `
        <div class="profile-field-item"><span class="field-label">Portal 3.0 Record ID</span><span class="field-value">${student.id}</span></div>
        <div class="profile-field-item"><span class="field-label">Samagra Member ID</span><span class="field-value">${student.samagraMemberId || '—'}</span></div>
        <div class="profile-field-item"><span class="field-label">Samagra Family ID</span><span class="field-value">${student.samagraFamilyId || '—'}</span></div>
        <div class="profile-field-item"><span class="field-label">Enrollment Status</span><span class="field-value">${student.status || 'Enrolled'}</span></div>
      `;
    }
  }

  window.navigateSchoolView("student-detail");
}
