import { superAdminState } from "./superadmin-data.js";

/**
 * Super Admin UI Controller & View Manager
 */

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
  if (modal) {
    modal.classList.add("open");
  }
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("open");
  }
}

// Global active view state
let currentView = "overview";
let currentTab = "tab-schools-list";
let activePermissionSchool = "SCH-1001";
let sessionToTerminate = null;

/**
 * Initialize Super Admin UI
 */
export function initSuperAdminUI() {
  setupNavigation();
  setupTabs();
  setupModals();
  setupOverview();
  setupSchoolsAndUsers();
  setupPermissions();
  setupActiveSessions();
  setupActivityLogs();
  setupSidebarCollapse();
}

/**
 * Setup Main Left Sidebar View Navigation
 */
function setupNavigation() {
  const navLinks = document.querySelectorAll("[data-nav-view]");
  const viewSections = document.querySelectorAll(".view-section");
  const headerSubtitle = document.getElementById("header-current-view-title");

  const viewTitles = {
    overview: "Overview & Control Center",
    "schools-users": "Schools & Users Management",
    permissions: "Centralized Permissions Matrix",
    sessions: "Active Sessions & Device Monitoring",
    logs: "System Activity & Edit Audit Trail"
  };

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetView = link.getAttribute("data-nav-view");
      if (!targetView) return;

      currentView = targetView;

      // Update Nav active classes
      navLinks.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      // Update View sections
      viewSections.forEach((section) => {
        if (section.id === `view-${targetView}`) {
          section.classList.add("active");
        } else {
          section.classList.remove("active");
        }
      });

      // Update Header Subtitle
      if (headerSubtitle && viewTitles[targetView]) {
        headerSubtitle.textContent = viewTitles[targetView];
      }

      // Close mobile drawer on selection
      const sidebar = document.getElementById("sidebar");
      const backdrop = document.getElementById("sidebar-backdrop");
      if (sidebar && backdrop) {
        sidebar.classList.remove("open");
        backdrop.classList.remove("open");
      }

      // Scroll to top of main wrapper
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
 * Setup Modal Event Listeners
 */
function setupModals() {
  // Generic close buttons
  document.querySelectorAll("[data-modal-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modalId = btn.getAttribute("data-modal-close");
      closeModal(modalId);
    });
  });

  // Close on clicking backdrop
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove("open");
      }
    });
  });

  // Force Logout Confirm Action
  const confirmTerminateBtn = document.getElementById("confirm-terminate-session-btn");
  if (confirmTerminateBtn) {
    confirmTerminateBtn.addEventListener("click", () => {
      if (sessionToTerminate) {
        // Remove or update session state
        const idx = superAdminState.sessions.findIndex((s) => s.id === sessionToTerminate.id);
        if (idx !== -1) {
          superAdminState.sessions.splice(idx, 1);
          superAdminState.metrics.activeSessions = Math.max(0, superAdminState.metrics.activeSessions - 1);
          renderActiveSessions();
          updateMetricsUI();
          showToast(`Session for ${sessionToTerminate.userName} was terminated successfully.`, "success");
        }
      }
      closeModal("modal-force-logout");
      sessionToTerminate = null;
    });
  }
}

/**
 * 1. Overview Screen
 */
function setupOverview() {
  updateMetricsUI();
  renderOverviewRecentLogs();
  renderOverviewSessionsPreview();
}

function updateMetricsUI() {
  const m = superAdminState.metrics;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setVal("metric-total-schools", m.totalSchools);
  setVal("metric-active-schools", m.activeSchools);
  setVal("metric-inactive-schools", m.inactiveSchools);
  setVal("metric-total-users", m.totalUsers);
  setVal("metric-active-sessions", m.activeSessions);

  // Badge count on sidebar
  const badgeSessions = document.getElementById("sidebar-badge-sessions");
  if (badgeSessions) badgeSessions.textContent = m.activeSessions;
  const badgeSchools = document.getElementById("sidebar-badge-schools");
  if (badgeSchools) badgeSchools.textContent = m.totalSchools;
}

function renderOverviewRecentLogs() {
  const container = document.getElementById("overview-recent-logs-list");
  if (!container) return;

  const logs = superAdminState.activityLogs.slice(0, 4);
  container.innerHTML = logs.map(log => `
    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--color-border-subtle);">
      <div>
        <div style="font-size: 0.85rem; font-weight: 600; color: var(--color-text-main);">
          <span class="action-badge action-badge-${log.action.toLowerCase()}">${log.action}</span>
          ${log.user} &bull; <span style="color: var(--color-text-muted); font-weight: normal;">${log.module}</span>
        </div>
        <div style="font-size: 0.775rem; color: var(--color-text-muted); margin-top: 4px;">
          ${log.recordName} (${log.field})
        </div>
      </div>
      <div style="font-size: 0.75rem; color: var(--color-text-subtle); white-space: nowrap;">
        ${log.timestamp.split(',')[1] || log.timestamp}
      </div>
    </div>
  `).join("");
}

function renderOverviewSessionsPreview() {
  const container = document.getElementById("overview-sessions-preview-list");
  if (!container) return;

  const sessions = superAdminState.sessions.slice(0, 4);
  container.innerHTML = sessions.map(ses => `
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
            ${ses.userName} ${ses.isCurrent ? '<span class="current-session-indicator">You</span>' : ''}
          </div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted);">${ses.schoolName}</div>
        </div>
      </div>
      <span class="badge ${ses.status === 'Active' ? 'badge-active' : 'badge-idle'}">${ses.status}</span>
    </div>
  `).join("");
}

/**
 * 2. Schools & Users Section
 */
function setupSchoolsAndUsers() {
  renderSchoolsTable();
  renderUsersTable();

  // Search Schools
  const searchSchoolsInput = document.getElementById("search-schools-input");
  const filterSchoolsStatus = document.getElementById("filter-schools-status");
  if (searchSchoolsInput && filterSchoolsStatus) {
    const handleFilter = () => {
      const q = searchSchoolsInput.value.toLowerCase().trim();
      const status = filterSchoolsStatus.value;
      const filtered = superAdminState.schools.filter((sch) => {
        const matchesQ = sch.name.toLowerCase().includes(q) || sch.id.toLowerCase().includes(q) || sch.assignedAdmin.toLowerCase().includes(q);
        const matchesStatus = status === "ALL" || sch.status === status;
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
      const filtered = superAdminState.users.filter((u) => {
        const matchesQ = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.schoolName.toLowerCase().includes(q);
        const matchesRole = role === "ALL" || u.role === role;
        return matchesQ && matchesRole;
      });
      renderUsersTable(filtered);
    };
    searchUsersInput.addEventListener("input", handleFilter);
    filterUsersRole.addEventListener("change", handleFilter);
  }

  // Create School Form Submission
  const formCreateSchool = document.getElementById("form-create-school");
  if (formCreateSchool) {
    formCreateSchool.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("new-school-name").value.trim();
      const id = document.getElementById("new-school-id").value.trim() || `SCH-${Math.floor(1000 + Math.random() * 9000)}`;
      const admin = document.getElementById("new-school-admin").value.trim();
      const address = document.getElementById("new-school-address").value.trim();
      const status = document.getElementById("new-school-status").value;

      if (!name || !admin) {
        showToast("Please fill in the required fields (School Name and Admin Email).", "warning");
        return;
      }

      const newSchool = {
        id,
        name,
        shortCode: name.substring(0, 3).toUpperCase(),
        logo: name.substring(0, 2).toUpperCase(),
        status,
        usersCount: 1,
        assignedAdmin: admin,
        createdDate: "Today",
        address: address || "Campus address",
        phone: "+91 98000 00000",
        lastActivity: "Just now"
      };

      // Add to state
      superAdminState.schools.unshift(newSchool);
      superAdminState.metrics.totalSchools += 1;
      if (status === "Active") superAdminState.metrics.activeSchools += 1;
      else superAdminState.metrics.inactiveSchools += 1;

      // Add default permission entry
      superAdminState.permissions[id] = {
        schoolName: name,
        editable: true,
        addStudent: true,
        deleteStudent: false,
        excelExport: true,
        reports: true,
        deviceLimit: 5
      };

      // Log activity
      superAdminState.activityLogs.unshift({
        id: `LOG-${Math.floor(5000 + Math.random() * 5000)}`,
        user: "Super Admin",
        userEmail: "admin@schoolportal.com",
        school: name,
        action: "Add",
        module: "Schools",
        recordName: `${name} (${id})`,
        field: "Creation",
        oldValue: "None",
        newValue: "Created & Provisioned",
        timestamp: "Just now"
      });

      renderSchoolsTable();
      populatePermissionsSchoolPicker();
      updateMetricsUI();
      formCreateSchool.reset();
      showToast(`School "${name}" created successfully!`, "success");

      // Switch back to schools tab
      document.querySelector('[data-tab="tab-schools-list"]').click();
    });
  }

  // Create User Form Submission
  const formCreateUser = document.getElementById("form-create-user");
  if (formCreateUser) {
    formCreateUser.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("new-user-name").value.trim();
      const email = document.getElementById("new-user-email").value.trim();
      const schoolSelect = document.getElementById("new-user-school");
      const schoolId = schoolSelect.value;
      const schoolName = schoolSelect.options[schoolSelect.selectedIndex]?.text || "School";
      const role = document.getElementById("new-user-role").value;
      const status = document.getElementById("new-user-status").value;

      if (!name || !email) {
        showToast("Please fill in required fields.", "warning");
        return;
      }

      const newUser = {
        id: `USR-${Math.floor(100 + Math.random() * 900)}`,
        name,
        email,
        schoolId,
        schoolName,
        role,
        status,
        lastLogin: "Never"
      };

      superAdminState.users.unshift(newUser);
      superAdminState.metrics.totalUsers += 1;
      updateMetricsUI();
      renderUsersTable();

      // Log activity
      superAdminState.activityLogs.unshift({
        id: `LOG-${Math.floor(5000 + Math.random() * 5000)}`,
        user: "Super Admin",
        userEmail: "admin@schoolportal.com",
        school: schoolName,
        action: "Add",
        module: "Users",
        recordName: `${name} (${email})`,
        field: "Account Creation",
        oldValue: "None",
        newValue: `Role: ${role}`,
        timestamp: "Just now"
      });

      formCreateUser.reset();
      showToast(`User account for "${name}" created.`, "success");
      document.querySelector('[data-tab="tab-users-list"]').click();
    });
  }
}

function renderSchoolsTable(schools = superAdminState.schools) {
  const tbody = document.getElementById("schools-table-body");
  const mobileContainer = document.getElementById("schools-mobile-cards");

  if (!tbody || !mobileContainer) return;

  if (schools.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div><h3>No schools match your search</h3><p>Try adjusting your search filters or add a new school.</p></div></td></tr>`;
    mobileContainer.innerHTML = `<div class="empty-state"><p>No schools found.</p></div>`;
    return;
  }

  // Desktop table rows
  tbody.innerHTML = schools.map((s) => `
    <tr>
      <td>
        <div class="cell-school-info">
          <div class="school-logo-badge">${s.logo}</div>
          <div>
            <div class="cell-school-name">${s.name}</div>
            <div class="cell-school-id">${s.id} &bull; Code: ${s.shortCode}</div>
          </div>
        </div>
      </td>
      <td>
        <span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${s.status}</span>
      </td>
      <td><strong>${s.usersCount}</strong> Users</td>
      <td><span style="font-size: 0.85rem; color: #334155;">${s.assignedAdmin}</span></td>
      <td><span style="font-size: 0.8rem; color: #64748b;">${s.createdDate}</span></td>
      <td>
        <div class="row-actions">
          <button class="btn btn-secondary btn-sm" onclick="window.viewSchoolDetails('${s.id}')">View</button>
          <button class="btn btn-secondary btn-sm" onclick="window.toggleSchoolStatus('${s.id}')">
            ${s.status === 'Active' ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  // Mobile cards
  mobileContainer.innerHTML = schools.map((s) => `
    <div class="mobile-data-card">
      <div class="mobile-card-header">
        <div class="cell-school-info">
          <div class="school-logo-badge">${s.logo}</div>
          <div>
            <div class="cell-school-name">${s.name}</div>
            <div class="cell-school-id">${s.id}</div>
          </div>
        </div>
        <span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${s.status}</span>
      </div>
      <div class="mobile-card-details">
        <div class="mobile-detail-item">
          <span class="mobile-detail-label">Assigned Admin</span>
          <span class="mobile-detail-val" style="word-break: break-all; font-size: 0.8rem;">${s.assignedAdmin}</span>
        </div>
        <div class="mobile-detail-item">
          <span class="mobile-detail-label">Total Users</span>
          <span class="mobile-detail-val">${s.usersCount} Accounts</span>
        </div>
      </div>
      <div class="mobile-card-actions">
        <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="window.viewSchoolDetails('${s.id}')">View Details</button>
        <button class="btn btn-secondary btn-sm" onclick="window.toggleSchoolStatus('${s.id}')">
          ${s.status === 'Active' ? 'Deactivate' : 'Activate'}
        </button>
      </div>
    </div>
  `).join("");
}

function renderUsersTable(users = superAdminState.users) {
  const tbody = document.getElementById("users-table-body");
  const mobileContainer = document.getElementById("users-mobile-cards");

  if (!tbody || !mobileContainer) return;

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>No users found</h3></div></td></tr>`;
    mobileContainer.innerHTML = `<div class="empty-state"><p>No users found.</p></div>`;
    return;
  }

  tbody.innerHTML = users.map((u) => `
    <tr>
      <td>
        <div>
          <div style="font-weight: 600; color: var(--color-text-main);">${u.name}</div>
          <div style="font-size: 0.775rem; color: var(--color-text-muted);">${u.id}</div>
        </div>
      </td>
      <td><span style="font-size: 0.85rem; color: #1e293b;">${u.email}</span></td>
      <td><span style="font-size: 0.85rem;">${u.schoolName}</span></td>
      <td><span class="badge badge-role">${u.role}</span></td>
      <td><span class="badge ${u.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${u.status}</span></td>
      <td>
        <div class="row-actions">
          <button class="btn btn-secondary btn-sm" onclick="window.triggerPasswordReset('${u.email}')">Reset Pwd</button>
          <button class="btn btn-secondary btn-sm" onclick="window.toggleUserStatus('${u.id}')">
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
          <span class="mobile-detail-label">Role</span>
          <span class="mobile-detail-val"><span class="badge badge-role">${u.role}</span></span>
        </div>
      </div>
      <div class="mobile-card-actions">
        <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="window.triggerPasswordReset('${u.email}')">Reset Password</button>
        <button class="btn btn-secondary btn-sm" onclick="window.toggleUserStatus('${u.id}')">
          ${u.status === 'Active' ? 'Deactivate' : 'Activate'}
        </button>
      </div>
    </div>
  `).join("");
}

// Window actions for dynamic click handlers
window.viewSchoolDetails = (schoolId) => {
  const school = superAdminState.schools.find((s) => s.id === schoolId);
  if (!school) return;

  const content = document.getElementById("modal-school-detail-content");
  if (content) {
    content.innerHTML = `
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--color-border);">
        <div class="school-logo-badge" style="width: 52px; height: 52px; font-size: 1.2rem;">${school.logo}</div>
        <div>
          <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--color-text-main);">${school.name}</h3>
          <div style="font-size: 0.85rem; color: var(--color-text-muted);">ID: ${school.id} &bull; Code: ${school.shortCode}</div>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; font-size: 0.875rem; margin-bottom: 20px;">
        <div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Status</div>
          <div style="margin-top: 4px;"><span class="badge ${school.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${school.status}</span></div>
        </div>
        <div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Total Users</div>
          <div style="font-weight: 600; margin-top: 4px;">${school.usersCount} Active Accounts</div>
        </div>
        <div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Assigned Administrator</div>
          <div style="font-weight: 600; margin-top: 4px;">${school.assignedAdmin}</div>
        </div>
        <div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Created On</div>
          <div style="font-weight: 600; margin-top: 4px;">${school.createdDate}</div>
        </div>
        <div style="grid-column: 1 / -1;">
          <div style="font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase;">Campus Address</div>
          <div style="font-weight: 500; margin-top: 4px;">${school.address}</div>
        </div>
      </div>
      <div style="padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid var(--color-border); font-size: 0.8rem; color: #64748b;">
        ⚡ <strong>Quick Note:</strong> Changes to permissions and device limits can be configured in the <em>Permissions</em> section.
      </div>
    `;
  }
  openModal("modal-school-detail");
};

window.toggleSchoolStatus = (schoolId) => {
  const school = superAdminState.schools.find((s) => s.id === schoolId);
  if (!school) return;

  const oldStatus = school.status;
  school.status = oldStatus === "Active" ? "Inactive" : "Active";

  if (school.status === "Active") {
    superAdminState.metrics.activeSchools += 1;
    superAdminState.metrics.inactiveSchools -= 1;
  } else {
    superAdminState.metrics.activeSchools -= 1;
    superAdminState.metrics.inactiveSchools += 1;
  }

  // Log activity
  superAdminState.activityLogs.unshift({
    id: `LOG-${Math.floor(5000 + Math.random() * 5000)}`,
    user: "Super Admin",
    userEmail: "admin@schoolportal.com",
    school: school.name,
    action: "Edit",
    module: "Schools",
    recordName: school.name,
    field: "Status",
    oldValue: oldStatus,
    newValue: school.status,
    timestamp: "Just now"
  });

  renderSchoolsTable();
  updateMetricsUI();
  showToast(`School status changed to "${school.status}".`, "info");
};

window.toggleUserStatus = (userId) => {
  const user = superAdminState.users.find((u) => u.id === userId);
  if (!user) return;
  user.status = user.status === "Active" ? "Inactive" : "Active";
  renderUsersTable();
  showToast(`User ${user.name} is now ${user.status}.`, "info");
};

window.triggerPasswordReset = (email) => {
  const resetEmailDisplay = document.getElementById("reset-user-email-display");
  if (resetEmailDisplay) resetEmailDisplay.textContent = email;
  openModal("modal-password-reset");
};

/**
 * 3. Permissions Management Section
 */
function setupPermissions() {
  populatePermissionsSchoolPicker();
  renderPermissionsMatrix();

  const schoolSelect = document.getElementById("permissions-school-select");
  if (schoolSelect) {
    schoolSelect.addEventListener("change", () => {
      activePermissionSchool = schoolSelect.value;
      renderPermissionsMatrix();
    });
  }

  // Save Permissions Bar
  const saveBtn = document.getElementById("save-permissions-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      showToast("Permissions updated and policy saved successfully.", "success");
    });
  }
}

function populatePermissionsSchoolPicker() {
  const select = document.getElementById("permissions-school-select");
  const createSchoolUserSelect = document.getElementById("new-user-school");

  if (select) {
    select.innerHTML = superAdminState.schools.map((s) => `
      <option value="${s.id}" ${s.id === activePermissionSchool ? 'selected' : ''}>${s.name} (${s.id})</option>
    `).join("");
  }

  if (createSchoolUserSelect) {
    createSchoolUserSelect.innerHTML = superAdminState.schools.map((s) => `
      <option value="${s.id}">${s.name} (${s.id})</option>
    `).join("");
  }
}

function renderPermissionsMatrix() {
  const container = document.getElementById("permissions-matrix-grid");
  if (!container) return;

  const currentPerms = superAdminState.permissions[activePermissionSchool] || {
    schoolName: "School",
    editable: true,
    addStudent: true,
    deleteStudent: false,
    excelExport: true,
    reports: true,
    deviceLimit: 5
  };

  container.innerHTML = `
    <!-- 1. Master Editable -->
    <div class="permission-box">
      <div class="permission-info">
        <h4>
          <svg style="width: 18px; height: 18px; color: #2563eb;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          Record Editing (Editable)
        </h4>
        <p>Master permission to allow school staff to edit student and class records.</p>
      </div>
      <div class="switch-wrapper">
        <span class="switch-label-state" id="label-perm-editable">${currentPerms.editable ? 'Enabled' : 'Disabled'}</span>
        <label class="switch">
          <input type="checkbox" id="perm-editable" ${currentPerms.editable ? 'checked' : ''} onchange="window.updatePermissionToggle('editable')">
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <!-- 2. Add Student -->
    <div class="permission-box">
      <div class="permission-info">
        <h4>
          <svg style="width: 18px; height: 18px; color: #059669;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line>
          </svg>
          Add Student
        </h4>
        <p>Allows enrollment of new student admissions into class rosters.</p>
      </div>
      <div class="switch-wrapper">
        <span class="switch-label-state" id="label-perm-addStudent">${currentPerms.addStudent ? 'Enabled' : 'Disabled'}</span>
        <label class="switch">
          <input type="checkbox" id="perm-addStudent" ${currentPerms.addStudent ? 'checked' : ''} onchange="window.updatePermissionToggle('addStudent')">
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <!-- 3. Delete Student -->
    <div class="permission-box">
      <div class="permission-info">
        <h4>
          <svg style="width: 18px; height: 18px; color: #dc2626;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Delete Student Records
        </h4>
        <p>High-risk permission. Allows removing student records permanently.</p>
      </div>
      <div class="switch-wrapper">
        <span class="switch-label-state" id="label-perm-deleteStudent">${currentPerms.deleteStudent ? 'Enabled' : 'Disabled'}</span>
        <label class="switch">
          <input type="checkbox" id="perm-deleteStudent" ${currentPerms.deleteStudent ? 'checked' : ''} onchange="window.updatePermissionToggle('deleteStudent')">
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <!-- 4. Excel Export -->
    <div class="permission-box">
      <div class="permission-info">
        <h4>
          <svg style="width: 18px; height: 18px; color: #047857;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line>
          </svg>
          Excel / CSV Export
        </h4>
        <p>Enables bulk downloading and spreadsheet export of student and fee data.</p>
      </div>
      <div class="switch-wrapper">
        <span class="switch-label-state" id="label-perm-excelExport">${currentPerms.excelExport ? 'Enabled' : 'Disabled'}</span>
        <label class="switch">
          <input type="checkbox" id="perm-excelExport" ${currentPerms.excelExport ? 'checked' : ''} onchange="window.updatePermissionToggle('excelExport')">
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <!-- 5. Reports -->
    <div class="permission-box">
      <div class="permission-info">
        <h4>
          <svg style="width: 18px; height: 18px; color: #7c3aed;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          Analytics & Reports
        </h4>
        <p>Grants access to comprehensive school performance and attendance reports.</p>
      </div>
      <div class="switch-wrapper">
        <span class="switch-label-state" id="label-perm-reports">${currentPerms.reports ? 'Enabled' : 'Disabled'}</span>
        <label class="switch">
          <input type="checkbox" id="perm-reports" ${currentPerms.reports ? 'checked' : ''} onchange="window.updatePermissionToggle('reports')">
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <!-- 6. Device Limit Control -->
    <div class="permission-box">
      <div class="permission-info">
        <h4>
          <svg style="width: 18px; height: 18px; color: #d97706;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect width="18" height="12" x="3" y="4" rx="2"></rect><line x1="2" y1="20" x2="22" y2="20"></line>
          </svg>
          Simultaneous Device Limit
        </h4>
        <p>Limits how many active sessions this school can run concurrently (1 to 15).</p>
      </div>
      <div class="switch-wrapper">
        <div class="stepper-control">
          <button type="button" class="stepper-btn" onclick="window.stepDeviceLimit(-1)">-</button>
          <span class="stepper-value" id="device-limit-val">${currentPerms.deviceLimit}</span>
          <button type="button" class="stepper-btn" onclick="window.stepDeviceLimit(1)">+</button>
        </div>
        <span style="font-size: 0.775rem; color: var(--color-text-muted);">Max Devices</span>
      </div>
    </div>
  `;
}

window.updatePermissionToggle = (key) => {
  const current = superAdminState.permissions[activePermissionSchool];
  if (!current) return;
  const checkbox = document.getElementById(`perm-${key}`);
  const label = document.getElementById(`label-perm-${key}`);
  if (checkbox && label) {
    current[key] = checkbox.checked;
    label.textContent = checkbox.checked ? 'Enabled' : 'Disabled';
  }
};

window.stepDeviceLimit = (delta) => {
  const current = superAdminState.permissions[activePermissionSchool];
  if (!current) return;
  const next = Math.max(1, Math.min(15, current.deviceLimit + delta));
  current.deviceLimit = next;
  const el = document.getElementById("device-limit-val");
  if (el) el.textContent = next;
};

/**
 * 4. Active Sessions Section
 */
function setupActiveSessions() {
  renderActiveSessions();

  const searchInput = document.getElementById("search-sessions-input");
  const deviceFilter = document.getElementById("filter-sessions-device");
  const statusFilter = document.getElementById("filter-sessions-status");

  if (searchInput && deviceFilter && statusFilter) {
    const handleFilter = () => {
      const q = searchInput.value.toLowerCase().trim();
      const dev = deviceFilter.value;
      const st = statusFilter.value;

      const filtered = superAdminState.sessions.filter((s) => {
        const matchesQ = s.userName.toLowerCase().includes(q) || s.userEmail.toLowerCase().includes(q) || s.schoolName.toLowerCase().includes(q) || s.os.toLowerCase().includes(q);
        const matchesDev = dev === "ALL" || s.deviceType === dev;
        const matchesSt = st === "ALL" || s.status === st;
        return matchesQ && matchesDev && matchesSt;
      });
      renderActiveSessions(filtered);
    };

    searchInput.addEventListener("input", handleFilter);
    deviceFilter.addEventListener("change", handleFilter);
    statusFilter.addEventListener("change", handleFilter);
  }
}

function renderActiveSessions(sessions = superAdminState.sessions) {
  const tbody = document.getElementById("sessions-table-body");
  const mobileContainer = document.getElementById("sessions-mobile-cards");

  if (!tbody || !mobileContainer) return;

  if (sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h3>No active sessions found</h3></div></td></tr>`;
    mobileContainer.innerHTML = `<div class="empty-state"><p>No sessions match criteria.</p></div>`;
    return;
  }

  tbody.innerHTML = sessions.map((s) => `
    <tr>
      <td>
        <div>
          <div style="font-weight: 600; color: var(--color-text-main);">
            ${s.userName} ${s.isCurrent ? '<span class="current-session-indicator">Current</span>' : ''}
          </div>
          <div style="font-size: 0.775rem; color: var(--color-text-muted);">${s.userEmail}</div>
        </div>
      </td>
      <td><span style="font-size: 0.85rem;">${s.schoolName}</span></td>
      <td>
        <div class="session-device-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${s.deviceType === 'Mobile' 
              ? '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>' 
              : (s.deviceType === 'Tablet' 
                ? '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>'
                : '<rect width="20" height="14" x="2" y="3" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>')}
          </svg>
          ${s.deviceType}
        </div>
      </td>
      <td>
        <div>
          <div style="font-size: 0.825rem; font-weight: 500;">${s.browser}</div>
          <div style="font-size: 0.725rem; color: var(--color-text-muted);">${s.os} &bull; ${s.ipAddress}</div>
        </div>
      </td>
      <td><span style="font-size: 0.8rem; color: #475569;">${s.loginTime}</span></td>
      <td><span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-idle'}">${s.status}</span></td>
      <td>
        ${s.isCurrent 
          ? '<span style="font-size: 0.75rem; color: #94a3b8;">Current Session</span>' 
          : `<button class="btn btn-danger-outline btn-sm" onclick="window.requestForceLogout('${s.id}')">Force Logout</button>`}
      </td>
    </tr>
  `).join("");

  mobileContainer.innerHTML = sessions.map((s) => `
    <div class="mobile-data-card">
      <div class="mobile-card-header">
        <div>
          <div style="font-weight: 700; color: var(--color-text-main);">
            ${s.userName} ${s.isCurrent ? '<span class="current-session-indicator">Current</span>' : ''}
          </div>
          <div style="font-size: 0.8rem; color: var(--color-text-muted);">${s.userEmail}</div>
        </div>
        <span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-idle'}">${s.status}</span>
      </div>
      <div class="mobile-card-details">
        <div class="mobile-detail-item">
          <span class="mobile-detail-label">School</span>
          <span class="mobile-detail-val">${s.schoolName}</span>
        </div>
        <div class="mobile-detail-item">
          <span class="mobile-detail-label">Device & OS</span>
          <span class="mobile-detail-val">${s.deviceType} &bull; ${s.os}</span>
        </div>
        <div class="mobile-detail-item" style="grid-column: 1 / -1;">
          <span class="mobile-detail-label">Login Time</span>
          <span class="mobile-detail-val">${s.loginTime} (${s.lastActivity})</span>
        </div>
      </div>
      <div class="mobile-card-actions">
        ${s.isCurrent 
          ? '<span style="font-size: 0.8rem; color: #94a3b8; padding: 4px 0;">This is your active browser session</span>' 
          : `<button class="btn btn-danger-outline btn-sm" style="width: 100%;" onclick="window.requestForceLogout('${s.id}')">Force Logout Device</button>`}
      </div>
    </div>
  `).join("");
}

window.requestForceLogout = (sessionId) => {
  const session = superAdminState.sessions.find((s) => s.id === sessionId);
  if (!session) return;

  sessionToTerminate = session;
  const displayTarget = document.getElementById("force-logout-target-display");
  if (displayTarget) {
    displayTarget.textContent = `${session.userName} (${session.userEmail}) on ${session.deviceType} [${session.os}]`;
  }
  openModal("modal-force-logout");
};

/**
 * 5. Activity / Edit Logs Section
 */
function setupActivityLogs() {
  renderActivityLogs();

  const searchInput = document.getElementById("search-logs-input");
  const moduleFilter = document.getElementById("filter-logs-module");
  const actionFilter = document.getElementById("filter-logs-action");

  if (searchInput && moduleFilter && actionFilter) {
    const handleFilter = () => {
      const q = searchInput.value.toLowerCase().trim();
      const mod = moduleFilter.value;
      const act = actionFilter.value;

      const filtered = superAdminState.activityLogs.filter((log) => {
        const matchesQ = log.user.toLowerCase().includes(q) || log.school.toLowerCase().includes(q) || log.recordName.toLowerCase().includes(q) || log.field.toLowerCase().includes(q);
        const matchesMod = mod === "ALL" || log.module === mod;
        const matchesAct = act === "ALL" || log.action === act;
        return matchesQ && matchesMod && matchesAct;
      });
      renderActivityLogs(filtered);
    };

    searchInput.addEventListener("input", handleFilter);
    moduleFilter.addEventListener("change", handleFilter);
    actionFilter.addEventListener("change", handleFilter);
  }
}

function renderActivityLogs(logs = superAdminState.activityLogs) {
  const tbody = document.getElementById("logs-table-body");
  const mobileContainer = document.getElementById("logs-mobile-cards");

  if (!tbody || !mobileContainer) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>No audit records found</h3></div></td></tr>`;
    mobileContainer.innerHTML = `<div class="empty-state"><p>No activity logs match filters.</p></div>`;
    return;
  }

  tbody.innerHTML = logs.map((log) => `
    <tr>
      <td>
        <div>
          <div style="font-weight: 600; color: var(--color-text-main);">${log.user}</div>
          <div style="font-size: 0.775rem; color: var(--color-text-muted);">${log.school}</div>
        </div>
      </td>
      <td>
        <span class="action-badge action-badge-${log.action.toLowerCase()}">${log.action}</span>
      </td>
      <td>
        <div>
          <div style="font-weight: 500; font-size: 0.85rem;">${log.module}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted);">${log.recordName}</div>
        </div>
      </td>
      <td>
        <div style="font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 2px;">${log.field}</div>
        <div class="diff-box">
          <span class="diff-old">${log.oldValue}</span>
          <span class="diff-arrow">&rarr;</span>
          <span class="diff-new">${log.newValue}</span>
        </div>
      </td>
      <td>
        <span style="font-size: 0.8rem; color: #64748b; white-space: nowrap;">${log.timestamp}</span>
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
        <span class="action-badge action-badge-${log.action.toLowerCase()}">${log.action}</span>
      </div>
      <div class="mobile-card-details">
        <div class="mobile-detail-item">
          <span class="mobile-detail-label">Module / Record</span>
          <span class="mobile-detail-val">${log.module} &bull; ${log.recordName}</span>
        </div>
        <div class="mobile-detail-item">
          <span class="mobile-detail-label">Timestamp</span>
          <span class="mobile-detail-val" style="font-size: 0.75rem;">${log.timestamp}</span>
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
  const log = superAdminState.activityLogs.find((l) => l.id === logId);
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
 * Sidebar Collapse & Mobile Drawer
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
