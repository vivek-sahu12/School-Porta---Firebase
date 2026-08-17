import {
  db,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  increment
} from "../firebase.js";

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
 * Initialize School Portal UI
 */
export async function initSchoolPortalUI(user, userAccountData, initialSchoolData) {
  currentSchoolId = userAccountData.schoolId;
  currentSchoolAccount = userAccountData;
  currentSchoolEntity = initialSchoolData;

  setupSchoolNavigation();
  setupSchoolForms();
  setupSchoolLiveListeners();
  setupMobileDrawer();
  renderSchoolHeaderInfo();
}

/**
 * Navigation View Router
 */
function setupSchoolNavigation() {
  const navLinks = document.querySelectorAll(".nav-link");
  const views = document.querySelectorAll(".school-view");
  const titleEl = document.getElementById("page-view-title");

  const titles = {
    dashboard: "Dashboard",
    "school-info": "School Information",
    "school-users": "School Users",
    sessions: "Active Sessions",
    "student-data": "Student Data"
  };

  window.navigateSchoolView = (viewName) => {
    navLinks.forEach((l) => {
      if (l.getAttribute("data-view") === viewName) l.classList.add("active");
      else l.classList.remove("active");
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
      const target = link.getAttribute("data-view");
      if (target) window.navigateSchoolView(target);
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
      renderSchoolHeaderInfo();
      renderSchoolInfoView();
      updateSchoolMetrics();
    }
  });

  // 2. Subscribe to Users belonging to this school
  const usersCol = collection(db, "users");
  const qUsers = query(usersCol, where("schoolId", "==", currentSchoolId));
  unsubSchoolUsers = onSnapshot(qUsers, (snap) => {
    liveSchoolUsers = snap.docs.map((d) => ({
      id: d.id,
      firebaseUid: d.data().firebaseUid || d.id,
      ...d.data()
    }));
    updateSchoolMetrics();
    renderSchoolUsersTable();
  });

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
    updateSchoolMetrics();
    renderSchoolUsersTable();
    renderSchoolSessionsTable();
  });
}

/**
 * Render Header & Top Bar
 */
function renderSchoolHeaderInfo() {
  const school = currentSchoolEntity || {};
  const schoolName = school.schoolName || school.name || "School Portal";
  const schoolId = school.schoolId || currentSchoolId;
  const initial = school.logoInitial || schoolName.substring(0, 2).toUpperCase() || "SC";

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt("sidebar-school-title", schoolName);
  setTxt("sidebar-school-id-badge", schoolId);
  setTxt("sidebar-user-email", currentSchoolAccount?.email || "school@portal.com");
  setTxt("top-school-name", schoolName);
  setTxt("student-school-id-display", schoolId);

  const avatar = document.getElementById("sidebar-user-avatar");
  if (avatar) avatar.textContent = initial;

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
    const activeDevCount = liveSchoolSessions.filter((ses) => ses.userUid === u.firebaseUid).length;
    const limit = u.deviceLimit || 3;

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">${u.displayName || u.name}</div>
          <span class="chip-uid">UID: ${u.firebaseUid}</span>
        </td>
        <td><span style="font-size: 0.85rem;">${u.email || '—'}</span></td>
        <td><span class="badge ${u.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${u.status}</span></td>
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
          <button class="btn btn-secondary btn-sm" onclick="window.openEditSchoolUserPermsModal('${u.firebaseUid}')">Manage User</button>
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
        <button class="btn btn-danger-outline btn-sm" onclick="window.forceLogoutSchoolSession('${ses.sessionId}')">
          Force Logout
        </button>
      </td>
    </tr>
  `).join("");
}

window.forceLogoutSchoolSession = async (sessionId) => {
  try {
    const sessionDocRef = doc(db, "sessions", sessionId);
    await updateDoc(sessionDocRef, {
      status: "terminated",
      logoutTime: serverTimestamp()
    });
    showSchoolToast("Device session terminated.", "success");
  } catch (err) {
    console.error("Force logout error:", err);
    showSchoolToast("Failed to terminate session.", "error");
  }
};

/**
 * Setup Forms (Add School User & Edit School Info)
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

      try {
        const userDocRef = doc(db, "users", firebaseUid);
        const existingDoc = await getDoc(userDocRef);

        await setDoc(userDocRef, {
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
          updatedAt: serverTimestamp(),
          ...(existingDoc.exists() ? {} : { createdAt: serverTimestamp() })
        }, { merge: true });

        if (!existingDoc.exists()) {
          try {
            const schoolDocRef = doc(db, "schools", currentSchoolId);
            await updateDoc(schoolDocRef, { usersCount: increment(1) });
          } catch (err) {}
        }

        formAddUser.reset();
        closeModal("modal-add-school-user");
        showSchoolToast(`School User ${displayName} added successfully!`, "success");
      } catch (err) {
        console.error("Add user error:", err);
        showSchoolToast("Failed to save school user.", "error");
      }
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

      try {
        const schoolDocRef = doc(db, "schools", currentSchoolId);
        await updateDoc(schoolDocRef, {
          schoolName: name,
          name,
          logoUrl,
          adminEmail: email,
          address,
          updatedAt: serverTimestamp()
        });

        closeModal("modal-edit-school-info");
        showSchoolToast("School information updated successfully!", "success");
      } catch (err) {
        console.error("Update school error:", err);
        showSchoolToast("Failed to update school info.", "error");
      }
    });
  }
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

  if (nameInput) nameInput.value = school.schoolName || school.name || "";
  if (logoInput) logoInput.value = school.logoUrl || "";
  if (emailInput) emailInput.value = school.adminEmail || currentSchoolAccount?.email || "";
  if (addressInput) addressInput.value = school.address || "";

  openModal("modal-edit-school-info");
};

window.openEditSchoolUserPermsModal = (firebaseUid) => {
  const user = liveSchoolUsers.find((u) => u.firebaseUid === firebaseUid || u.uid === firebaseUid);
  if (!user) return;

  selectedUserForPerms = user;
  const titleEl = document.getElementById("m-perm-user-title");
  const subEl = document.getElementById("m-perm-user-sub");

  if (titleEl) titleEl.textContent = user.displayName || user.name || "User";
  if (subEl) subEl.textContent = `UID: ${user.firebaseUid} • School ID: ${currentSchoolId}`;

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

    try {
      const userDocRef = doc(db, "users", selectedUserForPerms.firebaseUid);
      await updateDoc(userDocRef, {
        status,
        deviceLimit,
        permissions,
        updatedAt: serverTimestamp()
      });

      closeModal("modal-edit-user-perms");
      showSchoolToast(`Settings saved for ${selectedUserForPerms.displayName || selectedUserForPerms.firebaseUid}!`, "success");
    } catch (err) {
      console.error("Save perms error:", err);
      showSchoolToast("Failed to save settings.", "error");
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
