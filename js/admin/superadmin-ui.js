import {
  subscribeToSchools,
  subscribeToUsers,
  subscribeToSessions,
  subscribeToActivityLogs,
  createSchool,
  updateSchool,
  toggleSchoolStatus,
  permanentlyDeleteSchool,
  createUser,
  updateUser,
  updateUserPermissions,
  updateUserDeviceLimit,
  toggleUserStatus,
  sendUserPasswordReset,
  terminateSession
} from "./firestore-service.js";

/**
 * Super Admin UI Controller
 * Connected directly to Cloud Firestore & Firebase Storage. Zero dummy data.
 */

// Live in-memory state updated via Firestore listeners
let liveSchools = [];
let liveUsers = [];
let liveSessions = [];
let liveLogs = [];

// UI State
let currentView = "overview";
let currentTab = "tab-schools-list";
let selectedSchoolForDetails = null;
let selectedUserForPermissions = null;
let sessionToTerminate = null;
let schoolToDeletePermanently = null;

// Toast Notification Engine
export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let iconSvg = "";
  if (type === "success") {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (type === "error") {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  } else if (type === "warning") {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
  } else {
    iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  toast.innerHTML = `${iconSvg}<div class="toast-content">${message}</div>`;
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

/**
 * Initialize Super Admin UI & Live Firestore Listeners
 */
export function initSuperAdminUI() {
  setupNavigation();
  setupTabs();
  setupModals();
  setupForms();
  setupLiveListeners();
  setupSidebarCollapse();
}

/**
 * Setup Real-time Firestore Subscriptions
 */
function setupLiveListeners() {
  // 1. Schools Listener
  subscribeToSchools((schools) => {
    liveSchools = schools;
    updateMetricsUI();
    renderSchoolsTable();
    populateSchoolSelectDropdowns();
    if (selectedSchoolForDetails) {
      window.viewSchoolDetails(selectedSchoolForDetails.id);
    }
  });

  // 2. Users Listener
  subscribeToUsers((users) => {
    liveUsers = users;
    updateMetricsUI();
    renderUsersTable();
    renderPermissionsMatrix();
  });

  // 3. Sessions Listener
  subscribeToSessions((sessions) => {
    liveSessions = sessions;
    updateMetricsUI();
    renderActiveSessions();
    renderOverviewSessionsPreview();
  });

  // 4. Activity Logs Listener
  subscribeToActivityLogs((logs) => {
    liveLogs = logs;
    renderActivityLogs();
    renderOverviewRecentLogs();
  });
}

/**
 * Main Sidebar View Navigation
 */
function setupNavigation() {
  const navLinks = document.querySelectorAll("[data-nav-view]");
  const viewSections = document.querySelectorAll(".view-section");
  const headerSubtitle = document.getElementById("header-current-view-title");

  const viewTitles = {
    overview: "Overview & Control Center",
    "schools-users": "Schools & Users Management",
    permissions: "Individual Permissions Matrix",
    sessions: "Active Sessions & Device Monitoring",
    logs: "System Activity & Edit Audit Trail"
  };

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetView = link.getAttribute("data-nav-view");
      if (!targetView) return;

      currentView = targetView;

      navLinks.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      viewSections.forEach((section) => {
        if (section.id === `view-${targetView}`) {
          section.classList.add("active");
        } else {
          section.classList.remove("active");
        }
      });

      if (headerSubtitle && viewTitles[targetView]) {
        headerSubtitle.textContent = viewTitles[targetView];
      }

      const sidebar = document.getElementById("sidebar");
      const backdrop = document.getElementById("sidebar-backdrop");
      if (sidebar && backdrop) {
        sidebar.classList.remove("open");
        backdrop.classList.remove("open");
      }

      const mainWrapper = document.querySelector(".main-wrapper");
      if (mainWrapper) mainWrapper.scrollTop = 0;
    });
  });

  // Setup Quick Action link routing
  document.querySelectorAll("[data-quick-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-quick-nav");
      const tab = btn.getAttribute("data-quick-tab");
      const navLink = document.querySelector(`[data-nav-view="${view}"]`);
      if (navLink) navLink.click();
      if (tab) {
        setTimeout(() => {
          const tabBtn = document.querySelector(`[data-tab="${tab}"]`);
          if (tabBtn) tabBtn.click();
        }, 50);
      }
    });
  });
}

/**
 * Setup Tabs in Schools & Users Section
 */
function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-tab");
      if (!target) return;

      currentTab = target;
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      tabPanels.forEach((panel) => {
        if (panel.id === target) {
          panel.classList.add("active");
        } else {
          panel.classList.remove("active");
        }
      });
    });
  });
}

/**
 * Setup Forms (Add School, Create User)
 */
function setupForms() {
  // Live School Logo URL Preview
  const logoUrlInput = document.getElementById("new-school-logo-url");
  const logoPreviewBox = document.getElementById("new-school-logo-preview");

  if (logoUrlInput && logoPreviewBox) {
    logoUrlInput.addEventListener("input", () => {
      const url = logoUrlInput.value.trim();
      if (!url) {
        logoPreviewBox.innerHTML = `<span style="font-size: 0.7rem; color: #94a3b8; font-weight: 600;">Logo</span>`;
        return;
      }

      const img = new Image();
      img.src = url;
      img.onload = () => {
        logoPreviewBox.innerHTML = `<img src="${url}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover;">`;
      };
      img.onerror = () => {
        logoPreviewBox.innerHTML = `<span style="font-size: 0.65rem; color: #ef4444; font-weight: 600; text-align: center;">Invalid</span>`;
      };
    });
  }

  // 1. Create School Form Submission
  const formCreateSchool = document.getElementById("form-create-school");
  if (formCreateSchool) {
    formCreateSchool.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = formCreateSchool.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Provisioning School...";
      }

      const name = document.getElementById("new-school-name").value.trim();
      const schoolId = document.getElementById("new-school-id").value.trim();
      const adminEmail = document.getElementById("new-school-admin").value.trim();
      const address = document.getElementById("new-school-address").value.trim();
      const status = document.getElementById("new-school-status").value;
      const logoUrl = document.getElementById("new-school-logo-url")?.value.trim() || "";

      if (!name || !adminEmail) {
        showToast("Please enter school name and admin email.", "warning");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create & Provision School";
        }
        return;
      }

      try {
        await createSchool({
          name,
          shortCode: name.substring(0, 3).toUpperCase(),
          schoolId,
          adminEmail,
          address,
          status,
          logoUrl
        });

        formCreateSchool.reset();
        if (logoPreviewBox) {
          logoPreviewBox.innerHTML = `<span style="font-size: 0.7rem; color: #94a3b8; font-weight: 600;">Logo</span>`;
        }
        showToast(`School "${name}" registered successfully!`, "success");
        document.querySelector('[data-tab="tab-schools-list"]')?.click();
      } catch (err) {
        console.error("Error creating school:", err);
        showToast("Failed to create school. Please try again.", "error");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create & Provision School";
        }
      }
    });
  }

  // 2. Create User Form Submission
  const formCreateUser = document.getElementById("form-create-user");
  if (formCreateUser) {
    formCreateUser.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = formCreateUser.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Creating Account...";
      }

      const name = document.getElementById("new-user-name").value.trim();
      const email = document.getElementById("new-user-email").value.trim();
      const schoolSelect = document.getElementById("new-user-school");
      const schoolId = schoolSelect?.value || "";
      const schoolName = schoolSelect?.options[schoolSelect.selectedIndex]?.text || "School";
      const role = document.getElementById("new-user-role").value;
      const status = document.getElementById("new-user-status").value;
      const deviceLimit = document.getElementById("new-user-device-limit")?.value || 3;

      if (!name || !email || !schoolId) {
        showToast("Please fill all required fields and select an assigned school.", "warning");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create User Account";
        }
        return;
      }

      try {
        await createUser({
          schoolId,
          schoolName,
          name,
          email,
          role,
          status,
          deviceLimit: Number(deviceLimit) || 3,
          permissions: {
            editable: true,
            addStudent: true,
            deleteStudent: false,
            excelExport: true,
            reports: false
          }
        });

        formCreateUser.reset();
        showToast(`User "${name}" created under ${schoolName}!`, "success");
        document.querySelector('[data-tab="tab-users-list"]')?.click();
      } catch (err) {
        console.error("Error creating user:", err);
        showToast("Failed to create user account. Please try again.", "error");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Create User Account";
        }
      }
    });
  }

  // Search & Filter listeners
  setupFilters();
}

/**
 * Setup Search & Filter Handlers
 */
function setupFilters() {
  // Search Schools
  const searchSchoolsInput = document.getElementById("search-schools-input");
  const filterSchoolsStatus = document.getElementById("filter-schools-status");
  if (searchSchoolsInput && filterSchoolsStatus) {
    const handleFilter = () => {
      const q = searchSchoolsInput.value.toLowerCase().trim();
      const status = filterSchoolsStatus.value;
      const filtered = liveSchools.filter((s) => {
        const matchesQ = (s.name || "").toLowerCase().includes(q) || (s.id || "").toLowerCase().includes(q) || (s.adminEmail || "").toLowerCase().includes(q);
        const matchesStatus = status === "ALL" || s.status === status;
        return matchesQ && matchesStatus;
      });
      renderSchoolsTable(filtered);
    };
    searchSchoolsInput.addEventListener("input", handleFilter);
    filterSchoolsStatus.addEventListener("change", handleFilter);
  }

  // Search Users
  const searchUsersInput = document.getElementById("search-users-input");
  const filterUsersRole = document.getElementById("filter-users-role");
  if (searchUsersInput && filterUsersRole) {
    const handleFilter = () => {
      const q = searchUsersInput.value.toLowerCase().trim();
      const role = filterUsersRole.value;
      const filtered = liveUsers.filter((u) => {
        const matchesQ = (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) || (u.schoolName || "").toLowerCase().includes(q);
        const matchesRole = role === "ALL" || u.role === role;
        return matchesQ && matchesRole;
      });
      renderUsersTable(filtered);
    };
    searchUsersInput.addEventListener("input", handleFilter);
    filterUsersRole.addEventListener("change", handleFilter);
  }

  // Search Sessions
  const searchSessionsInput = document.getElementById("search-sessions-input");
  const filterSessionsDevice = document.getElementById("filter-sessions-device");
  const filterSessionsStatus = document.getElementById("filter-sessions-status");
  if (searchSessionsInput && filterSessionsDevice && filterSessionsStatus) {
    const handleFilter = () => {
      const q = searchSessionsInput.value.toLowerCase().trim();
      const dev = filterSessionsDevice.value;
      const st = filterSessionsStatus.value;
      const filtered = liveSessions.filter((s) => {
        const matchesQ = (s.userName || "").toLowerCase().includes(q) || (s.userEmail || "").toLowerCase().includes(q) || (s.schoolName || "").toLowerCase().includes(q);
        const matchesDev = dev === "ALL" || s.deviceType === dev;
        const matchesSt = st === "ALL" || s.status === st;
        return matchesQ && matchesDev && matchesSt;
      });
      renderActiveSessions(filtered);
    };
    searchSessionsInput.addEventListener("input", handleFilter);
    filterSessionsDevice.addEventListener("change", handleFilter);
    filterSessionsStatus.addEventListener("change", handleFilter);
  }

  // Search Logs
  const searchLogsInput = document.getElementById("search-logs-input");
  const filterLogsModule = document.getElementById("filter-logs-module");
  const filterLogsAction = document.getElementById("filter-logs-action");
  if (searchLogsInput && filterLogsModule && filterLogsAction) {
    const handleFilter = () => {
      const q = searchLogsInput.value.toLowerCase().trim();
      const mod = filterLogsModule.value;
      const act = filterLogsAction.value;
      const filtered = liveLogs.filter((log) => {
        const matchesQ = (log.user || "").toLowerCase().includes(q) || (log.school || "").toLowerCase().includes(q) || (log.recordName || "").toLowerCase().includes(q) || (log.field || "").toLowerCase().includes(q);
        const matchesMod = mod === "ALL" || log.module === mod;
        const matchesAct = act === "ALL" || log.action === act;
        return matchesQ && matchesMod && matchesAct;
      });
      renderActivityLogs(filtered);
    };
    searchLogsInput.addEventListener("input", handleFilter);
    filterLogsModule.addEventListener("change", handleFilter);
    filterLogsAction.addEventListener("change", handleFilter);
  }
}

/**
 * Setup Modal Event Listeners
 */
function setupModals() {
  document.querySelectorAll("[data-modal-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modalId = btn.getAttribute("data-modal-close");
      closeModal(modalId);
    });
  });

  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.classList.remove("open");
    });
  });

  // Force Logout Confirm
  const confirmTerminateBtn = document.getElementById("confirm-terminate-session-btn");
  if (confirmTerminateBtn) {
    confirmTerminateBtn.addEventListener("click", async () => {
      if (sessionToTerminate) {
        try {
          await terminateSession(sessionToTerminate.id, sessionToTerminate.userEmail, sessionToTerminate.schoolName);
          showToast(`Session for ${sessionToTerminate.userName} terminated.`, "success");
        } catch (e) {
          showToast("Failed to terminate session.", "error");
        }
      }
      closeModal("modal-force-logout");
      sessionToTerminate = null;
    });
  }

  // Danger Zone: Type School ID Confirmation Input
  const deleteConfirmInput = document.getElementById("delete-school-confirm-input");
  const deleteConfirmBtn = document.getElementById("confirm-permanent-delete-school-btn");
  if (deleteConfirmInput && deleteConfirmBtn) {
    deleteConfirmInput.addEventListener("input", () => {
      if (schoolToDeletePermanently && deleteConfirmInput.value.trim().toUpperCase() === schoolToDeletePermanently.id.toUpperCase()) {
        deleteConfirmBtn.disabled = false;
      } else {
        deleteConfirmBtn.disabled = true;
      }
    });

    deleteConfirmBtn.addEventListener("click", async () => {
      if (!schoolToDeletePermanently) return;
      deleteConfirmBtn.disabled = true;
      deleteConfirmBtn.textContent = "Deleting...";

      try {
        await permanentlyDeleteSchool(schoolToDeletePermanently.id, schoolToDeletePermanently.name);
        showToast(`School "${schoolToDeletePermanently.name}" was permanently deleted.`, "success");
        closeModal("modal-danger-delete-school");
        closeModal("modal-school-detail");
        schoolToDeletePermanently = null;
      } catch (err) {
        console.error("Permanent deletion error:", err);
        showToast("Failed to delete school. Please check permissions.", "error");
      } finally {
        deleteConfirmBtn.disabled = true;
        deleteConfirmBtn.textContent = "Permanently Delete";
      }
    });
  }

  // User Individual Permissions Save Modal Button
  const saveUserPermsBtn = document.getElementById("save-user-permissions-modal-btn");
  if (saveUserPermsBtn) {
    saveUserPermsBtn.addEventListener("click", async () => {
      if (!selectedUserForPermissions) return;
      saveUserPermsBtn.disabled = true;
      saveUserPermsBtn.textContent = "Saving...";

      const permissions = {
        editable: document.getElementById("modal-perm-editable")?.checked || false,
        addStudent: document.getElementById("modal-perm-addStudent")?.checked || false,
        deleteStudent: document.getElementById("modal-perm-deleteStudent")?.checked || false,
        excelExport: document.getElementById("modal-perm-excelExport")?.checked || false,
        reports: document.getElementById("modal-perm-reports")?.checked || false
      };

      const deviceLimit = Number(document.getElementById("modal-device-limit-val")?.textContent) || 3;

      try {
        await updateUserPermissions(selectedUserForPermissions.id, permissions, selectedUserForPermissions.name, selectedUserForPermissions.schoolName);
        await updateUserDeviceLimit(selectedUserForPermissions.id, deviceLimit, selectedUserForPermissions.name, selectedUserForPermissions.schoolName);
        showToast(`Permissions updated for ${selectedUserForPermissions.name}!`, "success");
        closeModal("modal-user-permissions");
      } catch (err) {
        console.error("Error saving user permissions:", err);
        showToast("Failed to save permissions.", "error");
      } finally {
        saveUserPermsBtn.disabled = false;
        saveUserPermsBtn.textContent = "Save Changes";
      }
    });
  }
}

/**
 * 1. Overview Screen Updates
 */
function updateMetricsUI() {
  const totalSchools = liveSchools.length;
  const activeSchools = liveSchools.filter((s) => s.status === "Active").length;
  const inactiveSchools = liveSchools.filter((s) => s.status === "Inactive").length;
  const totalUsers = liveUsers.length;
  const activeSessions = liveSessions.filter((s) => s.status === "Active").length;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setVal("metric-total-schools", totalSchools);
  setVal("metric-active-schools", activeSchools);
  setVal("metric-inactive-schools", inactiveSchools);
  setVal("metric-total-users", totalUsers);
  setVal("metric-active-sessions", activeSessions);

  const badgeSessions = document.getElementById("sidebar-badge-sessions");
  if (badgeSessions) badgeSessions.textContent = activeSessions;
  const badgeSchools = document.getElementById("sidebar-badge-schools");
  if (badgeSchools) badgeSchools.textContent = totalSchools;
}

function renderOverviewRecentLogs() {
  const container = document.getElementById("overview-recent-logs-list");
  if (!container) return;

  if (liveLogs.length === 0) {
    container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--color-text-muted); font-size: 0.85rem;">No activity recorded yet.</div>`;
    return;
  }

  const logs = liveLogs.slice(0, 4);
  container.innerHTML = logs.map((log) => `
    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--color-border-subtle);">
      <div>
        <div style="font-size: 0.85rem; font-weight: 600; color: var(--color-text-main);">
          <span class="action-badge action-badge-${(log.action || 'edit').toLowerCase()}">${log.action}</span>
          ${log.user} &bull; <span style="color: var(--color-text-muted); font-weight: normal;">${log.module}</span>
        </div>
        <div style="font-size: 0.775rem; color: var(--color-text-muted); margin-top: 4px;">
          ${log.recordName} (${log.field})
        </div>
      </div>
      <div style="font-size: 0.75rem; color: var(--color-text-subtle); white-space: nowrap;">
        ${log.formattedTime}
      </div>
    </div>
  `).join("");
}

function renderOverviewSessionsPreview() {
  const container = document.getElementById("overview-sessions-preview-list");
  if (!container) return;

  if (liveSessions.length === 0) {
    container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--color-text-muted); font-size: 0.85rem;">No active sessions connected.</div>`;
    return;
  }

  const sessions = liveSessions.slice(0, 4);
  container.innerHTML = sessions.map((ses) => `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--color-border-subtle);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 32px; height: 32px; border-radius: 6px; background: #eff6ff; color: #2563eb; display: flex; align-items: center; justify-content: center;">
          <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${ses.deviceType === 'Mobile' 
              ? '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>' 
              : '<rect width="20" height="14" x="2" y="3" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>'}
          </svg>
        </div>
        <div>
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--color-text-main);">
            ${ses.userName || 'User'} ${ses.isCurrent ? '<span class="current-session-indicator">You</span>' : ''}
          </div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted);">${ses.schoolName || 'School'}</div>
        </div>
      </div>
      <span class="badge ${ses.status === 'Active' ? 'badge-active' : 'badge-idle'}">${ses.status || 'Active'}</span>
    </div>
  `).join("");
}

/**
 * 2. Schools & Users Table Rendering
 */

/**
 * Helper to render school logo with resilient onerror fallback to monogram badge
 */
function getSchoolLogoHtml(school, size = 34) {
  const initial = school.logoInitial || (school.name ? school.name.substring(0, 2).toUpperCase() : "SC");
  const cleanUrl = school.logoUrl ? school.logoUrl.trim() : "";
  if (cleanUrl) {
    return `
      <div style="position: relative; width: ${size}px; height: ${size}px; flex-shrink: 0;">
        <img src="${cleanUrl}" alt="${school.name}" 
             style="width: 100%; height: 100%; border-radius: 6px; object-fit: cover; display: block;" 
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
        <div class="school-logo-badge" style="display: none; width: 100%; height: 100%; position: absolute; inset: 0;">${initial}</div>
      </div>
    `;
  }
  return `<div class="school-logo-badge" style="width: ${size}px; height: ${size}px;">${initial}</div>`;
}

function renderSchoolsTable(schools = liveSchools) {
  const tbody = document.getElementById("schools-table-body");
  const mobileContainer = document.getElementById("schools-mobile-cards");

  if (!tbody || !mobileContainer) return;

  if (schools.length === 0) {
    const emptyHtml = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"></path><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path></svg>
        </div>
        <h3>No schools added yet</h3>
        <p>Start by registering your first school institution into the centralized system.</p>
        <button class="btn btn-primary btn-sm" onclick="document.querySelector('[data-tab=\\'tab-create-school\\']').click()">+ Add School</button>
      </div>
    `;
    tbody.innerHTML = `<tr><td colspan="6">${emptyHtml}</td></tr>`;
    mobileContainer.innerHTML = emptyHtml;
    return;
  }

  tbody.innerHTML = schools.map((s) => {
    const logoHtml = getSchoolLogoHtml(s, 34);

    return `
      <tr>
        <td>
          <div class="cell-school-info">
            ${logoHtml}
            <div>
              <div class="cell-school-name">${s.name}</div>
              <div class="cell-school-id">${s.id} &bull; Code: ${s.shortCode || 'SCH'}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${s.status}</span>
        </td>
        <td><strong>${s.usersCount || 0}</strong> Users</td>
        <td><span style="font-size: 0.85rem; color: #334155;">${s.adminEmail || 'No email'}</span></td>
        <td><span style="font-size: 0.8rem; color: #64748b;">${s.createdDate}</span></td>
        <td>
          <div class="row-actions">
            <button class="btn btn-secondary btn-sm" onclick="window.viewSchoolDetails('${s.id}')">View Details</button>
            <button class="btn btn-secondary btn-sm" onclick="window.toggleSchoolStatus('${s.id}', '${s.status}', '${s.name.replace(/'/g, "\\'")}')">
              ${s.status === 'Active' ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  mobileContainer.innerHTML = schools.map((s) => {
    const logoHtml = getSchoolLogoHtml(s, 34);

    return `
      <div class="mobile-data-card">
        <div class="mobile-card-header">
          <div class="cell-school-info">
            ${logoHtml}
            <div>
              <div class="cell-school-name">${s.name}</div>
              <div class="cell-school-id">${s.id}</div>
            </div>
          </div>
          <span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${s.status}</span>
        </div>
        <div class="mobile-card-details">
          <div class="mobile-detail-item">
            <span class="mobile-detail-label">Admin Contact</span>
            <span class="mobile-detail-val" style="word-break: break-all; font-size: 0.8rem;">${s.adminEmail}</span>
          </div>
          <div class="mobile-detail-item">
            <span class="mobile-detail-label">Users Enrolled</span>
            <span class="mobile-detail-val">${s.usersCount || 0} Accounts</span>
          </div>
        </div>
        <div class="mobile-card-actions">
          <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="window.viewSchoolDetails('${s.id}')">View Details</button>
          <button class="btn btn-secondary btn-sm" onclick="window.toggleSchoolStatus('${s.id}', '${s.status}', '${s.name.replace(/'/g, "\\'")}')">
            ${s.status === 'Active' ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function renderUsersTable(users = liveUsers) {
  const tbody = document.getElementById("users-table-body");
  const mobileContainer = document.getElementById("users-mobile-cards");

  if (!tbody || !mobileContainer) return;

  if (users.length === 0) {
    const emptyHtml = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
        </div>
        <h3>No users created yet</h3>
        <p>Add staff, teachers, or administrator accounts under any registered school.</p>
        <button class="btn btn-primary btn-sm" onclick="document.querySelector('[data-tab=\\'tab-create-user\\']').click()">+ Create User</button>
      </div>
    `;
    tbody.innerHTML = `<tr><td colspan="6">${emptyHtml}</td></tr>`;
    mobileContainer.innerHTML = emptyHtml;
    return;
  }

  tbody.innerHTML = users.map((u) => `
    <tr>
      <td>
        <div>
          <div style="font-weight: 600; color: var(--color-text-main);">${u.name}</div>
          <div style="font-size: 0.775rem; color: var(--color-text-muted);">${u.userId || u.id}</div>
        </div>
      </td>
      <td><span style="font-size: 0.85rem; color: #1e293b;">${u.email}</span></td>
      <td><span style="font-size: 0.85rem;">${u.schoolName}</span></td>
      <td><span class="badge badge-role">${u.role || 'Teacher'}</span></td>
      <td><span class="badge ${u.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${u.status}</span></td>
      <td>
        <div class="row-actions">
          <button class="btn btn-secondary btn-sm" onclick="window.editUserPermissionsModal('${u.id}')">Permissions (${u.deviceLimit || 3} Dev)</button>
          <button class="btn btn-secondary btn-sm" onclick="window.triggerPasswordReset('${u.email}')">Reset Pwd</button>
          <button class="btn btn-secondary btn-sm" onclick="window.toggleUserStatus('${u.id}', '${u.status}', '${u.name.replace(/'/g, "\\'")}', '${u.schoolName.replace(/'/g, "\\'")}')">
            ${u.status === 'Active' ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  mobileContainer.innerHTML = users.map((u) => `
    <div class="mobile-data-card">
      <div class="mobile-card-header">
        <div>
          <div style="font-weight: 700; font-size: 0.95rem; color: var(--color-text-main);">${u.name}</div>
          <div style="font-size: 0.8rem; color: var(--color-text-muted);">${u.email}</div>
        </div>
        <span class="badge ${u.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${u.status}</span>
      </div>
      <div class="mobile-card-details">
        <div class="mobile-detail-item">
          <span class="mobile-detail-label">School</span>
          <span class="mobile-detail-val">${u.schoolName}</span>
        </div>
        <div class="mobile-detail-item">
          <span class="mobile-detail-label">Role / Device Limit</span>
          <span class="mobile-detail-val"><span class="badge badge-role">${u.role}</span> (${u.deviceLimit || 3} Dev)</span>
        </div>
      </div>
      <div class="mobile-card-actions">
        <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="window.editUserPermissionsModal('${u.id}')">Permissions</button>
        <button class="btn btn-secondary btn-sm" onclick="window.triggerPasswordReset('${u.email}')">Reset Pwd</button>
        <button class="btn btn-secondary btn-sm" onclick="window.toggleUserStatus('${u.id}', '${u.status}', '${u.name.replace(/'/g, "\\'")}', '${u.schoolName.replace(/'/g, "\\'")}')">
          ${u.status === 'Active' ? 'Deactivate' : 'Activate'}
        </button>
      </div>
    </div>
  `).join("");
}

function populateSchoolSelectDropdowns() {
  const select = document.getElementById("new-user-school");
  const permSchoolSelect = document.getElementById("permissions-school-select");

  const optionsHtml = liveSchools.map((s) => `
    <option value="${s.id}">${s.name} (${s.id})</option>
  `).join("");

  if (select) {
    select.innerHTML = optionsHtml || `<option value="">No schools available (create a school first)</option>`;
  }
  if (permSchoolSelect) {
    permSchoolSelect.innerHTML = optionsHtml || `<option value="">No schools available</option>`;
  }
}

/**
 * School Details Modal View
 */
window.viewSchoolDetails = (schoolId) => {
  const school = liveSchools.find((s) => s.id === schoolId);
  if (!school) return;

  selectedSchoolForDetails = school;
  const schoolUsers = liveUsers.filter((u) => u.schoolId === school.id);

  const logoBadge = getSchoolLogoHtml(school, 52);

  const content = document.getElementById("modal-school-detail-content");
  if (content) {
    content.innerHTML = `
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--color-border);">
        ${logoBadge}
        <div>
          <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--color-text-main);">${school.name}</h3>
          <div style="font-size: 0.85rem; color: var(--color-text-muted);">ID: ${school.id} &bull; Short Code: ${school.shortCode}</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; font-size: 0.875rem; margin-bottom: 20px;">
        <div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Status</div>
          <div style="margin-top: 4px;"><span class="badge ${school.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${school.status}</span></div>
        </div>
        <div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Total Users</div>
          <div style="font-weight: 600; margin-top: 4px;">${schoolUsers.length} Active Accounts</div>
        </div>
        <div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Administrator Email</div>
          <div style="font-weight: 600; margin-top: 4px;">${school.adminEmail}</div>
        </div>
        <div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Registration Date</div>
          <div style="font-weight: 600; margin-top: 4px;">${school.createdDate}</div>
        </div>
        <div style="grid-column: 1 / -1;">
          <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Campus Location</div>
          <div style="font-weight: 500; margin-top: 4px;">${school.address}</div>
        </div>
      </div>

      <!-- Users in this school list -->
      <div style="margin-bottom: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <h4 style="font-size: 0.95rem; font-weight: 700;">Enrolled School Users (${schoolUsers.length})</h4>
          <button class="btn btn-secondary btn-sm" onclick="window.quickAddUserToSchool('${school.id}', '${school.name.replace(/'/g, "\\'")}')">+ Add User</button>
        </div>
        ${schoolUsers.length === 0 ? `
          <div style="padding: 16px; background: #f8fafc; border: 1px solid var(--color-border); border-radius: 8px; text-align: center; color: var(--color-text-muted); font-size: 0.85rem;">
            No users added to this school yet.
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto;">
            ${schoolUsers.map(u => `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #f8fafc; border: 1px solid var(--color-border); border-radius: 8px;">
                <div>
                  <div style="font-weight: 600; font-size: 0.875rem;">${u.name} <span class="badge badge-role" style="font-size: 0.7rem; margin-left: 4px;">${u.role}</span></div>
                  <div style="font-size: 0.775rem; color: var(--color-text-muted);">${u.email}</div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="window.editUserPermissionsModal('${u.id}')">Permissions</button>
              </div>
            `).join("")}
          </div>
        `}
      </div>

      <!-- Danger Zone -->
      <div style="padding: 16px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px;">
        <h4 style="font-size: 0.9rem; font-weight: 700; color: #9f1239; margin-bottom: 4px;">Danger Zone</h4>
        <p style="font-size: 0.8rem; color: #881337; margin-bottom: 12px;">Permanently remove this institution from Cloud Firestore. This operation cannot be undone.</p>
        <button class="btn btn-danger-outline btn-sm" onclick="window.openDangerDeleteSchoolModal('${school.id}', '${school.name.replace(/'/g, "\\'")}')">
          Permanently Delete School
        </button>
      </div>
    `;
  }
  openModal("modal-school-detail");
};

window.quickAddUserToSchool = (schoolId, schoolName) => {
  closeModal("modal-school-detail");
  const navLink = document.querySelector('[data-nav-view="schools-users"]');
  if (navLink) navLink.click();
  const tabBtn = document.querySelector('[data-tab="tab-create-user"]');
  if (tabBtn) tabBtn.click();
  const select = document.getElementById("new-user-school");
  if (select) select.value = schoolId;
};

window.toggleSchoolStatus = async (schoolId, currentStatus, schoolName) => {
  try {
    const newStatus = await toggleSchoolStatus(schoolId, currentStatus, schoolName);
    showToast(`School "${schoolName}" is now ${newStatus}.`, "info");
  } catch (err) {
    showToast("Failed to update school status.", "error");
  }
};

window.toggleUserStatus = async (userId, currentStatus, userName, schoolName) => {
  try {
    const newStatus = await toggleUserStatus(userId, currentStatus, userName, schoolName);
    showToast(`User ${userName} is now ${newStatus}.`, "info");
  } catch (err) {
    showToast("Failed to update user status.", "error");
  }
};

window.triggerPasswordReset = async (email) => {
  try {
    await sendUserPasswordReset(email);
    showToast(`Password reset link sent to ${email}.`, "success");
  } catch (err) {
    console.error("Password reset error:", err);
    showToast("Could not send password reset email.", "error");
  }
};

window.openDangerDeleteSchoolModal = (schoolId, schoolName) => {
  schoolToDeletePermanently = { id: schoolId, name: schoolName };
  const nameEl = document.getElementById("danger-delete-school-name");
  const idEl = document.getElementById("danger-delete-school-id");
  const input = document.getElementById("delete-school-confirm-input");
  const btn = document.getElementById("confirm-permanent-delete-school-btn");

  if (nameEl) nameEl.textContent = schoolName;
  if (idEl) idEl.textContent = schoolId;
  if (input) input.value = "";
  if (btn) btn.disabled = true;

  openModal("modal-danger-delete-school");
};

/**
 * User Individual Permissions Modal
 */
window.editUserPermissionsModal = (userId) => {
  const user = liveUsers.find((u) => u.id === userId);
  if (!user) return;

  selectedUserForPermissions = user;
  const userTitle = document.getElementById("modal-user-perm-title");
  const userSub = document.getElementById("modal-user-perm-sub");

  if (userTitle) userTitle.textContent = `Permissions: ${user.name}`;
  if (userSub) userSub.textContent = `${user.email} &bull; ${user.role} (${user.schoolName})`;

  const perms = user.permissions || {
    editable: true,
    addStudent: true,
    deleteStudent: false,
    excelExport: true,
    reports: false
  };

  const setCheckbox = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  };

  setCheckbox("modal-perm-editable", perms.editable);
  setCheckbox("modal-perm-addStudent", perms.addStudent);
  setCheckbox("modal-perm-deleteStudent", perms.deleteStudent);
  setCheckbox("modal-perm-excelExport", perms.excelExport);
  setCheckbox("modal-perm-reports", perms.reports);

  const limitVal = document.getElementById("modal-device-limit-val");
  if (limitVal) limitVal.textContent = user.deviceLimit || 3;

  openModal("modal-user-permissions");
};

window.stepModalDeviceLimit = (delta) => {
  const el = document.getElementById("modal-device-limit-val");
  if (!el) return;
  let current = Number(el.textContent) || 3;
  let next = Math.max(1, Math.min(15, current + delta));
  el.textContent = next;
};

/**
 * 3. Permissions View (School/User Policy Browser)
 */
function renderPermissionsMatrix() {
  const container = document.getElementById("permissions-matrix-grid");
  if (!container) return;

  if (liveUsers.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 32px; text-align: center; color: var(--color-text-muted);">
        <p>No user accounts found in Firestore. Create a user to configure permissions.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = liveUsers.map((u) => {
    const perms = u.permissions || {
      editable: true,
      addStudent: true,
      deleteStudent: false,
      excelExport: true,
      reports: false
    };

    return `
      <div class="permission-box">
        <div class="permission-info">
          <h4>
            <span class="badge badge-role" style="font-size: 0.725rem;">${u.role}</span>
            ${u.name}
          </h4>
          <p style="margin-top: 2px;">${u.email} &bull; <strong>${u.schoolName}</strong></p>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px;">
            <span class="badge ${perms.editable ? 'badge-active' : 'badge-inactive'}">Editable: ${perms.editable ? 'ON' : 'OFF'}</span>
            <span class="badge ${perms.addStudent ? 'badge-active' : 'badge-inactive'}">Add Student: ${perms.addStudent ? 'ON' : 'OFF'}</span>
            <span class="badge ${perms.deleteStudent ? 'badge-active' : 'badge-inactive'}">Delete Student: ${perms.deleteStudent ? 'ON' : 'OFF'}</span>
            <span class="badge ${perms.excelExport ? 'badge-active' : 'badge-inactive'}">Excel: ${perms.excelExport ? 'ON' : 'OFF'}</span>
            <span class="badge ${perms.reports ? 'badge-active' : 'badge-inactive'}">Reports: ${perms.reports ? 'ON' : 'OFF'}</span>
          </div>
        </div>
        <div class="switch-wrapper" style="padding-top: 12px;">
          <span style="font-size: 0.8rem; font-weight: 600; color: #475569;">Device Limit: ${u.deviceLimit || 3}</span>
          <button class="btn btn-secondary btn-sm" onclick="window.editUserPermissionsModal('${u.id}')">Edit Permissions</button>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * 4. Active Sessions View
 */
function renderActiveSessions(sessions = liveSessions) {
  const tbody = document.getElementById("sessions-table-body");
  const mobileContainer = document.getElementById("sessions-mobile-cards");

  if (!tbody || !mobileContainer) return;

  if (sessions.length === 0) {
    const emptyHtml = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="12" x="3" y="4" rx="2"></rect><line x1="2" y1="20" x2="22" y2="20"></line></svg>
        </div>
        <h3>No active sessions</h3>
        <p>Live connected devices and authenticated staff sessions will appear here in real time.</p>
      </div>
    `;
    tbody.innerHTML = `<tr><td colspan="7">${emptyHtml}</td></tr>`;
    mobileContainer.innerHTML = emptyHtml;
    return;
  }

  tbody.innerHTML = sessions.map((s) => `
    <tr>
      <td>
        <div>
          <div style="font-weight: 600; color: var(--color-text-main);">${s.userName || 'User'}</div>
          <div style="font-size: 0.775rem; color: var(--color-text-muted);">${s.userEmail || ''}</div>
        </div>
      </td>
      <td><span style="font-size: 0.85rem;">${s.schoolName || 'School'}</span></td>
      <td>
        <div class="session-device-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${s.deviceType === 'Mobile' 
              ? '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>' 
              : '<rect width="20" height="14" x="2" y="3" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>'}
          </svg>
          ${s.deviceType || 'Desktop'}
        </div>
      </td>
      <td>
        <div>
          <div style="font-size: 0.825rem; font-weight: 500;">${s.browser || 'Browser'}</div>
          <div style="font-size: 0.725rem; color: var(--color-text-muted);">${s.os || 'OS'}</div>
        </div>
      </td>
      <td><span style="font-size: 0.8rem; color: #475569;">${s.loginTime || 'Active'}</span></td>
      <td><span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-idle'}">${s.status || 'Active'}</span></td>
      <td>
        <button class="btn btn-danger-outline btn-sm" onclick="window.requestForceLogout('${s.id}')">Force Logout</button>
      </td>
    </tr>
  `).join("");

  mobileContainer.innerHTML = sessions.map((s) => `
    <div class="mobile-data-card">
      <div class="mobile-card-header">
        <div>
          <div style="font-weight: 700; color: var(--color-text-main);">${s.userName || 'User'}</div>
          <div style="font-size: 0.8rem; color: var(--color-text-muted);">${s.userEmail || ''}</div>
        </div>
        <span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-idle'}">${s.status || 'Active'}</span>
      </div>
      <div class="mobile-card-details">
        <div class="mobile-detail-item">
          <span class="mobile-detail-label">School</span>
          <span class="mobile-detail-val">${s.schoolName || 'School'}</span>
        </div>
        <div class="mobile-detail-item">
          <span class="mobile-detail-label">Device & OS</span>
          <span class="mobile-detail-val">${s.deviceType || 'Device'} &bull; ${s.os || 'OS'}</span>
        </div>
      </div>
      <div class="mobile-card-actions">
        <button class="btn btn-danger-outline btn-sm" style="width: 100%;" onclick="window.requestForceLogout('${s.id}')">Force Logout Device</button>
      </div>
    </div>
  `).join("");
}

window.requestForceLogout = (sessionId) => {
  const session = liveSessions.find((s) => s.id === sessionId);
  if (!session) return;
  sessionToTerminate = session;
  const displayTarget = document.getElementById("force-logout-target-display");
  if (displayTarget) {
    displayTarget.textContent = `${session.userName || 'User'} (${session.userEmail}) on ${session.deviceType || 'Device'}`;
  }
  openModal("modal-force-logout");
};

/**
 * 5. Activity Logs View
 */
function renderActivityLogs(logs = liveLogs) {
  const tbody = document.getElementById("logs-table-body");
  const mobileContainer = document.getElementById("logs-mobile-cards");

  if (!tbody || !mobileContainer) return;

  if (logs.length === 0) {
    const emptyHtml = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        </div>
        <h3>No activity recorded yet</h3>
        <p>All school updates, user modifications, and permission alterations will be recorded in this live audit trail.</p>
      </div>
    `;
    tbody.innerHTML = `<tr><td colspan="6">${emptyHtml}</td></tr>`;
    mobileContainer.innerHTML = emptyHtml;
    return;
  }

  tbody.innerHTML = logs.map((log) => `
    <tr>
      <td>
        <div>
          <div style="font-weight: 600; color: var(--color-text-main);">${log.user || 'Admin'}</div>
          <div style="font-size: 0.775rem; color: var(--color-text-muted);">${log.school || 'System'}</div>
        </div>
      </td>
      <td>
        <span class="action-badge action-badge-${(log.action || 'edit').toLowerCase()}">${log.action}</span>
      </td>
      <td>
        <div>
          <div style="font-weight: 500; font-size: 0.85rem;">${log.module || 'Module'}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted);">${log.recordName || ''}</div>
        </div>
      </td>
      <td>
        <div style="font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 2px;">${log.field || 'Field'}</div>
        <div class="diff-box">
          <span class="diff-old">${log.oldValue}</span>
          <span class="diff-arrow">&rarr;</span>
          <span class="diff-new">${log.newValue}</span>
        </div>
      </td>
      <td>
        <span style="font-size: 0.8rem; color: #64748b; white-space: nowrap;">${log.formattedTime}</span>
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="window.viewLogPayload('${log.id}')">Details</button>
      </td>
    </tr>
  `).join("");

  mobileContainer.innerHTML = logs.map((log) => `
    <div class="mobile-data-card">
      <div class="mobile-card-header">
        <div>
          <div style="font-weight: 700; color: var(--color-text-main);">${log.user}</div>
          <div style="font-size: 0.775rem; color: var(--color-text-muted);">${log.school}</div>
        </div>
        <span class="action-badge action-badge-${(log.action || 'edit').toLowerCase()}">${log.action}</span>
      </div>
      <div class="mobile-card-details">
        <div class="mobile-detail-item">
          <span class="mobile-detail-label">Module / Record</span>
          <span class="mobile-detail-val">${log.module} &bull; ${log.recordName}</span>
        </div>
        <div class="mobile-detail-item">
          <span class="mobile-detail-label">Timestamp</span>
          <span class="mobile-detail-val" style="font-size: 0.75rem;">${log.formattedTime}</span>
        </div>
        <div class="mobile-detail-item" style="grid-column: 1 / -1;">
          <span class="mobile-detail-label">Field: ${log.field}</span>
          <div class="diff-box" style="margin-top: 4px;">
            <span class="diff-old">${log.oldValue}</span>
            <span class="diff-arrow">&rarr;</span>
            <span class="diff-new">${log.newValue}</span>
          </div>
        </div>
      </div>
      <div class="mobile-card-actions">
        <button class="btn btn-secondary btn-sm" style="width: 100%;" onclick="window.viewLogPayload('${log.id}')">View Full Payload</button>
      </div>
    </div>
  `).join("");
}

window.viewLogPayload = (logId) => {
  const log = liveLogs.find((l) => l.id === logId);
  if (!log) return;
  const content = document.getElementById("modal-log-payload-content");
  if (content) {
    content.innerHTML = `
      <div style="background: #0f172a; color: #38bdf8; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 0.8rem; overflow-x: auto;">
        <pre style="margin: 0;">${JSON.stringify(log, null, 2)}</pre>
      </div>
    `;
  }
  openModal("modal-log-detail");
};

/**
 * Sidebar Collapse & Mobile Drawer Toggle
 */
function setupSidebarCollapse() {
  const collapseBtn = document.getElementById("sidebar-collapse-btn");
  const sidebar = document.getElementById("sidebar");
  const mobileToggleBtn = document.getElementById("mobile-toggle-btn");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");

  if (collapseBtn && sidebar) {
    collapseBtn.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
    });
  }

  if (mobileToggleBtn && sidebar && sidebarBackdrop) {
    const toggle = () => {
      sidebar.classList.toggle("open");
      sidebarBackdrop.classList.toggle("open");
    };
    mobileToggleBtn.addEventListener("click", toggle);
    sidebarBackdrop.addEventListener("click", toggle);
  }
}
