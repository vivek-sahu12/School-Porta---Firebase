import {
  subscribeToSchools,
  subscribeToUsers,
  subscribeToStudentsBySchool,
  saveSchoolAccount,
  updateSchool,
  toggleSchoolStatus,
  permanentlyDeleteSchool,
  saveUserAccount,
  updateUserPermissions,
  updateUserDeviceLimit,
  toggleUserStatus,
  deleteUserAccount,
  sendUserPasswordReset,
  importStudentsBatch
} from "./firestore-service.js";

/**
 * Minimal Super Admin UI Controller
 * Direct Cloud Firestore Integration with Zero Demo Data.
 */

// Live in-memory Firestore cache
let liveSchools = [];
let liveUsers = [];
let currentView = "dashboard";
let selectedSchool = null;
let selectedUserForPerms = null;
let unsubSchoolStudents = null;
let parsedExcelStudents = [];
let targetSchoolForExcel = null;

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
  setupExcelUploader();
  setupMobileDrawer();
}

/**
 * Setup Real-time Firestore Subscriptions
 */
function setupLiveListeners() {
  // 1. Subscribe to Schools
  subscribeToSchools((schools) => {
    liveSchools = schools;
    updateMetrics();
    renderDashboardSchools();
    renderAllSchoolsView();
    renderAccountsView();
    populateSchoolDropdowns();

    if (selectedSchool) {
      const refreshed = liveSchools.find((s) => s.schoolId === selectedSchool.schoolId);
      if (refreshed) {
        selectedSchool = refreshed;
        refreshSchoolDetailsView();
      }
    }
  });

  // 2. Subscribe to Users
  subscribeToUsers((users) => {
    liveUsers = users;
    updateMetrics();
    renderDashboardSchools();
    renderAllSchoolsView();
    renderAccountsView();

    if (selectedSchool) {
      renderSchoolUsersList(selectedSchool.schoolId);
    }
  });
}

/**
 * Navigation View Router
 */
function setupNavigation() {
  const navLinks = document.querySelectorAll(".nav-link");
  const views = document.querySelectorAll(".admin-view");
  const titleEl = document.getElementById("page-view-title");

  const titles = {
    dashboard: "Dashboard",
    schools: "Schools",
    accounts: "Accounts",
    "student-data": "Student Data"
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
 * Update Top Metric Summary Cards
 */
function updateMetrics() {
  const totalSchools = liveSchools.length;
  const activeSchools = liveSchools.filter((s) => s.status === "Active").length;
  const inactiveSchools = liveSchools.filter((s) => s.status === "Inactive").length;
  const totalUsers = liveUsers.length;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setVal("metric-total-schools", totalSchools);
  setVal("metric-active-schools", activeSchools);
  setVal("metric-inactive-schools", inactiveSchools);
  setVal("metric-total-users", totalUsers);
}

/**
 * Render Schools on Dashboard (Primary Focus)
 */
function renderDashboardSchools(filteredList = null) {
  const tbody = document.getElementById("dashboard-schools-tbody");
  if (!tbody) return;

  const list = filteredList || liveSchools;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-box">
            <svg class="empty-box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"></path><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path></svg>
            <h3>No schools configured yet</h3>
            <p>Register your first school account using its unique School ID.</p>
            <button class="btn btn-primary btn-sm" onclick="window.openAddAccountModal('school')">+ Add School Account</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map((s) => {
    const usersCount = liveUsers.filter((u) => u.schoolId === s.schoolId).length;
    const initial = s.logoInitial || s.schoolName?.substring(0, 2).toUpperCase() || "SC";
    const avatarHtml = s.logoUrl
      ? `<div class="school-avatar"><img src="${s.logoUrl}" alt="${s.schoolName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span style="display:none;">${initial}</span></div>`
      : `<div class="school-avatar">${initial}</div>`;

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            ${avatarHtml}
            <div>
              <div style="font-weight: 600; color: var(--color-text-main); font-size: 0.9rem;">${s.schoolName || s.name}</div>
              <div style="font-size: 0.775rem; color: var(--color-text-muted);">${s.adminEmail || 'No contact email'}</div>
            </div>
          </div>
        </td>
        <td><strong style="color: #1e40af; font-size: 0.85rem;">${s.schoolId}</strong></td>
        <td><span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${s.status}</span></td>
        <td><strong>${usersCount}</strong> Users</td>
        <td><span style="font-size: 0.8rem; color: var(--color-text-muted);">${s.lastUpdated || 'Recently'}</span></td>
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
 * Render All Schools View
 */
function renderAllSchoolsView() {
  const tbody = document.getElementById("all-schools-tbody");
  if (!tbody) return;

  if (liveSchools.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="6"><div class="empty-box"><h3>No schools added yet</h3></div></td></tr>
    `;
    return;
  }

  tbody.innerHTML = liveSchools.map((s) => {
    const usersCount = liveUsers.filter((u) => u.schoolId === s.schoolId).length;
    const initial = s.logoInitial || s.schoolName?.substring(0, 2).toUpperCase() || "SC";
    const avatarHtml = s.logoUrl
      ? `<div class="school-avatar"><img src="${s.logoUrl}" alt="${s.schoolName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span style="display:none;">${initial}</span></div>`
      : `<div class="school-avatar">${initial}</div>`;

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            ${avatarHtml}
            <span style="font-weight: 600; color: var(--color-text-main);">${s.schoolName || s.name}</span>
          </div>
        </td>
        <td><strong style="color: #1e40af;">${s.schoolId}</strong></td>
        <td><span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${s.status}</span></td>
        <td>${usersCount} Users</td>
        <td>${s.studentsCount || 0} Students</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="window.openSchoolDetails('${s.schoolId}')">Open School</button>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * Render Accounts View (Configured Firebase Accounts)
 */
function renderAccountsView() {
  const tbody = document.getElementById("accounts-all-tbody");
  if (!tbody) return;

  const totalAccounts = liveSchools.length + liveUsers.length;
  if (totalAccounts === 0) {
    tbody.innerHTML = `
      <tr><td colspan="6"><div class="empty-box"><h3>No configured accounts</h3><p>Register existing Firebase Authentication accounts as Schools or Users.</p></div></td></tr>
    `;
    return;
  }

  let html = "";

  // 1. School Accounts
  liveSchools.forEach((s) => {
    html += `
      <tr>
        <td>
          <div style="font-weight: 600; color: var(--color-text-main);">${s.schoolName}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted);">School ID: ${s.schoolId}</div>
        </td>
        <td><span class="badge" style="background:#e0f2fe; color:#0369a1;">School</span></td>
        <td><strong>${s.schoolId}</strong></td>
        <td><span class="badge ${s.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${s.status}</span></td>
        <td>${s.adminEmail || 'No email'}</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="window.openSchoolDetails('${s.schoolId}')">Configure</button>
        </td>
      </tr>
    `;
  });

  // 2. User Accounts
  liveUsers.forEach((u) => {
    const parentSchool = liveSchools.find((s) => s.schoolId === u.schoolId);
    const schoolLabel = parentSchool ? `${parentSchool.schoolName} (${u.schoolId})` : u.schoolId;

    html += `
      <tr>
        <td>
          <div style="font-weight: 600; color: var(--color-text-main);">${u.displayName || u.name}</div>
          <div style="font-size: 0.725rem; color: var(--color-text-muted); font-family: monospace;">UID: ${u.uid}</div>
        </td>
        <td><span class="badge" style="background:#f3e8ff; color:#7e22ce;">User</span></td>
        <td><span style="font-size: 0.85rem; font-weight: 500;">${schoolLabel}</span></td>
        <td><span class="badge ${u.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${u.status}</span></td>
        <td>Limit: ${u.deviceLimit || 3} Dev &bull; ${u.email || 'No email'}</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="window.openEditUserPermsModal('${u.uid}')">Permissions</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

/**
 * Single-Screen School Management View
 */
window.openSchoolDetails = (schoolId) => {
  const school = liveSchools.find((s) => s.schoolId === schoolId);
  if (!school) return;

  selectedSchool = school;
  refreshSchoolDetailsView();

  // Listen to students for this school
  if (unsubSchoolStudents) unsubSchoolStudents();
  unsubSchoolStudents = subscribeToStudentsBySchool(school.schoolId, (students) => {
    renderSchoolStudentsList(students);
  });

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
  setText("sd-admin-email", s.adminEmail || "No admin contact");
  setText("sd-address", s.address || "Campus Address");
  setText("sd-logourl-display", s.logoUrl || "None configured");
  setText("sd-students-count", s.studentsCount || 0);

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
}

function renderSchoolUsersList(schoolId) {
  const tbody = document.getElementById("sd-users-tbody");
  if (!tbody) return;

  const users = liveUsers.filter((u) => u.schoolId === schoolId);

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 24px;">
          No users assigned to this school yet.
          <div style="margin-top: 8px;">
            <button class="btn btn-secondary btn-sm" onclick="window.openAddAccountModal('user', '${schoolId}')">+ Configure First User</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map((u) => {
    const p = u.permissions || {};
    return `
      <tr>
        <td>
          <div style="font-weight: 600; color: var(--color-text-main);">${u.displayName || u.name}</div>
          <div style="font-size: 0.725rem; color: var(--color-text-muted); font-family: monospace;">${u.uid}</div>
        </td>
        <td><span style="font-size: 0.85rem;">${u.email || '—'}</span></td>
        <td><span class="badge ${u.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${u.status}</span></td>
        <td><strong>${u.deviceLimit || 3}</strong> Devices</td>
        <td>
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            ${p.editable ? '<span class="badge badge-active" style="font-size:0.675rem;">Editable</span>' : ''}
            ${p.addStudent ? '<span class="badge badge-active" style="font-size:0.675rem;">+Student</span>' : ''}
            ${p.excelExport ? '<span class="badge badge-active" style="font-size:0.675rem;">Excel</span>' : ''}
            ${p.reports ? '<span class="badge badge-active" style="font-size:0.675rem;">Reports</span>' : ''}
          </div>
        </td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="window.openEditUserPermsModal('${u.uid}')">Edit</button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderSchoolStudentsList(students) {
  const container = document.getElementById("sd-students-container");
  if (!container) return;

  if (students.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--color-text-muted); font-size: 0.85rem;">
        No student records uploaded for this school yet.
        <div style="margin-top: 10px;">
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('excel-file-input').click()">
            Upload Excel File
          </button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
      <table class="clean-table">
        <thead>
          <tr>
            <th>Student Name</th>
            <th>Class</th>
            <th>Roll No</th>
            <th>Father Name</th>
          </tr>
        </thead>
        <tbody>
          ${students.map((st) => `
            <tr>
              <td style="font-weight: 600;">${st.studentName}</td>
              <td>${st.className || '—'}</td>
              <td>${st.rollNo || '—'}</td>
              <td>${st.fatherName || '—'}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

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
  const selGlobal = document.getElementById("global-student-school-select");

  const options = liveSchools.map((s) => `
    <option value="${s.schoolId}">${s.schoolName} (${s.schoolId})</option>
  `).join("");

  if (selUser) selUser.innerHTML = options || `<option value="">No schools available (create a school account first)</option>`;
  if (selGlobal) selGlobal.innerHTML = options || `<option value="">No schools available</option>`;
}

/**
 * Setup Forms (School & User Creation)
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

  // 1. Submit School Account
  const formSchool = document.getElementById("form-account-school");
  if (formSchool) {
    formSchool.addEventListener("submit", async (e) => {
      e.preventDefault();
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
        await saveSchoolAccount({ schoolId, schoolName, logoUrl, adminEmail, address, status });
        formSchool.reset();
        closeModal("modal-add-account");
        showToast(`School ${schoolName} (${schoolId}) saved successfully!`, "success");
      } catch (err) {
        console.error("Save School error:", err);
        showToast("Failed to save school account.", "error");
      }
    });
  }

  // 2. Submit User Account
  const formUser = document.getElementById("form-account-user");
  if (formUser) {
    formUser.addEventListener("submit", async (e) => {
      e.preventDefault();
      const schoolId = document.getElementById("acc-user-school").value;
      const uid = document.getElementById("acc-user-uid").value.trim();
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

      if (!schoolId || !uid) {
        showToast("Please select a school and enter Firebase UID.", "error");
        return;
      }

      try {
        await saveUserAccount({ uid, schoolId, displayName, email, status, deviceLimit, permissions });
        formUser.reset();
        closeModal("modal-add-account");
        showToast(`User account configured under School ID ${schoolId}!`, "success");
      } catch (err) {
        console.error("Save User error:", err);
        showToast("Failed to save user account.", "error");
      }
    });
  }

  // Search Filter on Dashboard
  const searchInput = document.getElementById("dashboard-search-schools");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase().trim();
      const filtered = liveSchools.filter((s) => {
        return (s.schoolName || s.name || "").toLowerCase().includes(q) || (s.schoolId || "").toLowerCase().includes(q);
      });
      renderDashboardSchools(filtered);
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
 * Edit User Permissions & Device Limit Modal
 */
window.openEditUserPermsModal = (uid) => {
  const user = liveUsers.find((u) => u.uid === uid);
  if (!user) return;

  selectedUserForPerms = user;
  const titleEl = document.getElementById("m-perm-user-title");
  const subEl = document.getElementById("m-perm-user-sub");

  if (titleEl) titleEl.textContent = user.displayName || user.name || "User";
  if (subEl) subEl.textContent = `School: ${user.schoolId} • UID: ${user.uid}`;

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
        uid: selectedUserForPerms.uid,
        schoolId: selectedUserForPerms.schoolId,
        displayName: selectedUserForPerms.displayName || selectedUserForPerms.name,
        email: selectedUserForPerms.email,
        status,
        deviceLimit,
        permissions
      });

      closeModal("modal-edit-user-perms");
      showToast(`User settings saved for ${selectedUserForPerms.displayName || selectedUserForPerms.uid}!`, "success");
    } catch (e) {
      console.error("Save perms error:", e);
      showToast("Failed to update user permissions.", "error");
    }
  });
}

/**
 * Setup Excel / CSV Student Data Importer
 */
function setupExcelUploader() {
  const fileInput = document.getElementById("excel-file-input");
  const globalFileInput = document.getElementById("global-excel-file-input");

  const handleFile = (file, schoolId, schoolName) => {
    if (!file || !schoolId) {
      showToast("Please select a valid school and file.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        if (typeof XLSX === "undefined") {
          showToast("Excel reader library loading... Please try again in a moment.", "error");
          return;
        }
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (!json || json.length === 0) {
          showToast("No data rows found in this file.", "error");
          return;
        }

        // Normalize student rows
        parsedExcelStudents = json.map((row) => {
          // Flexible key lookup
          const name = row["Student Name"] || row["StudentName"] || row["Name"] || row["student_name"] || row["studentName"] || "";
          const cls = row["Class"] || row["Grade"] || row["class"] || row["className"] || "";
          const roll = row["Roll No"] || row["RollNo"] || row["Roll"] || row["rollNo"] || "";
          const father = row["Father Name"] || row["FatherName"] || row["Father's Name"] || row["fatherName"] || "";

          return {
            studentName: String(name || "Student").trim(),
            className: String(cls).trim(),
            rollNo: String(roll).trim(),
            fatherName: String(father).trim()
          };
        });

        targetSchoolForExcel = { schoolId, schoolName };

        // Populate Preview Modal
        document.getElementById("preview-target-school-name").textContent = schoolName;
        document.getElementById("preview-target-school-id").textContent = schoolId;
        document.getElementById("preview-tag-school-id").textContent = schoolId;
        document.getElementById("preview-total-count").textContent = parsedExcelStudents.length;

        const previewTbody = document.getElementById("excel-preview-tbody");
        const previewRows = parsedExcelStudents.slice(0, 5);
        previewTbody.innerHTML = previewRows.map((r) => `
          <tr>
            <td style="font-weight:600;">${r.studentName}</td>
            <td>${r.className || '—'}</td>
            <td>${r.rollNo || '—'}</td>
            <td>${r.fatherName || '—'}</td>
          </tr>
        `).join("");

        openModal("modal-excel-preview");
      } catch (parseErr) {
        console.error("Excel parse error:", parseErr);
        showToast("Failed to parse file. Please upload a valid .xlsx, .xls, or .csv file.", "error");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file && selectedSchool) {
        handleFile(file, selectedSchool.schoolId, selectedSchool.schoolName);
        fileInput.value = "";
      }
    });
  }

  if (globalFileInput) {
    globalFileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      const schoolSelect = document.getElementById("global-student-school-select");
      const schoolId = schoolSelect?.value;
      const schoolName = schoolSelect?.options[schoolSelect.selectedIndex]?.text || schoolId;

      if (file && schoolId) {
        handleFile(file, schoolId, schoolName);
        globalFileInput.value = "";
      }
    });
  }

  // Confirm Import Button
  const confirmBtn = document.getElementById("confirm-import-excel-btn");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      if (!targetSchoolForExcel || parsedExcelStudents.length === 0) return;
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Writing to Firestore...";

      try {
        const count = await importStudentsBatch(targetSchoolForExcel.schoolId, parsedExcelStudents);
        closeModal("modal-excel-preview");
        showToast(`Successfully imported ${count} students for School ID: ${targetSchoolForExcel.schoolId}!`, "success");
        parsedExcelStudents = [];
        targetSchoolForExcel = null;
      } catch (err) {
        console.error("Import students error:", err);
        showToast("Error importing students to Firestore.", "error");
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Confirm & Import Students";
      }
    });
  }
}

/**
 * Mobile Navigation Drawer Toggle
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
