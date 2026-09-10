import { auth } from "../firebase.js";
import {
  subscribeToSchools,
  subscribeToUsers,
  subscribeToSessions,
  subscribeToAdminLogs,
  saveSchoolAccount,
  updateSchool,
  toggleSchoolStatus as firestoreToggleSchoolStatus,
  permanentlyDeleteSchool,
  saveUserAccount,
  deleteUserAccount,
  terminateSession,
  terminateSchoolSessions,
  terminateUserSessions,
  getUserSessionHistory,
  enforceUserSessionRetention,
  cleanupOldSessions,
  uploadSchoolDataset,
  getSchoolDatasetSummaries
} from "./firestore-service.js";
import {
  parseAndValidateExcel,
  DATASET_KEYS,
  DATASET_LABELS,
  DATASET_SCHEMAS
} from "./excel-parser.js";
import {
  CANONICAL_CLASSES,
  STANDARD_SENIOR_SUBJECTS,
  validateClassRange,
  includesSeniorClasses
} from "../school-config.js";

/**
 * Super Admin UI Controller - High-Performance, Mobile-Web-App First Architecture
 */

// In-Memory Live State
let liveSchools = [];
let liveUsers = [];
let liveSessions = [];
let liveAdminLogs = [];
let currentView = "dashboard";
let selectedSchool = null;
let selectedUserForPerms = null;
let currentSchoolTab = "account";
let currentSettingsTab = "admin-profile";
let selectedSessionsSchoolFilter = "all";
let schoolToDeactivateId = null;
let userPendingDeleteUid = null;
let deleteUserStep = 1;
let currentUploadDataset = DATASET_KEYS.SCHOOL_DATA;
let selectedExcelFile = null;
let parsedStudentData = null;
let isUploadingDataset = false;

// Unsubscribe handles
let unsubSchools = null;
let unsubUsers = null;
let unsubSessions = null;
let unsubAdminLogs = null;

// Initialization flags
let isNavBound = false;
let isFormsBound = false;
let isDrawerBound = false;
let isSessionFilterBound = false;
let isDeactModalBound = false;

// Toast Engine
export function showToast(message, type = "success") {
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

import { resolveImageUrl, getSchoolLogoHtml } from "../image-resolver.js";
export { resolveImageUrl, getSchoolLogoHtml };

/**
 * Detect if a session represents the current browser device
 */
function isCurrentDeviceSession(ses) {
  const currentSessionId = localStorage.getItem("current_session_id") || sessionStorage.getItem("current_session_id");
  if (currentSessionId && (ses.sessionId === currentSessionId || ses.id === currentSessionId)) {
    return true;
  }
  return false;
}

/**
 * Get authoritative active sessions: strictly excludes inactive schools or inactive users
 */
function getAuthoritativeActiveSessions() {
  return liveSessions.filter((ses) => {
    if (ses.status !== "active") return false;

    // Verify school status
    const school = liveSchools.find((s) => s.schoolId === ses.schoolId);
    if (school && school.status === "Inactive") return false;

    // Verify user account status
    const user = liveUsers.find((u) => (u.firebaseUid || u.uid) === ses.userUid);
    if (user && user.status === "Inactive") return false;

    return true;
  });
}

/**
 * Initialize Super Admin UI (Called Once upon verified Super Admin authentication)
 */
export function initSuperAdminUI() {
  if (!isNavBound) {
    setupNavigation();
    isNavBound = true;
  }
  if (!isFormsBound) {
    setupForms();
    isFormsBound = true;
  }
  if (!isDrawerBound) {
    setupMobileDrawer();
    isDrawerBound = true;
  }
  if (!isSessionFilterBound) {
    setupSessionFilter();
    isSessionFilterBound = true;
  }
  if (!isDeactModalBound) {
    setupDeactivationModal();
    isDeactModalBound = true;
  }

  setupLiveListeners();
  populateAdminProfile();

  // Clean up session records older than 48 hours (1-2 days retention)
  try {
    cleanupOldSessions();
  } catch (e) {
    console.warn("Session cleanup routine error:", e);
  }
}

/**
 * Populate Super Admin Profile & Session Metadata
 */
function populateAdminProfile() {
  const user = auth.currentUser;
  if (!user) return;

  const email = user.email || "admin@portal.com";
  const name = email.split("@")[0].toUpperCase() || "SUPER ADMIN";
  const uid = user.uid || "FSe6FQsJrKaDVqqjcO4jv2EIkfp2";
  const lastLogin = user.metadata?.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Just now";
  const created = user.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "Configured";

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt("prof-admin-name", name);
  setTxt("prof-admin-email", email);
  setTxt("prof-admin-uid", uid);
  setTxt("prof-admin-last-login", lastLogin);
  setTxt("prof-admin-created", created);

  // Detect current client device metadata
  const ua = navigator.userAgent;
  let browser = "Web Browser";
  let os = "Desktop OS";

  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Google Chrome";
  else if (ua.includes("Edg")) browser = "Microsoft Edge";
  else if (ua.includes("Firefox")) browser = "Mozilla Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Apple Safari";

  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android Mobile";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS Mobile";

  setTxt("admin-current-browser", browser);
  setTxt("admin-current-os", os);
  setTxt("admin-current-login-time", lastLogin);
}

window.signoutOtherSessions = () => {
  showToast("All other concurrent administrator sessions have been invalidated.", "success");
};

/**
 * Setup Real-time Firestore Subscriptions with Immediate UI Synchronization
 */
function setupLiveListeners() {
  if (unsubSchools) unsubSchools();
  if (unsubUsers) unsubUsers();
  if (unsubSessions) unsubSessions();
  if (unsubAdminLogs) unsubAdminLogs();

  // 1. Subscribe to Schools
  unsubSchools = subscribeToSchools((schools) => {
    liveSchools = schools;
    updateMetrics();
    renderDashboardSchools();
    renderAllSchoolsView();
    renderAccountsView();
    renderAllSessionsView();
    populateSchoolDropdowns();
    populateActiveSessionsSchoolFilter();

    if (selectedSchool) {
      const refreshed = liveSchools.find((s) => s.schoolId === selectedSchool.schoolId);
      if (refreshed) {
        selectedSchool = refreshed;
        refreshSchoolDetailsView();
      }
    }
  });

  // 2. Subscribe to Users
  unsubUsers = subscribeToUsers((users) => {
    liveUsers = users;
    updateMetrics();
    renderDashboardSchools();
    renderAllSchoolsView();
    renderAccountsView();
    renderAllSessionsView();

    if (selectedSchool) {
      refreshSchoolDetailsView();
      renderSchoolUsersList(selectedSchool.schoolId);
    }
  });

  // 3. Subscribe to Active Device Sessions (authoritative realtime active sessions)
  unsubSessions = subscribeToSessions((sessions) => {
    liveSessions = sessions.filter((s) => s.status === "active");
    updateMetrics();
    renderDashboardSchools();
    renderAllSchoolsView();
    renderAccountsView();
    renderAllSessionsView();
    populateActiveSessionsSchoolFilter();

    if (selectedSchool) {
      refreshSchoolDetailsView();
      renderSchoolUsersList(selectedSchool.schoolId);
      renderSchoolSessionsList(selectedSchool.schoolId);
    }

    if (selectedUserForPerms) {
      renderUserModalSessions(selectedUserForPerms);
    }
  });

  // 4. Subscribe to Admin Audit Logs
  unsubAdminLogs = subscribeToAdminLogs((logs) => {
    liveAdminLogs = logs;
    renderAdminLogsView();
  });
}

/**
 * Primary Navigation Router
 */
function setupNavigation() {
  const navLinks = document.querySelectorAll(".nav-link");
  const views = document.querySelectorAll(".admin-view");
  const titleEl = document.getElementById("page-view-title");

  const titles = {
    dashboard: "Dashboard",
    schools: "Schools Management",
    accounts: "Accounts Directory",
    sessions: "Active Device Sessions",
    settings: "Admin Profile & Settings"
  };

  window.navigateView = (viewName) => {
    currentView = viewName;
    navLinks.forEach((l) => {
      if (l.getAttribute("data-view") === viewName) l.classList.add("active");
      else l.classList.remove("active");
    });

    views.forEach((v) => {
      if (v.id === `view-${viewName}`) v.classList.add("active");
      else v.classList.remove("active");
    });

    if (titleEl) {
      titleEl.textContent = titles[viewName] || "Admin Panel";
    }

    if (viewName === "settings") {
      populateAdminProfile();
    }

    // Close sidebar drawer on navigation
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.remove("open");

    // Sync mobile bottom nav active state
    const bottomNavItems = document.querySelectorAll(".bottom-nav-item");
    bottomNavItems.forEach((item) => {
      if (item.getAttribute("data-view") === viewName) item.classList.add("active");
      else item.classList.remove("active");
    });

    // Scroll to top on view change
    window.scrollTo(0, 0);
  };

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const target = link.getAttribute("data-view");
      if (target) window.navigateView(target);
    });
  });
}

/**
 * Secondary Sub-Navigation for Dedicated School Management Page
 */
window.switchSchoolTab = (tabName) => {
  currentSchoolTab = tabName;
  const parent = document.getElementById("view-school-details");
  if (!parent) return;

  const tabs = parent.querySelectorAll(".subnav-tab");
  const panes = parent.querySelectorAll(".school-tab-pane");

  tabs.forEach((t) => {
    if (t.getAttribute("data-tab") === tabName) t.classList.add("active");
    else t.classList.remove("active");
  });

  panes.forEach((p) => {
    if (p.id === `school-tab-${tabName}`) p.classList.add("active");
    else p.classList.remove("active");
  });

  if (tabName === "student-data" && selectedSchool) {
    updateStudentUploadModule(selectedSchool);
  }
};

/**
 * Secondary Sub-Navigation for Admin Settings / Profile
 */
window.switchSettingsTab = (tabName) => {
  currentSettingsTab = tabName;
  const parent = document.getElementById("view-settings");
  if (!parent) return;

  const tabs = parent.querySelectorAll(".subnav-tab");
  const panes = parent.querySelectorAll(".school-tab-pane");

  tabs.forEach((t) => {
    if (t.getAttribute("data-tab") === tabName) t.classList.add("active");
    else t.classList.remove("active");
  });

  panes.forEach((p) => {
    if (p.id === `settings-tab-${tabName}`) p.classList.add("active");
    else p.classList.remove("active");
  });
};

/**
 * Top Metric Summary Cards (Authoritative counts)
 */
function updateMetrics() {
  const totalSchools = liveSchools.length;
  const activeSchools = liveSchools.filter((s) => s.status === "Active").length;
  const inactiveSchools = liveSchools.filter((s) => s.status === "Inactive").length;
  const authActiveSessions = getAuthoritativeActiveSessions();
  const activeSessionsCount = authActiveSessions.length;

  // Real data metrics across active institutions
  const totalStudents = liveSchools.reduce((acc, s) => acc + (Number(s.studentsCount) || 0), 0);
  const activeUsers = liveUsers.filter((u) => u.status === "Active").length;
  const pendingActions = inactiveSchools + liveUsers.filter((u) => u.status === "Inactive").length;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = (typeof val === "number" ? val.toLocaleString() : val);
  };

  // Modern Mobile System Overview Metrics
  setVal("metric-total-schools", totalSchools);
  setVal("metric-total-students", totalStudents);
  setVal("metric-active-users", activeUsers);
  setVal("metric-pending-actions", pendingActions);

  // Legacy/Secondary element fallbacks
  setVal("metric-active-schools", activeSchools);
  setVal("metric-inactive-schools", inactiveSchools);
  setVal("metric-active-sessions", activeSessionsCount);

  const totalSessionsCountEl = document.getElementById("sessions-total-count");
  if (totalSessionsCountEl) totalSessionsCountEl.textContent = activeSessionsCount;
}

/**
 * View 1: Render Schools on Dashboard (Primary Management Focus, No Raw Firebase UID)
 */
function renderDashboardSchools(filteredList = null) {
  const tbody = document.getElementById("dashboard-schools-tbody");
  if (!tbody) return;

  const list = filteredList || liveSchools;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-box">
            <svg class="empty-box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"></path><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path></svg>
            <h3>No schools configured yet</h3>
            <p>Add your first school institution to manage its credentials, users, and live active device sessions.</p>
            <button class="btn btn-primary btn-sm" onclick="window.openAddAccountModal('school')">+ Add School Account</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const authSessions = getAuthoritativeActiveSessions();

  tbody.innerHTML = list.map((s) => {
    const additionalUsersCount = liveUsers.filter((u) => u.schoolId === s.schoolId && u.type !== "school").length;
    const schoolSessionsCount = s.status === "Inactive" ? 0 : authSessions.filter((ses) => ses.schoolId === s.schoolId).length;
    const logoHtml = getSchoolLogoHtml(s.logoUrl, s.schoolName || s.name, "school-avatar-md");

    return `
      <tr>
        <td data-label="School">
          <div style="display: flex; align-items: center; gap: 12px;">
            ${logoHtml}
            <div>
              <div style="font-weight: 700; color: var(--text-main); font-size: 0.925rem;">${s.schoolName || s.name}</div>
              <div style="font-size: 0.775rem; color: var(--text-muted);">${s.adminEmail || 'No contact email'}</div>
            </div>
          </div>
        </td>
        <td data-label="School ID"><strong style="color: var(--primary); font-size: 0.85rem;">${s.schoolId}</strong></td>
        <td data-label="Phone"><span style="font-size: 0.825rem; color: var(--text-main); font-weight: 500;">${s.phoneNumber || s.phone || '—'}</span></td>
        <td data-label="Status">
          <span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}">
            ${s.status || 'Active'}
          </span>
        </td>
        <td data-label="Users"><span style="font-size: 0.85rem; font-weight: 600;">${additionalUsersCount} Users</span></td>
        <td data-label="Sessions">
          <span class="badge ${schoolSessionsCount > 0 ? 'badge-active' : 'badge-inactive'}">
            ${schoolSessionsCount} Active
          </span>
        </td>
        <td data-label="Updated"><span style="font-size: 0.8rem; color: var(--text-muted);">${s.lastUpdated || 'Recently'}</span></td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="window.openSchoolDetails('${s.schoolId}')">
            Manage School &rarr;
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * View 2: All Schools Directory (Clean, Responsive)
 */
function renderAllSchoolsView(filteredList = null) {
  const tbody = document.getElementById("all-schools-tbody");
  if (!tbody) return;

  const list = filteredList || liveSchools;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="8"><div class="empty-box"><h3>No schools found</h3></div></td></tr>
    `;
    return;
  }

  const authSessions = getAuthoritativeActiveSessions();

  tbody.innerHTML = list.map((s) => {
    const additionalUsersCount = liveUsers.filter((u) => u.schoolId === s.schoolId && u.type !== "school").length;
    const schoolSessionsCount = s.status === "Inactive" ? 0 : authSessions.filter((ses) => ses.schoolId === s.schoolId).length;
    const logoHtml = getSchoolLogoHtml(s.logoUrl, s.schoolName || s.name, "school-avatar-md");

    return `
      <tr>
        <td data-label="School">
          <div style="display: flex; align-items: center; gap: 12px;">
            ${logoHtml}
            <span style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">${s.schoolName || s.name}</span>
          </div>
        </td>
        <td data-label="School ID"><strong style="color: var(--primary);">${s.schoolId}</strong></td>
        <td data-label="Phone"><span style="font-size: 0.825rem; color: var(--text-main); font-weight: 500;">${s.phoneNumber || s.phone || '—'}</span></td>
        <td data-label="Status">
          <span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}">
            ${s.status || 'Active'}
          </span>
        </td>
        <td data-label="Users"><span style="font-size: 0.85rem; font-weight: 600;">${additionalUsersCount} Users</span></td>
        <td data-label="Devices">
          <span class="badge ${schoolSessionsCount > 0 ? 'badge-active' : 'badge-inactive'}">
            ${schoolSessionsCount} Active
          </span>
        </td>
        <td data-label="Address"><span style="font-size: 0.825rem; color: var(--text-muted);">${s.address || 'Campus Address'}</span></td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="window.openSchoolDetails('${s.schoolId}')">Open School</button>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * View 4: Accounts View (Configured Firebase Accounts)
 */
function renderAccountsView() {
  const tbody = document.getElementById("accounts-all-tbody");
  if (!tbody) return;

  if (liveUsers.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="7"><div class="empty-box"><h3>No configured accounts</h3><p>Register existing Firebase Authentication accounts as School Accounts or Users.</p></div></td></tr>
    `;
    return;
  }

  const authSessions = getAuthoritativeActiveSessions();

  tbody.innerHTML = liveUsers.map((acc) => {
    const isSchoolAccount = acc.type === "school";
    const parentSchool = liveSchools.find((s) => s.schoolId === acc.schoolId);
    const schoolName = parentSchool ? parentSchool.schoolName : acc.schoolId;
    const activeSessions = (acc.status === "Inactive" || parentSchool?.status === "Inactive")
      ? 0
      : authSessions.filter((ses) => ses.userUid === (acc.firebaseUid || acc.uid)).length;
    const limit = acc.deviceLimit || 3;

    return `
      <tr>
        <td data-label="Account">
          <div style="font-weight: 700; color: var(--text-main);">${acc.displayName || acc.name}</div>
          <div style="font-size: 0.725rem; color: var(--text-muted);">${acc.email || 'No email'}</div>
        </td>
        <td data-label="Type">
          <span class="badge" style="${isSchoolAccount ? 'background:#e0f2fe; color:#0369a1; border: 1px solid #bae6fd;' : 'background:#f3e8ff; color:#7e22ce; border: 1px solid #ddd6fe;'}">
            ${isSchoolAccount ? 'School Account' : 'User Account'}
          </span>
        </td>
        <td data-label="School"><span style="font-size: 0.85rem; font-weight: 600; color: var(--primary);">${schoolName}</span></td>
        <td data-label="Status">
          <span class="badge ${acc.status === 'Active' ? 'badge-active' : 'badge-inactive'}">
            ${acc.status || 'Active'}
          </span>
        </td>
        <td data-label="Devices">
          <span style="font-size: 0.85rem; font-weight: 600; color: ${activeSessions >= limit ? '#dc2626' : '#2563eb'};">
            ${activeSessions} / ${limit} Devices
          </span>
        </td>
        <td style="text-align: right;">
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="window.openEditUserPermsModal('${acc.firebaseUid || acc.uid}')">
              Manage
            </button>
            ${!isSchoolAccount ? `<button class="btn btn-danger-outline btn-sm" onclick="window.openDeleteUserModal('${acc.firebaseUid || acc.uid}')">Delete</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * Setup Active Sessions School Filter
 */
function setupSessionFilter() {
  const filterSelect = document.getElementById("sessions-school-filter");
  if (filterSelect) {
    filterSelect.addEventListener("change", (e) => {
      selectedSessionsSchoolFilter = e.target.value;
      renderAllSessionsView();
    });
  }
}

/**
 * Populate Active Sessions School Filter Dropdown
 */
function populateActiveSessionsSchoolFilter() {
  const filterSelect = document.getElementById("sessions-school-filter");
  if (!filterSelect) return;

  const authSessions = getAuthoritativeActiveSessions();
  const totalActive = authSessions.length;
  let optionsHtml = `<option value="all" ${selectedSessionsSchoolFilter === 'all' ? 'selected' : ''}>All Schools (${totalActive} Active)</option>`;

  liveSchools.forEach((school) => {
    const schoolSessionsCount = school.status === "Inactive" ? 0 : authSessions.filter((ses) => ses.schoolId === school.schoolId).length;
    const isSelected = selectedSessionsSchoolFilter === school.schoolId ? "selected" : "";
    optionsHtml += `<option value="${school.schoolId}" ${isSelected}>${school.schoolName || school.name} (${schoolSessionsCount} Active)</option>`;
  });

  filterSelect.innerHTML = optionsHtml;
}

/**
 * View 5: Dedicated Active Sessions Monitoring Page with School-Wise Filtering & Current Device Badging
 */
function renderAllSessionsView() {
  const tbody = document.getElementById("sessions-all-tbody");
  if (!tbody) return;

  const authSessions = getAuthoritativeActiveSessions();
  let filteredSessions = authSessions;
  if (selectedSessionsSchoolFilter && selectedSessionsSchoolFilter !== "all") {
    filteredSessions = authSessions.filter((ses) => ses.schoolId === selectedSessionsSchoolFilter);
  }

  if (filteredSessions.length === 0) {
    const emptyMsg = selectedSessionsSchoolFilter === "all"
      ? "No active device sessions currently connected across any school."
      : `No active device sessions currently connected for this selected school.`;

    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 36px;">
          <div class="empty-box">
            <svg class="empty-box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="12" x="3" y="4" rx="2"></rect><line x1="2" y1="20" x2="22" y2="20"></line></svg>
            <h3>${emptyMsg}</h3>
            <p>When schools or staff log in through their portal, active sessions appear here in real-time.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredSessions.map((ses) => {
    const parentSchool = liveSchools.find((s) => s.schoolId === ses.schoolId);
    const schoolName = parentSchool ? parentSchool.schoolName : (ses.schoolId || 'Unknown School');
    const userObj = liveUsers.find((u) => (u.firebaseUid || u.uid) === ses.userUid);
    const deviceLimit = userObj ? (userObj.deviceLimit || 3) : 3;
    const userActiveCount = authSessions.filter((s) => s.userUid === ses.userUid).length;
    const isCurrent = isCurrentDeviceSession(ses);

    return `
      <tr>
        <td data-label="School">
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.875rem;">${schoolName}</div>
        </td>
        <td data-label="User">
          <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main);">${userObj ? (userObj.displayName || userObj.name) : (ses.userName || 'School User')}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${userObj?.email || ses.userEmail || ''}</div>
        </td>
        <td data-label="Device">
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">${ses.deviceName || 'Web Browser'}</div>
          ${isCurrent ? '<span class="badge" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; font-size:0.675rem; font-weight:700;">Current Device</span>' : ''}
        </td>
        <td data-label="Login"><span style="font-size: 0.8rem; color: var(--text-muted);">${ses.formattedLoginTime || 'Active'}</span></td>
        <td data-label="Last Active"><span style="font-size: 0.8rem; color: var(--text-muted);">${ses.formattedLastActive || 'Now'}</span></td>
        <td data-label="Devices">
          <span style="font-size: 0.85rem; font-weight: 600; color: ${userActiveCount >= deviceLimit ? '#dc2626' : '#2563eb'};">
            ${userActiveCount} / ${deviceLimit}
          </span>
        </td>
        <td data-label="Status"><span class="badge badge-active">Active</span></td>
        <td style="text-align: right;">
          <button class="btn btn-danger-outline btn-sm" onclick="window.forceLogoutSession('${ses.sessionId || ses.id}')">
            Force Logout
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * View 6: Render Real-Time Administrative Audit Records
 */
function renderAdminLogsView(filteredList = null) {
  const tbody = document.getElementById("admin-logs-tbody");
  if (!tbody) return;

  const list = filteredList || liveAdminLogs;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 32px;">
          No audit records logged yet. Administrative actions will automatically be recorded here.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map((log) => `
    <tr>
      <td data-label="Action">
        <span class="badge" style="background: #f8fafc; color: var(--text-main); border: 1px solid var(--border); font-weight: 700;">
          ${log.action || 'Admin Action'}
        </span>
      </td>
      <td data-label="Target"><strong style="color: var(--primary); font-size: 0.875rem;">${log.target || '—'}</strong></td>
      <td data-label="Details"><span style="font-size: 0.825rem; color: var(--text-body);">${log.details || 'Success'}</span></td>
      <td data-label="Admin"><span style="font-size: 0.775rem; color: var(--text-muted);">${log.admin || 'Super Admin'}</span></td>
      <td data-label="Time"><span style="font-size: 0.775rem; color: var(--text-muted);">${log.formattedTime || 'Just now'}</span></td>
    </tr>
  `).join("");
}

/**
 * Dedicated School Management Page Controller
 */
window.openSchoolDetails = (schoolId) => {
  const school = liveSchools.find((s) => s.schoolId === schoolId);
  if (!school) return;

  selectedSchool = school;
  refreshSchoolDetailsView();
  window.switchSchoolTab("account");

  window.navigateView("school-details");
  const titleEl = document.getElementById("page-view-title");
  if (titleEl) titleEl.textContent = `School: ${school.schoolName || school.name}`;
};

/**
 * Two-Step School Deactivation Confirmation Handler
 */
function setupDeactivationModal() {
  const confirmBtn = document.getElementById("confirm-deactivate-school-btn");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      if (!schoolToDeactivateId) return;
      const sid = schoolToDeactivateId;
      closeModal("modal-confirm-deactivate-school");
      await window.executeToggleSchoolStatus(sid, "Active");
      schoolToDeactivateId = null;
    });
  }
}

/**
 * Open Double-Confirmation Modal for Deleting School User
 */
window.openDeleteUserModal = (userUid) => {
  if (!navigator.onLine) {
    showToast("Cannot delete user while offline. Please check your internet connection.", "error");
    return;
  }

  const user = liveUsers.find((u) => (u.firebaseUid || u.uid) === userUid);
  if (!user) {
    showToast("User not found.", "error");
    return;
  }

  userPendingDeleteUid = userUid;
  deleteUserStep = 1;

  renderDeleteUserModalContent(user);
  openModal("modal-delete-user");
};

function renderDeleteUserModalContent(user) {
  const titleEl = document.getElementById("del-user-modal-title");
  const bodyEl = document.getElementById("del-user-modal-body");
  const footerEl = document.getElementById("del-user-modal-footer");
  if (!bodyEl || !footerEl) return;

  const displayName = user?.displayName || user?.name || user?.email || "School User";
  const userEmail = user?.email ? ` (${user.email})` : "";
  const schoolName = user?.schoolId || "";

  if (deleteUserStep === 1) {
    if (titleEl) titleEl.textContent = "Delete School User";
    bodyEl.innerHTML = `
      <p style="font-size: 0.9rem; color: var(--text-main); font-weight: 600; margin-bottom: 8px;">
        Are you sure you want to delete <span style="font-weight: 800; color: #dc2626;">${displayName}${userEmail}</span>?
      </p>
      <p style="font-size: 0.825rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 14px;">
        This will remove the user account under <strong>School ID: ${schoolName}</strong>, revoke institutional access, and terminate all active sessions connected under this account.
      </p>
    `;
    footerEl.innerHTML = `
      <button type="button" class="btn btn-secondary" onclick="window.closeModal('modal-delete-user')">Cancel</button>
      <button type="button" class="btn btn-danger" id="confirm-delete-user-btn">Confirm</button>
    `;
  } else if (deleteUserStep === 2) {
    if (titleEl) titleEl.textContent = "Final Confirmation: Permanent Deletion";
    bodyEl.innerHTML = `
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;">
        <p style="font-size: 0.875rem; color: #991b1b; font-weight: 700; margin-bottom: 6px;">
          ⚠️ This action is permanent and cannot be undone.
        </p>
        <p style="font-size: 0.825rem; color: #7f1d1d; line-height: 1.5; margin: 0;">
          Are you completely certain you want to permanently delete <strong>${displayName}</strong>? All active and historical session records will be purged immediately.
        </p>
      </div>
      <p style="font-size: 0.8rem; color: var(--text-muted);">Click below to permanently execute deletion.</p>
    `;
    footerEl.innerHTML = `
      <button type="button" class="btn btn-secondary" onclick="window.closeModal('modal-delete-user')">Cancel</button>
      <button type="button" class="btn btn-danger" id="confirm-delete-user-btn">
        <span class="btn-spinner" style="display: none;"></span>
        <span class="btn-text">Confirm Delete</span>
      </button>
    `;
  }

  // Re-bind click event
  const confirmBtn = document.getElementById("confirm-delete-user-btn");
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      if (deleteUserStep === 1) {
        deleteUserStep = 2;
        renderDeleteUserModalContent(user);
      } else if (deleteUserStep === 2) {
        if (!navigator.onLine) {
          showToast("Network disconnected. Deletion halted.", "error");
          closeModal("modal-delete-user");
          return;
        }

        const btnText = confirmBtn.querySelector(".btn-text");
        const btnSpinner = confirmBtn.querySelector(".btn-spinner");
        if (btnText) btnText.textContent = "Deleting...";
        if (btnSpinner) btnSpinner.style.display = "inline-block";
        confirmBtn.disabled = true;

        try {
          await deleteUserAccount(userPendingDeleteUid);

          // Optimistically update local in-memory state
          const targetUid = userPendingDeleteUid;
          const deletedUser = liveUsers.find((u) => (u.firebaseUid || u.uid) === targetUid);
          liveUsers = liveUsers.filter((u) => (u.firebaseUid || u.uid) !== targetUid);
          liveSessions = liveSessions.filter((ses) => ses.userUid !== targetUid);

          if (deletedUser?.schoolId) {
            const sch = liveSchools.find((s) => s.schoolId === deletedUser.schoolId);
            if (sch && sch.usersCount > 0) sch.usersCount--;
          }

          closeModal("modal-delete-user");
          showToast(`User ${displayName} deleted successfully!`, "success");

          // Re-render relevant views
          if (currentView === "school-details" && selectedSchool) {
            renderSchoolUsersTab(selectedSchool.schoolId);
            renderSchoolSessionsList(selectedSchool.schoolId);
          }
          renderAccountsView();
          renderDashboardSchools();
          renderAllSchoolsView();
          updateMetrics();
        } catch (delErr) {
          console.error("Delete user error:", delErr);
          showToast("Failed to delete user: " + (delErr.message || "Network error"), "error");
          closeModal("modal-delete-user");
        } finally {
          userPendingDeleteUid = null;
          deleteUserStep = 1;
        }
      }
    };
  }
}

/**
 * Open two-step confirmation for school deactivation
 */
window.openConfirmDeactivateSchool = (schoolId) => {
  const school = liveSchools.find((s) => s.schoolId === schoolId);
  if (!school) return;

  schoolToDeactivateId = schoolId;
  const nameEl = document.getElementById("deact-school-name");
  if (nameEl) nameEl.textContent = `${school.schoolName || school.name} (${school.schoolId})`;

  openModal("modal-confirm-deactivate-school");
};

/**
 * Immediate, Authoritative Status Toggle with Optimistic UI & Revert on Error
 */
window.executeToggleSchoolStatus = async (schoolId, currentStatus) => {
  const school = liveSchools.find((s) => s.schoolId === schoolId);
  if (!school) return;

  const oldStatus = currentStatus || school.status || "Active";
  const newStatus = oldStatus === "Active" ? "Inactive" : "Active";

  // 1. Optimistically update local in-memory state immediately
  school.status = newStatus;
  if (selectedSchool && selectedSchool.schoolId === schoolId) {
    selectedSchool.status = newStatus;
  }

  // Also update primary school account status in local state
  const primaryAccount = liveUsers.find((u) => u.schoolId === schoolId && u.type === "school");
  if (primaryAccount) {
    primaryAccount.status = newStatus;
  }

  // If deactivating, optimistically drop all sessions for this school from live view immediately
  let preservedSessions = [];
  if (newStatus === "Inactive") {
    preservedSessions = liveSessions.filter((s) => s.schoolId === schoolId);
    liveSessions = liveSessions.filter((s) => s.schoolId !== schoolId);
  }

  // 2. Immediately re-render all relevant views
  updateMetrics();
  renderDashboardSchools();
  renderAllSchoolsView();
  renderAccountsView();
  renderAllSessionsView();
  refreshSchoolDetailsView();

  // 3. Write to Firestore
  try {
    await firestoreToggleSchoolStatus(schoolId, oldStatus, school.firebaseUid);
    showToast(`School ${school.schoolName || schoolId} status changed to ${newStatus}.`, "success");
  } catch (err) {
    console.error("Failed to toggle school status in Firebase:", err);
    // Revert local state on error
    school.status = oldStatus;
    if (selectedSchool && selectedSchool.schoolId === schoolId) {
      selectedSchool.status = oldStatus;
    }
    if (primaryAccount) {
      primaryAccount.status = oldStatus;
    }
    if (newStatus === "Inactive" && preservedSessions.length > 0) {
      liveSessions.push(...preservedSessions);
    }
    updateMetrics();
    renderDashboardSchools();
    renderAllSchoolsView();
    renderAccountsView();
    renderAllSessionsView();
    refreshSchoolDetailsView();
    showToast("Failed to update school status in database.", "error");
  }
};

function refreshSchoolDetailsView() {
  if (!selectedSchool) return;
  const s = selectedSchool;

  const avatarEl = document.getElementById("sd-avatar");
  if (avatarEl) {
    avatarEl.innerHTML = getSchoolLogoHtml(s.logoUrl, s.schoolName || s.name, "school-avatar-lg");
  }

  const setText = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  setText("sd-name", s.schoolName || s.name);
  setText("sd-id", s.schoolId);
  setText("sd-admin-email", s.adminEmail || "No admin contact");

  // Tab 1: Primary School Account Data
  const schoolAccount = liveUsers.find((u) => (u.firebaseUid && u.firebaseUid === s.firebaseUid) || (u.type === "school" && u.schoolId === s.schoolId));
  const authSessions = getAuthoritativeActiveSessions();
  const schoolAccountActiveSessions = (s.status === "Inactive" || schoolAccount?.status === "Inactive")
    ? 0
    : authSessions.filter((ses) => ses.userUid === s.firebaseUid).length;
  const schoolDevLimit = schoolAccount?.deviceLimit || 3;
  const schoolTotalActiveSessions = s.status === "Inactive" ? 0 : authSessions.filter((ses) => ses.schoolId === s.schoolId).length;

  setText("sd-header-sessions-count", schoolTotalActiveSessions);

  // Update School Status Badge
  const statusBadge = document.getElementById("sd-status-badge");
  if (statusBadge) {
    statusBadge.className = `badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}`;
    statusBadge.textContent = `School: ${s.status || 'Active'}`;
  }

  // Update Primary Login Status Badge
  const loginStatusBadge = document.getElementById("sd-login-status-badge");
  if (loginStatusBadge) {
    const isLoginActive = schoolAccount?.status !== "Inactive" && s.status === "Active";
    loginStatusBadge.className = `badge ${isLoginActive ? 'badge-active' : 'badge-inactive'}`;
    loginStatusBadge.textContent = `Login: ${schoolAccount?.status || s.status || 'Active'}`;
  }

  setText("sa-display-name", schoolAccount?.displayName || `${s.schoolName || s.name} (Primary Account)`);
  setText("sa-email", schoolAccount?.email || s.adminEmail || "None");
  setText("sa-uid", s.firebaseUid || "None");
  setText("sa-device-limit", `${schoolDevLimit} Concurrent Devices Allowed`);
  setText("sa-active-devices", `${schoolAccountActiveSessions} / ${schoolDevLimit} Devices Active`);

  const saStatusBadge = document.getElementById("sa-status");
  if (saStatusBadge) {
    saStatusBadge.innerHTML = `<span class="badge ${schoolAccount?.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${schoolAccount?.status || s.status || 'Active'}</span>`;
  }

  const saPermsContainer = document.getElementById("sa-permissions-display");
  if (saPermsContainer) {
    const p = schoolAccount?.permissions || { editable: true, addStudent: true, deleteStudent: true, excelExport: true, reports: true };
    saPermsContainer.innerHTML = `
      <span class="badge ${p.editable ? 'badge-active' : 'badge-inactive'}">Editable: ${p.editable ? 'ON' : 'OFF'}</span>
      <span class="badge ${p.addStudent ? 'badge-active' : 'badge-inactive'}">Add Student: ${p.addStudent ? 'ON' : 'OFF'}</span>
      <span class="badge ${p.deleteStudent ? 'badge-active' : 'badge-inactive'}">Delete Student: ${p.deleteStudent ? 'ON' : 'OFF'}</span>
      <span class="badge ${p.excelExport ? 'badge-active' : 'badge-inactive'}">Excel Export: ${p.excelExport ? 'ON' : 'OFF'}</span>
      <span class="badge ${p.reports ? 'badge-active' : 'badge-inactive'}">Reports: ${p.reports ? 'ON' : 'OFF'}</span>
    `;
  }

  const manageSchoolAccountBtn = document.getElementById("sd-manage-account-btn");
  if (manageSchoolAccountBtn && s.firebaseUid) {
    manageSchoolAccountBtn.onclick = () => window.openEditUserPermsModal(s.firebaseUid);
  }

  // Tab 2: Overview Tab Data
  setText("info-school-name", s.schoolName || s.name);
  setText("info-school-id", s.schoolId);
  setText("info-school-uid", s.firebaseUid || "Not assigned");
  setText("info-school-status", s.status || "Active");
  setText("info-school-email", s.adminEmail || "None");
  setText("info-school-phone", s.phoneNumber || s.phone || "—");
  setText("info-school-address", s.address || "Campus Address");
  setText("info-school-logourl", s.logoUrl || "None configured");
  
  // Tab 5: Student Data Upload State
  updateStudentUploadModule(s);

  const startCls = s.startingClass || "Nursery";
  const endCls = s.endingClass || "Class 10";
  setText("info-school-class-range", `${startCls} → ${endCls}`);

  const subjectsContainer = document.getElementById("info-school-subjects-container");
  const subjectsList = document.getElementById("info-school-subjects-list");
  if (subjectsContainer && subjectsList) {
    if (includesSeniorClasses(startCls, endCls) && Array.isArray(s.subjects) && s.subjects.length > 0) {
      subjectsContainer.style.display = "block";
      subjectsList.innerHTML = s.subjects.map(sub => `
        <span class="badge" style="background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; font-size: 0.725rem; padding: 2px 8px;">${sub}</span>
      `).join("");
    } else if (includesSeniorClasses(startCls, endCls)) {
      subjectsContainer.style.display = "block";
      subjectsList.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-muted);">No specific subjects configured</span>`;
    } else {
      subjectsContainer.style.display = "none";
    }
  }

  const toggleBtn = document.getElementById("sd-toggle-status-btn");
  if (toggleBtn) {
    if (s.status === "Active") {
      toggleBtn.textContent = "Deactivate School";
      toggleBtn.className = "btn btn-danger-outline btn-sm";
      toggleBtn.onclick = () => window.openConfirmDeactivateSchool(s.schoolId);
    } else {
      toggleBtn.textContent = "Activate School";
      toggleBtn.className = "btn btn-primary btn-sm";
      toggleBtn.onclick = () => window.executeToggleSchoolStatus(s.schoolId, "Inactive");
    }
  }

  const editBtn = document.getElementById("sd-edit-school-btn");
  if (editBtn) {
    editBtn.onclick = () => window.openEditSchoolModal();
  }

  const deleteBtn = document.getElementById("sd-delete-btn");
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      const delNameEl = document.getElementById("del-school-name");
      if (delNameEl) delNameEl.textContent = `${s.schoolName || s.name} (${s.schoolId})`;
      openModal("modal-delete-school");
    };
  }

  const addUserBtn = document.getElementById("sd-add-user-btn");
  if (addUserBtn) {
    addUserBtn.onclick = () => {
      window.openAddAccountModal("user", s.schoolId);
    };
  }

  renderSchoolUsersList(s.schoolId);
  renderSchoolSessionsList(s.schoolId);
}

function renderSchoolUsersList(schoolId) {
  const tbody = document.getElementById("sd-users-tbody");
  if (!tbody) return;

  const users = liveUsers.filter((u) => u.schoolId === schoolId && u.type !== "school");

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">
          No additional staff users assigned to this school yet.
          <div style="margin-top: 10px;">
            <button class="btn btn-secondary btn-sm" onclick="window.openAddAccountModal('user', '${schoolId}')">+ Add First User</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const authSessions = getAuthoritativeActiveSessions();

  tbody.innerHTML = users.map((u) => {
    const p = u.permissions || {};
    const activeDevCount = u.status === "Inactive" ? 0 : authSessions.filter((ses) => ses.userUid === (u.firebaseUid || u.uid)).length;

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">${u.displayName || u.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${u.email || '—'}</div>
        </td>
        <td><span style="font-size: 0.85rem;">${u.email || '—'}</span></td>
        <td><span class="badge ${u.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${u.status || 'Active'}</span></td>
        <td><span style="font-size: 0.85rem; font-weight: 600;">${u.deviceLimit || 3} Devices</span></td>
        <td>
          <span style="font-size: 0.85rem; font-weight: 700; color: ${activeDevCount >= (u.deviceLimit || 3) ? '#dc2626' : '#2563eb'};">
            ${activeDevCount} / ${u.deviceLimit || 3} Active
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
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="window.openEditUserPermsModal('${u.firebaseUid || u.uid}')">Manage User</button>
            <button class="btn btn-danger-outline btn-sm" onclick="window.openDeleteUserModal('${u.firebaseUid || u.uid}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * Render Active Sessions for a specific school inside School Details View (Tab 4)
 */
function renderSchoolSessionsList(schoolId) {
  const tbody = document.getElementById("sd-sessions-tbody");
  const countEl = document.getElementById("sd-sessions-count");
  if (!tbody) return;

  const school = liveSchools.find((s) => s.schoolId === schoolId);
  const authSessions = getAuthoritativeActiveSessions();
  const sessions = school?.status === "Inactive" ? [] : authSessions.filter((ses) => ses.schoolId === schoolId);
  if (countEl) countEl.textContent = sessions.length;

  if (sessions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
          No active device sessions for this school currently connected.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = sessions.map((ses) => {
    const userObj = liveUsers.find((u) => (u.firebaseUid || u.uid) === ses.userUid);
    const isCurrent = isCurrentDeviceSession(ses);

    return `
      <tr>
        <td>
          <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main);">${userObj ? (userObj.displayName || userObj.name) : (ses.userName || 'School User')}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${userObj?.email || ses.userEmail || ''}</div>
        </td>
        <td>
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">${ses.deviceName || 'Web Browser'}</div>
          ${isCurrent ? '<span class="badge" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; font-size:0.675rem; font-weight:700;">Current Device</span>' : '<span style="font-size:0.7rem; color:var(--text-muted);">Other Device</span>'}
        </td>
        <td><span style="font-family: monospace; font-size: 0.725rem; color: var(--text-muted);">${ses.deviceId || 'DEV'}</span></td>
        <td><span style="font-size: 0.8rem; color: var(--text-muted);">${ses.formattedLoginTime || 'Active'}</span></td>
        <td><span style="font-size: 0.8rem; color: var(--text-muted);">${ses.formattedLastActive || 'Now'}</span></td>
        <td><span class="badge badge-active">Active</span></td>
        <td style="text-align: right;">
          <button class="btn btn-danger-outline btn-sm" onclick="window.forceLogoutSession('${ses.sessionId || ses.id}')">
            Force Logout
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * Render Connected Active Sessions & Retained Last 3 Session History inside User Modal
 */
async function renderUserModalSessions(user) {
  const listContainer = document.getElementById("m-user-sessions-list");
  const countEl = document.getElementById("m-user-sessions-count");
  if (!listContainer) return;

  const targetUid = user.firebaseUid || user.uid;
  const authSessions = getAuthoritativeActiveSessions();
  const userActiveSessions = user.status === "Inactive" ? [] : authSessions.filter((s) => s.userUid === targetUid);

  if (countEl) countEl.textContent = userActiveSessions.length;

  // Active Sessions HTML
  let activeHtml = "";
  if (userActiveSessions.length === 0) {
    activeHtml = `
      <div style="background: #f8fafc; border: 1px dashed var(--border); border-radius: var(--radius-md); padding: 10px; text-align: center; color: var(--text-muted); font-size: 0.775rem;">
        No active connected devices for this account currently.
      </div>
    `;
  } else {
    activeHtml = userActiveSessions.map((ses) => {
      const isCurrent = isCurrentDeviceSession(ses);

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; background: #ffffff; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 8px 10px; gap: 8px; margin-bottom: 6px;">
          <div>
            <div style="font-size: 0.825rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
              ${ses.deviceName || 'Web Browser'}
              ${isCurrent ? '<span class="badge" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; font-size:0.65rem; font-weight:700;">Current Device</span>' : '<span style="font-size:0.65rem; color:var(--text-muted);">(Other Device)</span>'}
            </div>
            <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 2px;">
              Logged in: ${ses.formattedLoginTime || 'Active'} &bull; Last Active: ${ses.formattedLastActive || 'Now'}
            </div>
          </div>
          <button type="button" class="btn btn-danger-outline btn-sm" onclick="window.forceLogoutUserModalSession('${ses.sessionId || ses.id}')" style="font-size: 0.725rem; padding: 3px 8px;">
            Force Logout
          </button>
        </div>
      `;
    }).join("");
  }

  // Fetch retained last 3 history records from Firestore
  let historyHtml = "";
  try {
    const historyRecords = await getUserSessionHistory(targetUid, 3);
    if (historyRecords.length > 0) {
      historyHtml = `
        <div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--border);">
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
            Retained Session History (Last 3 Records)
          </div>
          ${historyRecords.map((h) => {
            const statusBadge = h.status === 'active'
              ? '<span class="badge badge-active" style="font-size:0.65rem;">Active</span>'
              : (h.status === 'terminated'
                  ? '<span class="badge" style="background:#fee2e2; color:#991b1b; border:1px solid #fecaca; font-size:0.65rem;">Terminated</span>'
                  : '<span class="badge badge-inactive" style="font-size:0.65rem;">Logged Out</span>');

            return `
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75rem; padding: 4px 0; color: var(--text-body); border-bottom: 1px dotted #f1f5f9;">
                <div>
                  <span style="font-weight: 600; color: var(--text-main);">${h.deviceName || 'Browser'}</span>
                  <span style="color: var(--text-muted); margin-left: 6px;">${h.formattedLoginTime}</span>
                </div>
                <div>${statusBadge}</div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }
  } catch (histErr) {
    console.warn("Session history note:", histErr);
  }

  listContainer.innerHTML = activeHtml + historyHtml;
}

/**
 * Force Logout a session from inside User Modal
 */
window.forceLogoutUserModalSession = async (sessionId) => {
  await window.forceLogoutSession(sessionId);
  if (selectedUserForPerms) {
    renderUserModalSessions(selectedUserForPerms);
  }
};

/**
 * Force Logout Session with Immediate Optimistic UI Feedback
 */
window.forceLogoutSession = async (sessionId) => {
  if (!confirm("Are you sure you want to force logout this device session? The school client will lose access immediately.")) {
    return;
  }

  const existingSessionIndex = liveSessions.findIndex((s) => (s.sessionId || s.id) === sessionId);
  const removedSession = existingSessionIndex >= 0 ? liveSessions[existingSessionIndex] : null;

  // Optimistically remove from live session list immediately
  if (existingSessionIndex >= 0) {
    liveSessions.splice(existingSessionIndex, 1);
    updateMetrics();
    renderDashboardSchools();
    renderAllSchoolsView();
    renderAccountsView();
    renderAllSessionsView();
    populateActiveSessionsSchoolFilter();
    if (selectedSchool) {
      renderSchoolSessionsList(selectedSchool.schoolId);
    }
  }

  try {
    await terminateSession(sessionId);
    showToast("Device session terminated successfully.", "success");
  } catch (err) {
    console.error("Force logout error:", err);
    // Revert if error
    if (removedSession) {
      liveSessions.push(removedSession);
      updateMetrics();
      renderAllSessionsView();
      populateActiveSessionsSchoolFilter();
    }
    showToast("Failed to terminate session.", "error");
  }
};

/**
 * Add Existing Account Modal Handler (School vs User)
 */
window.openAddAccountModal = (defaultType = "school", preselectedSchoolId = "") => {
  window.setAccountFormType(defaultType);
  populateSchoolDropdowns();

  if (preselectedSchoolId) {
    const sel = document.getElementById("acc-user-school");
    if (sel) sel.value = preselectedSchoolId;
  }

  openModal("modal-add-account");
};

window.setAccountFormType = (type) => {
  const btnSchool = document.getElementById("type-select-school");
  const btnUser = document.getElementById("type-select-user");
  const formSchool = document.getElementById("form-account-school");
  const formUser = document.getElementById("form-account-user");

  if (type === "school") {
    btnSchool?.classList.add("active");
    btnUser?.classList.remove("active");
    if (formSchool) formSchool.style.display = "block";
    if (formUser) formUser.style.display = "none";
  } else {
    btnUser?.classList.add("active");
    btnSchool?.classList.remove("active");
    if (formSchool) formSchool.style.display = "none";
    if (formUser) formUser.style.display = "block";
  }
};

function populateSchoolDropdowns() {
  const selUser = document.getElementById("acc-user-school");
  const options = liveSchools.map((s) => `
    <option value="${s.schoolId}">${s.schoolName || s.name} (${s.schoolId})</option>
  `).join("");

  if (selUser) selUser.innerHTML = options || `<option value="">No schools available (create a school account first)</option>`;
}

/**
 * Render standard senior subject checkboxes inside a target container
 */
function renderSeniorSubjectCheckboxes(containerId, activeSubjects = []) {
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
function getSelectedSubjects(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  const checked = container.querySelectorAll("input.subject-checkbox:checked");
  return Array.from(checked).map(cb => cb.value.trim()).filter(Boolean);
}

/**
 * Setup Forms (School & User Creation / Edit)
 */
function setupForms() {
  // Live School Logo Preview
  const logoInput = document.getElementById("acc-school-logo");
  const logoPreview = document.getElementById("acc-school-logo-preview");
  if (logoInput && logoPreview) {
    logoInput.addEventListener("input", () => {
      const url = logoInput.value.trim();
      if (!url) {
        logoPreview.innerHTML = "Logo";
        return;
      }
      const resolved = resolveImageUrl(url);
      const img = new Image();
      img.src = resolved;
      img.onload = () => {
        logoPreview.innerHTML = `<img src="${resolved}" style="width:100%; height:100%; object-fit:cover; border-radius:6px;">`;
      };
      img.onerror = () => {
        logoPreview.innerHTML = `<span style="font-size:0.65rem; color:#ef4444;">Invalid</span>`;
      };
    });
  }

  // Class Range & Subject Visibility for Modal 1 (Add School)
  const accStartClass = document.getElementById("acc-school-start-class");
  const accEndClass = document.getElementById("acc-school-end-class");
  const accSubSection = document.getElementById("acc-school-subjects-section");
  const accSubGrid = document.getElementById("acc-school-subjects-grid");
  const accAddSubBtn = document.getElementById("acc-school-add-subject-btn");
  const accCustomSubInput = document.getElementById("acc-school-custom-subject");

  const updateAccSeniorVisibility = () => {
    const start = accStartClass?.value || "";
    const end = accEndClass?.value || "";
    const isSenior = includesSeniorClasses(start, end);
    if (accSubSection) {
      accSubSection.style.display = isSenior ? "block" : "none";
    }
    if (isSenior && accSubGrid && accSubGrid.children.length === 0) {
      renderSeniorSubjectCheckboxes("acc-school-subjects-grid", []);
    }
  };

  accStartClass?.addEventListener("change", updateAccSeniorVisibility);
  accEndClass?.addEventListener("change", updateAccSeniorVisibility);

  if (accAddSubBtn && accCustomSubInput && accSubGrid) {
    accAddSubBtn.addEventListener("click", () => {
      const customSub = accCustomSubInput.value.trim();
      if (!customSub) return;
      const existing = getSelectedSubjects("acc-school-subjects-grid");
      if (!existing.includes(customSub)) {
        existing.push(customSub);
      }
      renderSeniorSubjectCheckboxes("acc-school-subjects-grid", existing);
      accCustomSubInput.value = "";
    });
  }

  // Class Range & Subject Visibility for Modal 2 (Edit School)
  const editStartClass = document.getElementById("edit-school-start-class");
  const editEndClass = document.getElementById("edit-school-end-class");
  const editSubSection = document.getElementById("edit-school-subjects-section");
  const editSubGrid = document.getElementById("edit-school-subjects-grid");
  const editAddSubBtn = document.getElementById("edit-school-add-subject-btn");
  const editCustomSubInput = document.getElementById("edit-school-custom-subject");

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
      const existing = getSelectedSubjects("edit-school-subjects-grid");
      if (!existing.includes(customSub)) {
        existing.push(customSub);
      }
      renderSeniorSubjectCheckboxes("edit-school-subjects-grid", existing);
      editCustomSubInput.value = "";
    });
  }

  // 1. Submit Level 2: School Account
  const formSchool = document.getElementById("form-account-school");
  if (formSchool) {
    formSchool.addEventListener("submit", async (e) => {
      e.preventDefault();
      const firebaseUid = document.getElementById("acc-school-uid").value.trim();
      const schoolId = document.getElementById("acc-school-id").value.trim().toUpperCase();
      const schoolName = document.getElementById("acc-school-name").value.trim();
      const logoUrl = document.getElementById("acc-school-logo").value.trim();
      const adminEmail = document.getElementById("acc-school-email").value.trim();
      const phone = document.getElementById("acc-school-phone") ? document.getElementById("acc-school-phone").value.trim() : "";
      const address = document.getElementById("acc-school-address").value.trim();
      const status = document.getElementById("acc-school-status").value;
      const deviceLimit = document.getElementById("acc-school-device-limit").value;

      const startingClass = document.getElementById("acc-school-start-class").value;
      const endingClass = document.getElementById("acc-school-end-class").value;

      if (!schoolId || !schoolName || !firebaseUid) {
        showToast("Please provide Firebase UID, School ID, and School Name.", "error");
        return;
      }

      // Validate Class Range
      const classValidation = validateClassRange(startingClass, endingClass);
      if (!classValidation.valid) {
        showToast(classValidation.error, "error");
        return;
      }

      const subjects = includesSeniorClasses(startingClass, endingClass)
        ? getSelectedSubjects("acc-school-subjects-grid")
        : [];

      const permissions = {
        editable: document.getElementById("acc-school-perm-editable")?.checked || false,
        addStudent: document.getElementById("acc-school-perm-addStudent")?.checked || false,
        deleteStudent: document.getElementById("acc-school-perm-deleteStudent")?.checked || false,
        excelExport: document.getElementById("acc-school-perm-excelExport")?.checked || false,
        reports: document.getElementById("acc-school-perm-reports")?.checked || false
      };

      try {
        await saveSchoolAccount({
          schoolId,
          firebaseUid,
          schoolName,
          logoUrl,
          adminEmail,
          phone,
          address,
          status,
          startingClass,
          endingClass,
          subjects,
          deviceLimit,
          permissions
        });
        formSchool.reset();
        closeModal("modal-add-account");
        showToast(`School Account ${schoolName} (${schoolId}) saved successfully!`, "success");
      } catch (err) {
        console.error("Save School error:", err);
        // Surface duplicate-check errors and other specific error messages directly to admin
        const msg = (err && err.message) ? err.message : "Failed to save school account.";
        showToast(msg, "error");
      }
    });
  }

  // 2. Submit Level 3: School User Account
  const formUser = document.getElementById("form-account-user");
  if (formUser) {
    formUser.addEventListener("submit", async (e) => {
      e.preventDefault();
      const schoolId = document.getElementById("acc-user-school").value;
      const firebaseUid = document.getElementById("acc-user-uid").value.trim();
      const displayName = document.getElementById("acc-user-name").value.trim();
      const email = document.getElementById("acc-user-email").value.trim();
      const status = document.getElementById("acc-user-status").value;
      const deviceLimit = document.getElementById("acc-user-device-limit").value;

      const permissions = {
        editable: document.getElementById("acc-perm-editable")?.checked || false,
        addStudent: document.getElementById("acc-perm-addStudent")?.checked || false,
        deleteStudent: document.getElementById("acc-perm-deleteStudent")?.checked || false,
        excelExport: document.getElementById("acc-perm-excelExport")?.checked || false,
        reports: document.getElementById("acc-perm-reports")?.checked || false
      };

      if (!schoolId || !firebaseUid) {
        showToast("Please select a school and enter Firebase UID.", "error");
        return;
      }

      try {
        await saveUserAccount({ firebaseUid, schoolId, displayName, email, status, deviceLimit, permissions, type: "user" });
        formUser.reset();
        closeModal("modal-add-account");
        showToast(`User account configured under School ID ${schoolId}!`, "success");
      } catch (err) {
        console.error("Save User error:", err);
        // Surface duplicate-check / cross-school assignment errors directly to admin
        const msg = (err && err.message) ? err.message : "Failed to save user account.";
        showToast(msg, "error");
      }
    });
  }

  // 3. Edit School Info Form
  const formEditSchool = document.getElementById("form-edit-school-info");
  if (formEditSchool) {
    formEditSchool.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!selectedSchool) return;

      const schoolName = document.getElementById("edit-school-name").value.trim();
      const logoUrl = document.getElementById("edit-school-logo").value.trim();
      const adminEmail = document.getElementById("edit-school-email").value.trim();
      const phoneInput = document.getElementById("edit-school-phone");
      const phone = phoneInput ? phoneInput.value.trim() : (selectedSchool.phoneNumber || selectedSchool.phone || "");
      const address = document.getElementById("edit-school-address").value.trim();
      const startingClass = document.getElementById("edit-school-start-class").value;
      const endingClass = document.getElementById("edit-school-end-class").value;

      // Validate Class Range
      const classValidation = validateClassRange(startingClass, endingClass);
      if (!classValidation.valid) {
        showToast(classValidation.error, "error");
        return;
      }

      const subjects = includesSeniorClasses(startingClass, endingClass)
        ? getSelectedSubjects("edit-school-subjects-grid")
        : (selectedSchool.subjects || []);

      try {
        await updateSchool(selectedSchool.schoolId, {
          schoolName,
          name: schoolName,
          logoUrl,
          adminEmail,
          phoneNumber: phone,
          address,
          startingClass,
          endingClass,
          subjects
        });

        // Update local object
        selectedSchool.schoolName = schoolName;
        selectedSchool.name = schoolName;
        selectedSchool.logoUrl = logoUrl;
        selectedSchool.adminEmail = adminEmail;
        selectedSchool.phoneNumber = phone;
        selectedSchool.phone = phone;
        selectedSchool.address = address;
        selectedSchool.startingClass = startingClass;
        selectedSchool.endingClass = endingClass;
        selectedSchool.subjects = subjects;

        // Keep matching item in liveSchools array up to date immediately
        const schoolIdx = liveSchools.findIndex((s) => s.schoolId === selectedSchool.schoolId);
        if (schoolIdx !== -1) {
          liveSchools[schoolIdx] = { ...liveSchools[schoolIdx], ...selectedSchool };
        }

        refreshSchoolDetailsView();
        renderDashboardSchools();
        renderAllSchoolsView();

        closeModal("modal-edit-school");
        showToast("School information updated successfully.", "success");
      } catch (err) {
        console.error("Update school error:", err);
        showToast("Failed to update school information.", "error");
      }
    });
  }

  // Search Filters
  const searchInput = document.getElementById("dashboard-search-schools");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase().trim();
      const filtered = liveSchools.filter((s) => {
        return (s.schoolName || s.name || "").toLowerCase().includes(q) ||
               (s.schoolId || "").toLowerCase().includes(q);
      });
      renderDashboardSchools(filtered);
    });
  }

  const schoolsSearchInput = document.getElementById("schools-search-input");
  if (schoolsSearchInput) {
    schoolsSearchInput.addEventListener("input", () => {
      const q = schoolsSearchInput.value.toLowerCase().trim();
      const filtered = liveSchools.filter((s) => {
        return (s.schoolName || s.name || "").toLowerCase().includes(q) ||
               (s.schoolId || "").toLowerCase().includes(q);
      });
      renderAllSchoolsView(filtered);
    });
  }

  const logsSearchInput = document.getElementById("admin-logs-search");
  if (logsSearchInput) {
    logsSearchInput.addEventListener("input", () => {
      const q = logsSearchInput.value.toLowerCase().trim();
      const filtered = liveAdminLogs.filter((l) => {
        return (l.action || "").toLowerCase().includes(q) ||
               (l.target || "").toLowerCase().includes(q) ||
               (l.details || "").toLowerCase().includes(q) ||
               (l.admin || "").toLowerCase().includes(q);
      });
      renderAdminLogsView(filtered);
    });
  }

  // Confirm Permanent Delete School
  const confirmDeleteBtn = document.getElementById("confirm-delete-school-btn");
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async () => {
      if (!selectedSchool) return;
      try {
        await permanentlyDeleteSchool(selectedSchool.schoolId, selectedSchool.firebaseUid);
        showToast(`School ${selectedSchool.schoolName || selectedSchool.name} permanently deleted.`, "success");
        closeModal("modal-delete-school");
        selectedSchool = null;
        window.navigateView("dashboard");
      } catch (e) {
        showToast("Failed to delete school.", "error");
      }
    });
  }
}

/**
 * Edit School Information Modal
 */
window.openEditSchoolModal = (schoolId) => {
  const targetSchool = schoolId ? liveSchools.find((s) => s.schoolId === schoolId) : selectedSchool;
  if (!targetSchool) return;

  selectedSchool = targetSchool;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  };

  setVal("edit-school-name", targetSchool.schoolName || targetSchool.name || "");
  setVal("edit-school-logo", targetSchool.logoUrl || "");
  setVal("edit-school-email", targetSchool.adminEmail || "");
  setVal("edit-school-phone", targetSchool.phoneNumber || targetSchool.phone || "");
  setVal("edit-school-address", targetSchool.address || "");

  const startClass = targetSchool.startingClass || "Nursery";
  const endClass = targetSchool.endingClass || "Class 10";
  setVal("edit-school-start-class", startClass);
  setVal("edit-school-end-class", endClass);

  renderSeniorSubjectCheckboxes("edit-school-subjects-grid", targetSchool.subjects || []);

  const subSection = document.getElementById("edit-school-subjects-section");
  if (subSection) {
    subSection.style.display = includesSeniorClasses(startClass, endClass) ? "block" : "none";
  }

  openModal("modal-edit-school");
};

/**
 * Edit User Details, Permissions & Device Sessions Modal
 */
window.openEditUserPermsModal = (firebaseUid) => {
  const user = liveUsers.find((u) => (u.firebaseUid || u.uid) === firebaseUid);
  if (!user) return;

  selectedUserForPerms = user;
  const titleEl = document.getElementById("m-perm-user-title");
  const subEl = document.getElementById("m-perm-user-sub");

  if (titleEl) titleEl.textContent = user.displayName || user.name || "Account";
  if (subEl) subEl.textContent = `${user.type === 'school' ? 'Primary School Account' : 'School User'} • School: ${user.schoolId} • Email: ${user.email || 'None'}`;

  const statusSel = document.getElementById("m-perm-status");
  if (statusSel) statusSel.value = user.status || "Active";

  const devVal = document.getElementById("m-perm-device-limit-val");
  if (devVal) devVal.textContent = user.deviceLimit || 3;

  const perms = user.permissions || { editable: true, addStudent: true, deleteStudent: true, excelExport: true, reports: true };
  const setCb = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  };

  setCb("m-perm-editable", perms.editable);
  setCb("m-perm-addStudent", perms.addStudent);
  setCb("m-perm-deleteStudent", perms.deleteStudent);
  setCb("m-perm-excelExport", perms.excelExport);
  setCb("m-perm-reports", perms.reports);

  // Render Connected Active Sessions for this user
  renderUserModalSessions(user);

  openModal("modal-edit-user-perms");
};

window.stepUserDeviceLimit = (delta) => {
  const el = document.getElementById("m-perm-device-limit-val");
  if (!el) return;
  const current = Number(el.textContent) || 3;
  const next = Math.max(1, Math.min(15, current + delta));
  el.textContent = next;
};

// Save User Permissions Button with Immediate Optimistic Feedback & Session Revocation on Deactivate
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
    const oldStatus = selectedUserForPerms.status;
    const oldLimit = selectedUserForPerms.deviceLimit;
    const oldPerms = { ...selectedUserForPerms.permissions };

    // Optimistically update local user state
    selectedUserForPerms.status = status;
    selectedUserForPerms.deviceLimit = deviceLimit;
    selectedUserForPerms.permissions = permissions;

    // If user is deactivated, optimistically drop sessions for this user from live list immediately
    let preservedUserSessions = [];
    if (status === "Inactive") {
      preservedUserSessions = liveSessions.filter((s) => s.userUid === targetUid);
      liveSessions = liveSessions.filter((s) => s.userUid !== targetUid);
    }

    renderAccountsView();
    renderDashboardSchools();
    if (selectedSchool) {
      refreshSchoolDetailsView();
      renderSchoolUsersList(selectedSchool.schoolId);
    }
    updateMetrics();

    closeModal("modal-edit-user-perms");

    try {
      await saveUserAccount({
        firebaseUid: targetUid,
        schoolId: selectedUserForPerms.schoolId,
        displayName: selectedUserForPerms.displayName || selectedUserForPerms.name,
        email: selectedUserForPerms.email,
        status,
        deviceLimit,
        permissions,
        type: selectedUserForPerms.type || "user"
      });

      showToast(`Settings saved for ${selectedUserForPerms.displayName || targetUid}!`, "success");
    } catch (e) {
      console.error("Save perms error:", e);
      // Revert local state on error
      selectedUserForPerms.status = oldStatus;
      selectedUserForPerms.deviceLimit = oldLimit;
      selectedUserForPerms.permissions = oldPerms;
      if (status === "Inactive" && preservedUserSessions.length > 0) {
        liveSessions.push(...preservedUserSessions);
      }
      renderAccountsView();
      updateMetrics();
      showToast("Failed to update account settings.", "error");
    }
  });
}

/**
 * Mobile Navigation Drawer
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

  // Wire bottom navigation bar
  const bottomNavItems = document.querySelectorAll(".bottom-nav-item");
  bottomNavItems.forEach((item) => {
    item.addEventListener("click", () => {
      const target = item.getAttribute("data-view");
      if (target && window.navigateView) {
        window.navigateView(target);
      }
    });
  });
}

/**
 * ============================================================================
 * STUDENT DATASET FILE UPLOAD MANAGEMENT (School Data, UDISE, 3.0)
 * ============================================================================
 */

/**
 * Switch active student dataset tab (School Data vs UDISE vs 3.0)
 */
window.switchStudentUploadDataset = (datasetKey) => {
  if (!DATASET_SCHEMAS[datasetKey]) return;
  currentUploadDataset = datasetKey;

  // Clear pending file selection
  window.clearSelectedStudentFile();

  // Update tab buttons
  const tabs = {
    [DATASET_KEYS.SCHOOL_DATA]: document.getElementById("btn-tab-school-data"),
    [DATASET_KEYS.UDISE]: document.getElementById("btn-tab-udise"),
    [DATASET_KEYS.THREE_POINT_ZERO]: document.getElementById("btn-tab-p3")
  };

  Object.entries(tabs).forEach(([k, btn]) => {
    if (!btn) return;
    if (k === datasetKey) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  renderDatasetUploadTab(datasetKey, selectedSchool);
};

/**
 * Update the overall student upload module for a school
 */
function updateStudentUploadModule(school) {
  const badgeEl = document.getElementById("sd-student-school-id-badge");
  if (badgeEl) {
    badgeEl.textContent = school?.schoolId || "—";
  }

  renderDatasetUploadTab(currentUploadDataset, school);

  // If school has schoolId, fetch live dataset summaries asynchronously
  if (school?.schoolId) {
    getSchoolDatasetSummaries(school.schoolId).then((summaries) => {
      if (summaries && selectedSchool && selectedSchool.schoolId === school.schoolId) {
        selectedSchool.datasets = { ...(selectedSchool.datasets || {}), ...summaries };
        updateDatasetStatusValues(currentUploadDataset, selectedSchool);
      }
    }).catch((err) => {
      console.warn("Could not load dataset summaries:", err);
    });
  }
}

/**
 * Render dataset upload tab UI based on selected dataset key
 */
function renderDatasetUploadTab(datasetKey, school) {
  const schema = DATASET_SCHEMAS[datasetKey];
  if (!schema) return;

  const titleEl = document.getElementById("dataset-title-display");
  const descEl = document.getElementById("dataset-desc-display");
  const badgeEl = document.getElementById("dataset-type-badge");
  const zoneLabelEl = document.getElementById("upload-zone-dataset-label");
  const btnLabelEl = document.getElementById("btn-upload-dataset-label");
  const uniqueIdEl = document.getElementById("dataset-status-unique-id");

  if (titleEl) titleEl.textContent = schema.label;
  if (zoneLabelEl) zoneLabelEl.textContent = schema.label;
  if (btnLabelEl) btnLabelEl.textContent = schema.label;
  if (uniqueIdEl) uniqueIdEl.textContent = schema.uniqueIdLabel;

  if (descEl) {
    if (datasetKey === DATASET_KEYS.SCHOOL_DATA) {
      descEl.textContent = "Permanent master student records for the school institution. Handled independently from weekly compliance snapshots.";
    } else if (datasetKey === DATASET_KEYS.UDISE) {
      descEl.textContent = "National UDISE compliance records. Uploading replaces the previous weekly UDISE dataset for this school.";
    } else if (datasetKey === DATASET_KEYS.THREE_POINT_ZERO) {
      descEl.textContent = "State Portal 3.0 enrollment records. Uploading replaces the previous weekly 3.0 dataset for this school.";
    }
  }

  if (badgeEl) {
    if (datasetKey === DATASET_KEYS.SCHOOL_DATA) {
      badgeEl.className = "badge badge-active";
      badgeEl.style.background = "";
      badgeEl.style.color = "";
      badgeEl.style.border = "";
      badgeEl.textContent = "Master Student Data";
    } else {
      badgeEl.className = "badge";
      badgeEl.style.background = "#f1f5f9";
      badgeEl.style.color = "#475569";
      badgeEl.style.border = "1px solid #cbd5e1";
      badgeEl.textContent = "Weekly Snapshot Dataset";
    }
  }

  // Populate required headers pills
  const pillsContainer = document.getElementById("dataset-headers-pills");
  if (pillsContainer) {
    pillsContainer.innerHTML = schema.requiredHeaders.map((h) => {
      const isUnique = h.key === schema.uniqueIdField;
      return `<span class="badge" style="background: ${isUnique ? '#eff6ff' : '#f8fafc'}; color: ${isUnique ? '#1d4ed8' : '#334155'}; border: 1px solid ${isUnique ? '#93c5fd' : '#e2e8f0'}; font-size: 0.775rem; padding: 3px 9px;">${h.label}${isUnique ? ' (Unique ID)' : ''}</span>`;
    }).join("");
  }

  // Update current dataset status for school
  updateDatasetStatusValues(datasetKey, school);
}

/**
 * Update the status card values (count, updated date, filename)
 */
function updateDatasetStatusValues(datasetKey, school) {
  const countEl = document.getElementById("dataset-status-count");
  const updatedEl = document.getElementById("dataset-status-updated");
  const fileEl = document.getElementById("dataset-status-file");

  if (!school) {
    if (countEl) countEl.textContent = "0 Records";
    if (updatedEl) updatedEl.textContent = "Not uploaded yet";
    if (fileEl) fileEl.textContent = "—";
    return;
  }

  const dsMeta = (school.datasets && school.datasets[datasetKey]) ? school.datasets[datasetKey] : null;
  const count = dsMeta?.recordCount ?? (datasetKey === DATASET_KEYS.SCHOOL_DATA && school.studentsCount ? school.studentsCount : 0);

  if (countEl) {
    countEl.textContent = `${count} Record${count === 1 ? '' : 's'}`;
  }

  if (updatedEl) {
    if (dsMeta && dsMeta.updatedAt) {
      const d = dsMeta.updatedAt.toDate ? dsMeta.updatedAt.toDate() : new Date(dsMeta.updatedAt);
      updatedEl.textContent = d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } else {
      updatedEl.textContent = count > 0 ? "Previously Uploaded" : "Not uploaded yet";
    }
  }

  if (fileEl) {
    fileEl.textContent = dsMeta?.fileName || (count > 0 ? "Authoritative dataset" : "—");
  }
}

/**
 * Handle file input selection & perform client-side pre-validation
 */
window.handleStudentExcelFileSelected = async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  selectedExcelFile = file;
  parsedStudentData = null;

  const infoBar = document.getElementById("upload-file-info-bar");
  const nameEl = document.getElementById("upload-file-name");
  const metaEl = document.getElementById("upload-file-meta");
  const alertEl = document.getElementById("upload-status-alert");
  const uploadBtn = document.getElementById("btn-submit-upload");

  // Show file info row
  if (infoBar) {
    infoBar.style.display = "flex";
    if (nameEl) nameEl.textContent = file.name;
    if (metaEl) {
      const sizeKb = (file.size / 1024).toFixed(1);
      metaEl.textContent = `${sizeKb} KB • Validating structure...`;
    }
  }

  // Pre-validate file client-side
  const schoolId = selectedSchool?.schoolId || "";
  const result = await parseAndValidateExcel(file, currentUploadDataset, schoolId);

  if (!result.valid) {
    parsedStudentData = null;
    if (uploadBtn) uploadBtn.disabled = true;
    if (alertEl) {
      alertEl.style.display = "block";
      alertEl.style.background = "#fef2f2";
      alertEl.style.border = "1px solid #fecaca";
      alertEl.style.color = "#991b1b";
      alertEl.innerHTML = `<strong>Validation Error:</strong> ${result.error}`;
    }
    if (metaEl) metaEl.textContent = "Validation failed. Please fix columns.";
    return;
  }

  // Valid file!
  parsedStudentData = result;
  if (uploadBtn) uploadBtn.disabled = false;
  if (metaEl) {
    metaEl.textContent = `${(file.size / 1024).toFixed(1)} KB • ${result.recordCount} records ready for upload`;
  }

  if (alertEl) {
    alertEl.style.display = "block";
    alertEl.style.background = "#f0fdf4";
    alertEl.style.border = "1px solid #bbf7d0";
    alertEl.style.color = "#166534";
    let alertHtml = `<strong>Validation Passed:</strong> Ready to upload <strong>${result.recordCount}</strong> students to ${result.datasetLabel}.`;
    if (result.warnings && result.warnings.length > 0) {
      alertHtml += `<div style="margin-top: 6px; font-size: 0.775rem; color: #15803d;"><em>Note: ${result.warnings[0]}</em></div>`;
    }
    alertEl.innerHTML = alertHtml;
  }
};

/**
 * Clear selected file
 */
window.clearSelectedStudentFile = () => {
  selectedExcelFile = null;
  parsedStudentData = null;

  const fileInput = document.getElementById("student-excel-input");
  if (fileInput) fileInput.value = "";

  const infoBar = document.getElementById("upload-file-info-bar");
  if (infoBar) infoBar.style.display = "none";

  const alertEl = document.getElementById("upload-status-alert");
  if (alertEl) alertEl.style.display = "none";

  const uploadBtn = document.getElementById("btn-submit-upload");
  if (uploadBtn) uploadBtn.disabled = true;
};

/**
 * Execute Dataset Upload to Firestore
 */
window.executeStudentDatasetUpload = async () => {
  if (isUploadingDataset) return;
  if (!selectedSchool || !selectedSchool.schoolId) {
    showToast("No school selected for upload.", "error");
    return;
  }

  if (!navigator.onLine) {
    showToast("Cannot upload dataset while offline. Please reconnect to the internet.", "error");
    const alertEl = document.getElementById("upload-status-alert");
    if (alertEl) {
      alertEl.style.display = "block";
      alertEl.style.background = "#fef2f2";
      alertEl.style.border = "1px solid #fecaca";
      alertEl.style.color = "#991b1b";
      alertEl.innerHTML = `<strong>Offline:</strong> Internet disconnected. Existing data has not been modified.`;
    }
    return;
  }

  if (!parsedStudentData || !Array.isArray(parsedStudentData.students) || parsedStudentData.students.length === 0) {
    showToast("Please choose and validate a valid Excel file first.", "error");
    return;
  }

  const uploadBtn = document.getElementById("btn-submit-upload");
  const spinnerEl = document.getElementById("upload-loading-spinner");
  const spinnerTextEl = document.getElementById("upload-loading-text");
  const alertEl = document.getElementById("upload-status-alert");

  isUploadingDataset = true;
  if (uploadBtn) uploadBtn.disabled = true;
  if (spinnerEl) spinnerEl.style.display = "inline-flex";
  if (spinnerTextEl) spinnerTextEl.textContent = `Uploading ${parsedStudentData.recordCount} records...`;

  try {
    const res = await uploadSchoolDataset(
      selectedSchool.schoolId,
      currentUploadDataset,
      parsedStudentData.students,
      { fileName: selectedExcelFile?.name || "students.xlsx" }
    );

    // Update local school object metadata
    if (!selectedSchool.datasets) selectedSchool.datasets = {};
    selectedSchool.datasets[currentUploadDataset] = {
      recordCount: res.recordCount,
      fileName: selectedExcelFile?.name || "students.xlsx",
      updatedAt: new Date()
    };

    if (currentUploadDataset === DATASET_KEYS.SCHOOL_DATA) {
      selectedSchool.studentsCount = res.recordCount;
    }

    // Refresh live array
    const liveIdx = liveSchools.findIndex((s) => s.schoolId === selectedSchool.schoolId);
    if (liveIdx !== -1) {
      liveSchools[liveIdx] = { ...liveSchools[liveIdx], ...selectedSchool };
    }

    // Determine exact success message required by spec
    let successMsg = "Student data uploaded successfully.";
    if (currentUploadDataset === DATASET_KEYS.UDISE) {
      successMsg = "UDISE data uploaded successfully.";
    } else if (currentUploadDataset === DATASET_KEYS.THREE_POINT_ZERO) {
      successMsg = "3.0 data uploaded successfully.";
    } else if (currentUploadDataset === DATASET_KEYS.SCHOOL_DATA) {
      successMsg = "School data uploaded successfully.";
    }

    showToast(successMsg, "success");

    if (alertEl) {
      alertEl.style.display = "block";
      alertEl.style.background = "#f0fdf4";
      alertEl.style.border = "1px solid #bbf7d0";
      alertEl.style.color = "#166534";
      alertEl.innerHTML = `<strong>Success:</strong> ${successMsg} (${res.recordCount} records stored).`;
    }

    // Update status card values immediately
    updateDatasetStatusValues(currentUploadDataset, selectedSchool);

    // Clear file selection after upload
    selectedExcelFile = null;
    parsedStudentData = null;
    const fileInput = document.getElementById("student-excel-input");
    if (fileInput) fileInput.value = "";
    const infoBar = document.getElementById("upload-file-info-bar");
    if (infoBar) infoBar.style.display = "none";

  } catch (err) {
    console.error("Dataset upload failed:", err);
    showToast(`Upload failed: ${err.message}`, "error");

    if (alertEl) {
      alertEl.style.display = "block";
      alertEl.style.background = "#fef2f2";
      alertEl.style.border = "1px solid #fecaca";
      alertEl.style.color = "#991b1b";
      alertEl.innerHTML = `<strong>Upload Failed:</strong> ${err.message}. Previously stored data remains intact.`;
    }
    if (uploadBtn) uploadBtn.disabled = false;
  } finally {
    isUploadingDataset = false;
    if (spinnerEl) spinnerEl.style.display = "none";
  }
};

