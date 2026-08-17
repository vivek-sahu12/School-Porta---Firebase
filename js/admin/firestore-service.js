import {
  auth,
  db,
  storage,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  sendPasswordResetEmail,
  ref,
  uploadBytes,
  getDownloadURL
} from "../firebase.js";

/**
 * Cloud Firestore & Firebase Storage Service Layer
 * Clean, production-quality implementation with zero hardcoded demo data.
 */

// Collection References
const schoolsCol = collection(db, "schools");
const usersCol = collection(db, "users");
const sessionsCol = collection(db, "sessions");
const logsCol = collection(db, "activityLogs");

/**
 * ============================================================================
 * 1. REAL-TIME SUBSCRIPTIONS
 * ============================================================================
 */

/**
 * Subscribe to all Schools
 */
export function subscribeToSchools(onData, onError) {
  try {
    const q = query(schoolsCol, orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      const schools = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdDate: d.data().createdAt?.toDate ? d.data().createdAt.toDate().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Recently"
      }));
      onData(schools);
    }, (error) => {
      console.warn("Schools snapshot listener error (falling back to empty list):", error);
      if (onError) onError(error);
      else onData([]);
    });
  } catch (err) {
    console.warn("Could not setup schools listener:", err);
    onData([]);
  }
}

/**
 * Subscribe to all Users
 */
export function subscribeToUsers(onData, onError) {
  try {
    const q = query(usersCol, orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdDate: d.data().createdAt?.toDate ? d.data().createdAt.toDate().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Recently"
      }));
      onData(users);
    }, (error) => {
      console.warn("Users snapshot listener error (falling back to empty list):", error);
      if (onError) onError(error);
      else onData([]);
    });
  } catch (err) {
    console.warn("Could not setup users listener:", err);
    onData([]);
  }
}

/**
 * Subscribe to Active Sessions
 */
export function subscribeToSessions(onData, onError) {
  try {
    const q = query(sessionsCol, orderBy("lastActivity", "desc"), limit(50));
    return onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));
      onData(sessions);
    }, (error) => {
      console.warn("Sessions snapshot listener error:", error);
      if (onError) onError(error);
      else onData([]);
    });
  } catch (err) {
    console.warn("Could not setup sessions listener:", err);
    onData([]);
  }
}

/**
 * Subscribe to Activity / Edit Audit Logs
 */
export function subscribeToActivityLogs(onData, onError) {
  try {
    const q = query(logsCol, orderBy("timestamp", "desc"), limit(100));
    return onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map((d) => {
        const data = d.data();
        let formattedTime = "Recently";
        if (data.timestamp?.toDate) {
          formattedTime = data.timestamp.toDate().toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          });
        }
        return {
          id: d.id,
          ...data,
          formattedTime
        };
      });
      onData(logs);
    }, (error) => {
      console.warn("Activity logs listener error:", error);
      if (onError) onError(error);
      else onData([]);
    });
  } catch (err) {
    console.warn("Could not setup logs listener:", err);
    onData([]);
  }
}

/**
 * ============================================================================
 * 2. SCHOOL OPERATIONS (Cloud Firestore & Firebase Storage)
 * ============================================================================
 */

/**
 * Create a new School
 */
export async function createSchool({ name, shortCode, schoolId, adminEmail, address, status, logoFile }) {
  const finalSchoolId = schoolId ? schoolId.trim().toUpperCase() : `SCH-${Math.floor(1000 + Math.random() * 9000)}`;
  const finalShortCode = shortCode ? shortCode.trim().toUpperCase() : name.substring(0, 3).toUpperCase();
  
  let logoUrl = "";
  
  // Upload logo to Firebase Storage if provided
  if (logoFile && logoFile.size > 0) {
    try {
      const storagePath = `school-logos/${finalSchoolId}_${Date.now()}_${logoFile.name}`;
      const storageRef = ref(storage, storagePath);
      const snapshot = await uploadBytes(storageRef, logoFile);
      logoUrl = await getDownloadURL(snapshot.ref);
    } catch (uploadErr) {
      console.warn("Storage upload failed or storage not initialized; using default badge:", uploadErr);
    }
  }

  const schoolDocRef = doc(db, "schools", finalSchoolId);
  const schoolData = {
    name: name.trim(),
    shortCode: finalShortCode,
    logoUrl,
    logoInitial: name.substring(0, 2).toUpperCase(),
    status: status || "Active",
    usersCount: 0,
    adminEmail: adminEmail.trim().toLowerCase(),
    address: address ? address.trim() : "Campus Address",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(schoolDocRef, schoolData);

  // Log system activity
  await logSystemActivity({
    action: "Add",
    module: "Schools",
    recordName: `${name} (${finalSchoolId})`,
    field: "School Registration",
    oldValue: "None",
    newValue: `Status: ${status || 'Active'}`,
    school: name
  });

  return { id: finalSchoolId, ...schoolData };
}

/**
 * Update an existing School
 */
export async function updateSchool(schoolId, updateData) {
  const schoolDocRef = doc(db, "schools", schoolId);
  await updateDoc(schoolDocRef, {
    ...updateData,
    updatedAt: serverTimestamp()
  });

  await logSystemActivity({
    action: "Edit",
    module: "Schools",
    recordName: `School #${schoolId}`,
    field: "Profile Update",
    oldValue: "Previous",
    newValue: "Updated",
    school: updateData.name || schoolId
  });
}

/**
 * Toggle School Status (Active <-> Inactive)
 */
export async function toggleSchoolStatus(schoolId, currentStatus, schoolName = "School") {
  const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
  const schoolDocRef = doc(db, "schools", schoolId);
  await updateDoc(schoolDocRef, {
    status: newStatus,
    updatedAt: serverTimestamp()
  });

  await logSystemActivity({
    action: "Edit",
    module: "Schools",
    recordName: `${schoolName} (${schoolId})`,
    field: "Status",
    oldValue: currentStatus,
    newValue: newStatus,
    school: schoolName
  });

  return newStatus;
}

/**
 * Permanently Delete School (Danger Zone)
 */
export async function permanentlyDeleteSchool(schoolId, schoolName = "School") {
  const schoolDocRef = doc(db, "schools", schoolId);
  await deleteDoc(schoolDocRef);

  await logSystemActivity({
    action: "Delete",
    module: "Schools",
    recordName: `${schoolName} (${schoolId})`,
    field: "Permanent Removal",
    oldValue: "Active Record",
    newValue: "Deleted",
    school: schoolName
  });
}

/**
 * ============================================================================
 * 3. MULTI-USER MANAGEMENT & PER-USER PERMISSIONS
 * ============================================================================
 */

/**
 * Create a User under a School
 */
export async function createUser({
  schoolId,
  schoolName,
  name,
  email,
  role = "Teacher",
  status = "Active",
  deviceLimit = 3,
  permissions = {}
}) {
  const cleanEmail = email.trim().toLowerCase();
  const userId = `USR-${Math.floor(1000 + Math.random() * 9000)}`;
  const userDocRef = doc(db, "users", userId);

  const defaultPermissions = {
    editable: permissions.editable !== undefined ? permissions.editable : true,
    addStudent: permissions.addStudent !== undefined ? permissions.addStudent : true,
    deleteStudent: permissions.deleteStudent !== undefined ? permissions.deleteStudent : false,
    excelExport: permissions.excelExport !== undefined ? permissions.excelExport : true,
    reports: permissions.reports !== undefined ? permissions.reports : false
  };

  const userData = {
    userId,
    schoolId,
    schoolName,
    name: name.trim(),
    email: cleanEmail,
    role,
    status,
    deviceLimit: Number(deviceLimit) || 3,
    permissions: defaultPermissions,
    lastLogin: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(userDocRef, userData);

  // Increment school user count
  if (schoolId) {
    try {
      const schoolDocRef = doc(db, "schools", schoolId);
      await updateDoc(schoolDocRef, {
        usersCount: increment(1)
      });
    } catch (e) {
      console.warn("Could not increment school user count:", e);
    }
  }

  // Log activity
  await logSystemActivity({
    action: "Add",
    module: "Users",
    recordName: `${name} (${cleanEmail})`,
    field: "User Account",
    oldValue: "None",
    newValue: `Role: ${role}, School: ${schoolName}`,
    school: schoolName
  });

  return { id: userId, ...userData };
}

/**
 * Update an existing User Document
 */
export async function updateUser(userId, updateData) {
  const userDocRef = doc(db, "users", userId);
  await updateDoc(userDocRef, {
    ...updateData,
    updatedAt: serverTimestamp()
  });

  await logSystemActivity({
    action: "Edit",
    module: "Users",
    recordName: `User #${userId}`,
    field: "Profile Update",
    oldValue: "Previous",
    newValue: "Updated",
    school: updateData.schoolName || "School"
  });
}

/**
 * Update Individual User Permissions
 */
export async function updateUserPermissions(userId, permissions, userName = "User", schoolName = "School") {
  const userDocRef = doc(db, "users", userId);
  await updateDoc(userDocRef, {
    permissions,
    updatedAt: serverTimestamp()
  });

  await logSystemActivity({
    action: "Edit",
    module: "Permissions",
    recordName: `${userName} (${userId})`,
    field: "Permission Policy",
    oldValue: "Previous",
    newValue: "Updated Individual Permissions",
    school: schoolName
  });
}

/**
 * Update Individual User Device Limit
 */
export async function updateUserDeviceLimit(userId, deviceLimit, userName = "User", schoolName = "School") {
  const userDocRef = doc(db, "users", userId);
  const newLimit = Math.max(1, Math.min(15, Number(deviceLimit) || 1));
  await updateDoc(userDocRef, {
    deviceLimit: newLimit,
    updatedAt: serverTimestamp()
  });

  await logSystemActivity({
    action: "Edit",
    module: "Permissions",
    recordName: `${userName} (${userId})`,
    field: "Device Limit",
    oldValue: "Previous",
    newValue: `${newLimit} Devices`,
    school: schoolName
  });

  return newLimit;
}

/**
 * Toggle User Status (Active <-> Inactive)
 */
export async function toggleUserStatus(userId, currentStatus, userName = "User", schoolName = "School") {
  const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
  const userDocRef = doc(db, "users", userId);
  await updateDoc(userDocRef, {
    status: newStatus,
    updatedAt: serverTimestamp()
  });

  await logSystemActivity({
    action: "Edit",
    module: "Users",
    recordName: `${userName} (${userId})`,
    field: "User Status",
    oldValue: currentStatus,
    newValue: newStatus,
    school: schoolName
  });

  return newStatus;
}

/**
 * Send Password Reset Email via Firebase Auth
 */
export async function sendUserPasswordReset(email) {
  await sendPasswordResetEmail(auth, email);
  await logSystemActivity({
    action: "Edit",
    module: "Security",
    recordName: email,
    field: "Password Reset",
    oldValue: "Existing Password",
    newValue: "Reset Link Dispatched",
    school: "Global"
  });
}

/**
 * Force Terminate / Logout Session
 */
export async function terminateSession(sessionId, userEmail = "User", schoolName = "School") {
  try {
    const sessionDocRef = doc(db, "sessions", sessionId);
    await deleteDoc(sessionDocRef);
  } catch (e) {
    console.warn("Session deletion in Firestore skipped:", e);
  }

  await logSystemActivity({
    action: "Delete",
    module: "Sessions",
    recordName: `Session #${sessionId}`,
    field: "Force Logout",
    oldValue: "Connected",
    newValue: "Terminated",
    school: schoolName
  });
}

/**
 * ============================================================================
 * 4. SYSTEM AUDIT LOGGING
 * ============================================================================
 */
export async function logSystemActivity({
  action = "Edit",
  module = "System",
  recordName = "",
  field = "Record",
  oldValue = "",
  newValue = "",
  school = "System"
}) {
  try {
    const currentUser = auth.currentUser;
    const userEmail = currentUser ? currentUser.email : "admin@schoolportal.com";
    const userName = currentUser ? (currentUser.displayName || "Super Admin") : "Super Admin";

    await addDoc(logsCol, {
      user: userName,
      userEmail,
      school,
      action,
      module,
      recordName,
      field,
      oldValue: String(oldValue),
      newValue: String(newValue),
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.warn("Could not log activity in Firestore:", err);
  }
}
