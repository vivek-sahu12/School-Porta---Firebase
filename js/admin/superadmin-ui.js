import { auth } from "../firebase.js";
import {
  subscribeToSchools,
  subscribeToUsers,
  subscribeToSessions,
  subscribeToAdminLogs,
  saveSchoolAccount,
  updateSchool,
  toggleSchoolStatus,
  permanentlyDeleteSchool,
  saveUserAccount,
  terminateSession
} from "./firestore-service.js";

/**
 * Super Admin UI Controller - High Quality Professional SaaS with Admin Profile & Audit Logs
 */

// In-Memory Live State
let liveSchools = [];
let liveUsers = [];
let liveSessions = [];
let liveAdminLogs = [];
let currentView = "dashboard";
let selectedSchool = null;
let selectedUserForPerms = null;
let currentSchoolTab = "overview";
let currentSettingsTab = "admin-profile";

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

/**
 * Initialize Super Admin UI
 */
export function initSuperAdminUI() {
  setupNavigation();
  setupForms();
  setupLiveListeners();
  setupMobileDrawer();
  populateAdminProfile();
}

/**
 * Populate Super Admin Profile & Session Metadata
 */
function populateAdminProfile() {
  const user = auth.currentUser;
  if (!user) return;

  const email = user.email || "admin@portal.com";
  const name = email.split("@")[0].toUpperCase() || "Super Administrator";
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

  if (ua.includes("Windows")) os = "Windows 11 / 10";
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
 * Setup Real-time Firestore Subscriptions
 */
function setupLiveListeners() {
  // 1. Subscribe to Schools (Level 2)
  subscribeToSchools((schools) => {
    liveSchools = schools;
    updateMetrics();
    renderDashboardSchools();
    renderAllSchoolsView();
    renderAccountsView();
    renderAllSessionsView();
    populateSchoolDropdowns();

    if (selectedSchool) {
      const refreshed = liveSchools.find((s) => s.schoolId === selectedSchool.schoolId);
      if (refreshed) {
        selectedSchool = refreshed;
        refreshSchoolDetailsView();
      }
    }
  });

  // 2. Subscribe to Users (Level 3)
  subscribeToUsers((users) => {
    liveUsers = users;
    updateMetrics();
    renderDashboardSchools();
    renderAllSchoolsView();
    renderAccountsView();
    renderAllSessionsView();

    if (selectedSchool) {
      renderSchoolUsersList(selectedSchool.schoolId);
    }
  });

  // 3. Subscribe to Active Device Sessions
  subscribeToSessions((sessions) => {
    liveSessions = sessions;
    updateMetrics();
    renderDashboardSchools();
    renderAllSchoolsView();
    renderAccountsView();
    renderAllSessionsView();

    if (selectedSchool) {
      renderSchoolUsersList(selectedSchool.schoolId);
      renderSchoolSessionsList(selectedSchool.schoolId);
    }
  });

  // 4. Subscribe to Real-Time Admin Activity / Audit Logs
  subscribeToAdminLogs((logs) => {
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

    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.remove("open");
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
 * Top Metric Summary Cards (5 Balanced Metrics)
 */
function updateMetrics() {
  const totalSchools = liveSchools.length;
  const activeSchools = liveSchools.filter((s) => s.status === "Active").length;
  const inactiveSchools = liveSchools.filter((s) => s.status === "Inactive").length;
  const totalUsers = liveUsers.length;
  const activeSessions = liveSessions.length;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setVal("metric-total-schools", totalSchools);
  setVal("metric-active-schools", activeSchools);
  setVal("metric-inactive-schools", inactiveSchools);
  setVal("metric-total-users", totalUsers);
  setVal("metric-active-sessions", activeSessions);

  const totalSessionsCountEl = document.getElementById("sessions-total-count");
  if (totalSessionsCountEl) totalSessionsCountEl.textContent = activeSessions;
}

/**
 * View 1: Render Schools on Dashboard (Primary Management Focus)
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
            <h3>No schools added yet</h3>
            <p>Configure your first school institution to manage users and active sessions.</p>
            <button class="btn btn-primary btn-sm" onclick="window.openAddAccountModal('school')">+ Add School Account</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map((s) => {
    const usersCount = liveUsers.filter((u) => u.schoolId === s.schoolId).length;
    const schoolSessionsCount = liveSessions.filter((ses) => ses.schoolId === s.schoolId).length;
    const initial = s.logoInitial || s.schoolName?.substring(0, 2).toUpperCase() || "SC";
    const avatarHtml = s.logoUrl
      ? `<div class="school-avatar"><img src="${s.logoUrl}" alt="${s.schoolName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span style="display:none;">${initial}</span></div>`
      : `<div class="school-avatar">${initial}</div>`;

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 14px;">
            ${avatarHtml}
            <div>
              <div style="font-weight: 700; color: var(--text-main); font-size: 0.925rem;">${s.schoolName || s.name}</div>
              <div style="font-size: 0.775rem; color: var(--text-muted);">${s.adminEmail || 'No contact email'}</div>
            </div>
          </div>
        </td>
        <td><strong style="color: var(--primary); font-size: 0.85rem;">${s.schoolId}</strong></td>
        <td><span class="chip-uid">${s.firebaseUid || '—'}</span></td>
        <td><span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${s.status}</span></td>
        <td><strong>${usersCount}</strong> Users</td>
        <td>
          <span class="badge ${schoolSessionsCount > 0 ? 'badge-active' : 'badge-inactive'}">
            ${schoolSessionsCount} Active
          </span>
        </td>
        <td><span style="font-size: 0.8rem; color: var(--text-muted);">${s.lastUpdated || 'Recently'}</span></td>
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
 * View 2: All Schools Directory
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

  tbody.innerHTML = list.map((s) => {
    const usersCount = liveUsers.filter((u) => u.schoolId === s.schoolId).length;
    const schoolSessionsCount = liveSessions.filter((ses) => ses.schoolId === s.schoolId).length;
    const initial = s.logoInitial || s.schoolName?.substring(0, 2).toUpperCase() || "SC";
    const avatarHtml = s.logoUrl
      ? `<div class="school-avatar"><img src="${s.logoUrl}" alt="${s.schoolName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span style="display:none;">${initial}</span></div>`
      : `<div class="school-avatar">${initial}</div>`;

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 14px;">
            ${avatarHtml}
            <span style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">${s.schoolName || s.name}</span>
          </div>
        </td>
        <td><strong style="color: var(--primary);">${s.schoolId}</strong></td>
        <td><span class="chip-uid">${s.firebaseUid || '—'}</span></td>
        <td><span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${s.status}</span></td>
        <td>${usersCount} Users</td>
        <td>${schoolSessionsCount} Active</td>
        <td><span style="font-size: 0.825rem; color: var(--text-muted);">${s.address || 'Campus Address'}</span></td>
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

  const totalAccounts = liveSchools.length + liveUsers.length;
  if (totalAccounts === 0) {
    tbody.innerHTML = `
      <tr><td colspan="7"><div class="empty-box"><h3>No configured accounts</h3><p>Register existing Firebase Authentication accounts as Schools or Users.</p></div></td></tr>
    `;
    return;
  }

  let html = "";

  // 1. Level 2: School Accounts
  liveSchools.forEach((s) => {
    html += `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${s.schoolName}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Admin: ${s.adminEmail || 'None'}</div>
        </td>
        <td><span class="badge" style="background:#e0f2fe; color:#0369a1; border: 1px solid #bae6fd;">School Account</span></td>
        <td><span class="chip-uid">${s.firebaseUid || '—'}</span></td>
        <td><strong style="color: var(--primary);">${s.schoolId}</strong></td>
        <td><span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${s.status}</span></td>
        <td><span style="font-size: 0.8rem; color: var(--text-muted);">${s.address || 'Campus Address'}</span></td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="window.openSchoolDetails('${s.schoolId}')">Manage</button>
        </td>
      </tr>
    `;
  });

  // 2. Level 3: School User Accounts
  liveUsers.forEach((u) => {
    const parentSchool = liveSchools.find((s) => s.schoolId === u.schoolId);
    const schoolLabel = parentSchool ? `${parentSchool.schoolName} (${u.schoolId})` : u.schoolId;
    const userSessions = liveSessions.filter((ses) => ses.userUid === u.firebaseUid).length;

    html += `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${u.displayName || u.name}</div>
          <div style="font-size: 0.725rem; color: var(--text-muted);">${u.email || 'No email'}</div>
        </td>
        <td><span class="badge" style="background:#f3e8ff; color:#7e22ce; border: 1px solid #ddd6fe;">School User</span></td>
        <td><span class="chip-uid">${u.firebaseUid}</span></td>
        <td><span style="font-size: 0.85rem; font-weight: 600;">${schoolLabel}</span></td>
        <td><span class="badge ${u.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${u.status}</span></td>
        <td><span style="font-size: 0.85rem; font-weight: 600; color: ${userSessions >= (u.deviceLimit || 3) ? '#dc2626' : '#2563eb'};">${userSessions} / ${u.deviceLimit || 3} Devices Active</span></td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="window.openEditUserPermsModal('${u.firebaseUid}')">Permissions</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

/**
 * View 5: Dedicated Active Sessions Monitoring Page
 */
function renderAllSessionsView() {
  const tbody = document.getElementById("sessions-all-tbody");
  if (!tbody) return;

  if (liveSessions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 36px;">
          <div class="empty-box">
            <svg class="empty-box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="12" x="3" y="4" rx="2"></rect><line x1="2" y1="20" x2="22" y2="20"></line></svg>
            <h3>No active device sessions currently connected</h3>
            <p>When staff or users log in through their portal, active sessions appear here in real-time.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = liveSessions.map((ses) => {
    const parentSchool = liveSchools.find((s) => s.schoolId === ses.schoolId);
    const schoolName = parentSchool ? parentSchool.schoolName : (ses.schoolId || 'Unknown School');
    const userObj = liveUsers.find((u) => u.firebaseUid === ses.userUid);
    const deviceLimit = userObj ? (userObj.deviceLimit || 3) : 3;
    const userActiveCount = liveSessions.filter((s) => s.userUid === ses.userUid).length;

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.875rem;">${schoolName}</div>
          <div style="font-size: 0.75rem; color: var(--primary); font-weight: 600;">${ses.schoolId}</div>
        </td>
        <td>
          <div style="font-weight: 600; font-size: 0.85rem;">${userObj ? (userObj.displayName || userObj.name) : 'User'}</div>
          <span class="chip-uid">${ses.userUid}</span>
        </td>
        <td><span style="font-size: 0.85rem; font-weight: 500;">${ses.deviceName || 'Web Browser'}</span></td>
        <td><span style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted);">${ses.deviceId || 'DEV'}</span></td>
        <td><span style="font-size: 0.8rem; color: var(--text-muted);">${ses.formattedLoginTime || 'Active'}</span></td>
        <td><span style="font-size: 0.8rem; color: var(--text-muted);">${ses.formattedLastActive || 'Now'}</span></td>
        <td>
          <span style="font-size: 0.85rem; font-weight: 600; color: ${userActiveCount >= deviceLimit ? '#dc2626' : '#2563eb'};">
            ${userActiveCount} / ${deviceLimit} Devices
          </span>
        </td>
        <td><span class="badge badge-active">Active</span></td>
        <td style="text-align: right;">
          <button class="btn btn-danger-outline btn-sm" onclick="window.forceLogoutSession('${ses.sessionId}')">
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
      <td>
        <span class="badge" style="background: #f8fafc; color: var(--text-main); border: 1px solid var(--border); font-weight: 700;">
          ${log.action || 'Admin Action'}
        </span>
      </td>
      <td><strong style="color: var(--primary); font-size: 0.875rem;">${log.target || '—'}</strong></td>
      <td><span style="font-size: 0.825rem; color: var(--text-body);">${log.details || 'Success'}</span></td>
      <td><span style="font-size: 0.775rem; color: var(--text-muted);">${log.admin || 'Super Admin'}</span></td>
      <td><span style="font-size: 0.775rem; color: var(--text-muted);">${log.formattedTime || 'Just now'}</span></td>
    </tr>
  `).join("");
}

/**
 * Single-Screen Dedicated School Management Page
 */
window.openSchoolDetails = (schoolId) => {
  const school = liveSchools.find((s) => s.schoolId === schoolId);
  if (!school) return;

  selectedSchool = school;
  refreshSchoolDetailsView();
  window.switchSchoolTab("overview");

  window.navigateView("school-details");
  document.getElementById("page-view-title").textContent = `School: ${school.schoolName}`;
};

function refreshSchoolDetailsView() {
  if (!selectedSchool) return;
  const s = selectedSchool;

  const initial = s.logoInitial || s.schoolName?.substring(0, 2).toUpperCase() || "SC";
  const avatarEl = document.getElementById("sd-avatar");
  if (avatarEl) {
    avatarEl.innerHTML = s.logoUrl
      ? `<img src="${s.logoUrl}" alt="${s.schoolName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span style="display:none;">${initial}</span>`
      : initial;
  }

  const setText = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  setText("sd-name", s.schoolName || s.name);
  setText("sd-id", s.schoolId);
  setText("sd-firebase-uid", s.firebaseUid || "Not assigned");
  setText("sd-admin-email", s.adminEmail || "No admin contact");

  // Overview Tab Data
  setText("info-school-name", s.schoolName || s.name);
  setText("info-school-id", s.schoolId);
  setText("info-school-uid", s.firebaseUid || "Not assigned");
  setText("info-school-status", s.status);
  setText("info-school-email", s.adminEmail || "None");
  setText("info-school-address", s.address || "Campus Address");
  setText("info-school-logourl", s.logoUrl || "None configured");
  setText("sd-student-placeholder-id", s.schoolId);

  const statusBadge = document.getElementById("sd-status-badge");
  if (statusBadge) {
    statusBadge.className = `badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}`;
    statusBadge.textContent = s.status;
  }

  const toggleBtn = document.getElementById("sd-toggle-status-btn");
  if (toggleBtn) {
    toggleBtn.textContent = s.status === "Active" ? "Deactivate School" : "Activate School";
    toggleBtn.onclick = async () => {
      try {
        const newStatus = await toggleSchoolStatus(s.schoolId, s.status);
        showToast(`School ${s.schoolName} is now ${newStatus}.`, "success");
      } catch (e) {
        showToast("Failed to toggle status.", "error");
      }
    };
  }

  const editBtn = document.getElementById("sd-edit-school-btn");
  if (editBtn) {
    editBtn.onclick = () => window.openEditSchoolModal();
  }

  const deleteBtn = document.getElementById("sd-delete-btn");
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      const delNameEl = document.getElementById("del-school-name");
      if (delNameEl) delNameEl.textContent = `${s.schoolName} (${s.schoolId})`;
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

  const users = liveUsers.filter((u) => u.schoolId === schoolId);

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">
          No staff users assigned to this school yet.
          <div style="margin-top: 10px;">
            <button class="btn btn-secondary btn-sm" onclick="window.openAddAccountModal('user', '${schoolId}')">+ Add First User</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map((u) => {
    const p = u.permissions || {};
    const activeDevCount = liveSessions.filter((ses) => ses.userUid === u.firebaseUid).length;

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">${u.displayName || u.name}</div>
          <span class="chip-uid">UID: ${u.firebaseUid}</span>
        </td>
        <td><span style="font-size: 0.85rem;">${u.email || '—'}</span></td>
        <td><span class="badge ${u.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${u.status}</span></td>
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
          <button class="btn btn-secondary btn-sm" onclick="window.openEditUserPermsModal('${u.firebaseUid}')">Manage User</button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderSchoolSessionsList(schoolId) {
  const tbody = document.getElementById("sd-sessions-tbody");
  const countEl = document.getElementById("sd-sessions-count");
  if (!tbody) return;

  const sessions = liveSessions.filter((ses) => ses.schoolId === schoolId);
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

  tbody.innerHTML = sessions.map((ses) => `
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
        <button class="btn btn-danger-outline btn-sm" onclick="window.forceLogoutSession('${ses.sessionId}')">
          Force Logout
        </button>
      </td>
    </tr>
  `).join("");
}

window.forceLogoutSession = async (sessionId) => {
  try {
    await terminateSession(sessionId);
    showToast("Device session terminated successfully.", "success");
  } catch (err) {
    console.error("Force logout error:", err);
    showToast("Failed to terminate session.", "error");
  }
};

/**
 * Edit School Modal Handler
 */
window.openEditSchoolModal = () => {
  if (!selectedSchool) return;
  const nameInput = document.getElementById("edit-school-name");
  const logoInput = document.getElementById("edit-school-logo");
  const emailInput = document.getElementById("edit-school-email");
  const addressInput = document.getElementById("edit-school-address");

  if (nameInput) nameInput.value = selectedSchool.schoolName || selectedSchool.name || "";
  if (logoInput) logoInput.value = selectedSchool.logoUrl || "";
  if (emailInput) emailInput.value = selectedSchool.adminEmail || "";
  if (addressInput) addressInput.value = selectedSchool.address || "";

  openModal("modal-edit-school");
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
    btnSchool.classList.add("active");
    btnUser.classList.remove("active");
    formSchool.style.display = "block";
    formUser.style.display = "none";
  } else {
    btnUser.classList.add("active");
    btnSchool.classList.remove("active");
    formSchool.style.display = "none";
    formUser.style.display = "block";
  }
};

function populateSchoolDropdowns() {
  const selUser = document.getElementById("acc-user-school");
  const options = liveSchools.map((s) => `
    <option value="${s.schoolId}">${s.schoolName} (${s.schoolId})</option>
  `).join("");

  if (selUser) selUser.innerHTML = options || `<option value="">No schools available (create a school account first)</option>`;
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
      const img = new Image();
      img.src = url;
      img.onload = () => {
        logoPreview.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover;">`;
      };
      img.onerror = () => {
        logoPreview.innerHTML = `<span style="font-size:0.65rem; color:#ef4444;">Invalid</span>`;
      };
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
      const address = document.getElementById("acc-school-address").value.trim();
      const status = document.getElementById("acc-school-status").value;

      if (!schoolId || !schoolName) {
        showToast("Please provide School ID and School Name.", "error");
        return;
      }

      try {
        await saveSchoolAccount({ schoolId, firebaseUid, schoolName, logoUrl, adminEmail, address, status });
        formSchool.reset();
        closeModal("modal-add-account");
        showToast(`School Account ${schoolName} (${schoolId}) saved successfully!`, "success");
      } catch (err) {
        console.error("Save School error:", err);
        showToast("Failed to save school account.", "error");
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
        await saveUserAccount({ firebaseUid, schoolId, displayName, email, status, deviceLimit, permissions });
        formUser.reset();
        closeModal("modal-add-account");
        showToast(`User account configured under School ID ${schoolId}!`, "success");
      } catch (err) {
        console.error("Save User error:", err);
        showToast("Failed to save user account.", "error");
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
      const address = document.getElementById("edit-school-address").value.trim();

      try {
        await updateSchool(selectedSchool.schoolId, {
          schoolName,
          name: schoolName,
          logoUrl,
          adminEmail,
          address
        });
        closeModal("modal-edit-school");
        showToast(`School ${schoolName} updated successfully!`, "success");
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
               (s.schoolId || "").toLowerCase().includes(q) ||
               (s.firebaseUid || "").toLowerCase().includes(q);
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
               (s.schoolId || "").toLowerCase().includes(q) ||
               (s.firebaseUid || "").toLowerCase().includes(q);
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
        await permanentlyDeleteSchool(selectedSchool.schoolId);
        showToast(`School ${selectedSchool.schoolName} permanently deleted.`, "success");
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
 * Edit User Details & Permissions Modal
 */
window.openEditUserPermsModal = (firebaseUid) => {
  const user = liveUsers.find((u) => u.firebaseUid === firebaseUid || u.uid === firebaseUid);
  if (!user) return;

  selectedUserForPerms = user;
  const titleEl = document.getElementById("m-perm-user-title");
  const subEl = document.getElementById("m-perm-user-sub");

  if (titleEl) titleEl.textContent = user.displayName || user.name || "User";
  if (subEl) subEl.textContent = `School: ${user.schoolId} • UID: ${user.firebaseUid}`;

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

// Save User Permissions Button
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

    try {
      await saveUserAccount({
        firebaseUid: selectedUserForPerms.firebaseUid,
        schoolId: selectedUserForPerms.schoolId,
        displayName: selectedUserForPerms.displayName || selectedUserForPerms.name,
        email: selectedUserForPerms.email,
        status,
        deviceLimit,
        permissions
      });

      closeModal("modal-edit-user-perms");
      showToast(`User settings saved for ${selectedUserForPerms.displayName || selectedUserForPerms.firebaseUid}!`, "success");
    } catch (e) {
      console.error("Save perms error:", e);
      showToast("Failed to update user permissions.", "error");
    }
  });
}

/**
 * Mobile Navigation Drawer
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
