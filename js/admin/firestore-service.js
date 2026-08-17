import {
  auth,
  db,
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
  sendPasswordResetEmail
} from "../firebase.js";

// Super Admin UID constant for access control (Level 1)
export const SUPER_ADMIN_UID = "FSe6FQsJrKaDVqqjcO4jv2EIkfp2";

// Collection References
const schoolsCol = collection(db, "schools");
const usersCol = collection(db, "users");
const sessionsCol = collection(db, "sessions");
const studentsCol = collection(db, "students");
const adminLogsCol = collection(db, "admin_logs");

/**
 * ============================================================================
 * 1. REAL-TIME SUBSCRIPTIONS
 * ============================================================================
 */

/**
 * Subscribe to all School Accounts (Level 2)
 */
export function subscribeToSchools(onData, onError) {
  try {
    const q = query(schoolsCol, orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      const schools = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          schoolId: data.schoolId || d.id,
          firebaseUid: data.firebaseUid || "",
          ...data,
          lastUpdated: data.updatedAt?.toDate 
            ? data.updatedAt.toDate().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) 
            : (data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Recently")
        };
      });
      onData(schools);
    }, (error) => {
      console.warn("Schools listener error:", error);
      if (onError) onError(error);
      else onData([]);
    });
  } catch (err) {
    console.warn("Could not setup schools listener:", err);
    onData([]);
  }
}

/**
 * Subscribe to all School User Accounts (Level 3)
 */
export function subscribeToUsers(onData, onError) {
  try {
    const q = query(usersCol, orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          firebaseUid: data.firebaseUid || d.id,
          uid: data.firebaseUid || d.id,
          schoolId: data.schoolId || "",
          ...data
        };
      });
      onData(users);
    }, (error) => {
      console.warn("Users listener error:", error);
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
    const q = query(sessionsCol, where("status", "==", "active"), limit(100));
    return onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map((d) => {
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
      onData(sessions);
    }, (error) => {
      console.warn("Sessions listener error:", error);
      if (onError) onError(error);
      else onData([]);
    });
  } catch (err) {
    console.warn("Could not setup sessions listener:", err);
    onData([]);
  }
}

/**
 * Subscribe to Real-Time Admin Activity / Audit Logs
 */
export function subscribeToAdminLogs(onData, onError) {
  try {
    const q = query(adminLogsCol, orderBy("timestamp", "desc"), limit(50));
    return onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          formattedTime: data.timestamp?.toDate 
            ? data.timestamp.toDate().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) 
            : "Just now"
        };
      });
      onData(logs);
    }, (error) => {
      console.warn("Admin logs listener error:", error);
      if (onError) onError(error);
      else onData([]);
    });
  } catch (err) {
    console.warn("Could not setup admin logs listener:", err);
    onData([]);
  }
}

/**
 * Log Meaningful Administrative Actions to Firestore
 */
export async function logAdminAction({ action, target, details = "", adminEmail = "Super Admin" }) {
  try {
    const logDocRef = doc(adminLogsCol);
    await setDoc(logDocRef, {
      action,
      target,
      details,
      admin: adminEmail || auth.currentUser?.email || "Super Admin",
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.warn("Could not record admin log:", err);
  }
}

/**
 * ============================================================================
 * 2. LEVEL 2: SCHOOL ACCOUNT OPERATIONS
 * ============================================================================
 */

/**
 * Register / Configure an Existing School Account
 */
export async function saveSchoolAccount({
  schoolId,
  firebaseUid = "",
  schoolName,
  logoUrl = "",
  address = "",
  adminEmail = "",
  status = "Active"
}) {
  const cleanSchoolId = schoolId.trim().toUpperCase();
  const cleanSchoolName = schoolName.trim();
  const cleanFirebaseUid = firebaseUid.trim();
  const cleanLogoUrl = logoUrl ? logoUrl.trim() : "";

  const schoolDocRef = doc(db, "schools", cleanSchoolId);
  const existingDoc = await getDoc(schoolDocRef);

  const schoolData = {
    schoolId: cleanSchoolId,
    firebaseUid: cleanFirebaseUid,
    name: cleanSchoolName,
    schoolName: cleanSchoolName,
    logoUrl: cleanLogoUrl,
    logoInitial: cleanSchoolName.substring(0, 2).toUpperCase(),
    status: status || "Active",
    address: address ? address.trim() : "Campus Address",
    adminEmail: adminEmail ? adminEmail.trim().toLowerCase() : "",
    usersCount: existingDoc.exists() ? (existingDoc.data().usersCount || 0) : 0,
    studentsCount: existingDoc.exists() ? (existingDoc.data().studentsCount || 0) : 0,
    updatedAt: serverTimestamp()
  };

  if (!existingDoc.exists()) {
    schoolData.createdAt = serverTimestamp();
  }

  await setDoc(schoolDocRef, schoolData, { merge: true });

  await logAdminAction({
    action: existingDoc.exists() ? "School Updated" : "School Configured",
    target: `${cleanSchoolName} (${cleanSchoolId})`,
    details: `Status: ${status}, UID: ${cleanFirebaseUid || 'None'}`
  });

  return { id: cleanSchoolId, ...schoolData };
}

/**
 * Update School Details
 */
export async function updateSchool(schoolId, updateData) {
  const cleanSchoolId = schoolId.trim().toUpperCase();
  const schoolDocRef = doc(db, "schools", cleanSchoolId);
  await updateDoc(schoolDocRef, {
    ...updateData,
    updatedAt: serverTimestamp()
  });

  await logAdminAction({
    action: "School Information Edited",
    target: `School ID: ${cleanSchoolId}`,
    details: updateData.schoolName ? `Name: ${updateData.schoolName}` : "Info updated"
  });
}

/**
 * Toggle School Status (Active <-> Inactive)
 */
export async function toggleSchoolStatus(schoolId, currentStatus) {
  const cleanSchoolId = schoolId.trim().toUpperCase();
  const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
  const schoolDocRef = doc(db, "schools", cleanSchoolId);
  await updateDoc(schoolDocRef, {
    status: newStatus,
    updatedAt: serverTimestamp()
  });

  await logAdminAction({
    action: newStatus === "Active" ? "School Activated" : "School Deactivated",
    target: `School ID: ${cleanSchoolId}`,
    details: `Status: ${currentStatus} → ${newStatus}`
  });

  return newStatus;
}

/**
 * Permanently Delete School
 */
export async function permanentlyDeleteSchool(schoolId) {
  const cleanSchoolId = schoolId.trim().toUpperCase();
  const schoolDocRef = doc(db, "schools", cleanSchoolId);
  await deleteDoc(schoolDocRef);

  await logAdminAction({
    action: "School Permanently Deleted",
    target: `School ID: ${cleanSchoolId}`,
    details: "School document removed from Firestore"
  });
}

/**
 * ============================================================================
 * 3. LEVEL 3: SCHOOL USER ACCOUNT OPERATIONS
 * ============================================================================
 */

/**
 * Configure an Existing Firebase Authentication User Account under a School
 */
export async function saveUserAccount({
  firebaseUid,
  schoolId,
  displayName = "",
  email = "",
  status = "Active",
  deviceLimit = 3,
  permissions = {}
}) {
  const cleanUid = (firebaseUid || "").trim();
  const cleanSchoolId = (schoolId || "").trim().toUpperCase();
  const cleanEmail = email ? email.trim().toLowerCase() : "";
  const cleanName = displayName ? displayName.trim() : (cleanEmail.split("@")[0] || "User");

  if (!cleanUid || !cleanSchoolId) {
    throw new Error("Missing required Firebase UID or School ID.");
  }

  const userDocRef = doc(db, "users", cleanUid);
  const existingDoc = await getDoc(userDocRef);

  const defaultPermissions = {
    editable: permissions.editable !== undefined ? !!permissions.editable : true,
    addStudent: permissions.addStudent !== undefined ? !!permissions.addStudent : true,
    deleteStudent: permissions.deleteStudent !== undefined ? !!permissions.deleteStudent : false,
    excelExport: permissions.excelExport !== undefined ? !!permissions.excelExport : true,
    reports: permissions.reports !== undefined ? !!permissions.reports : false
  };

  const userData = {
    firebaseUid: cleanUid,
    uid: cleanUid,
    type: "user",
    schoolId: cleanSchoolId,
    name: cleanName,
    displayName: cleanName,
    email: cleanEmail,
    status: status || "Active",
    deviceLimit: Math.max(1, Math.min(15, Number(deviceLimit) || 3)),
    permissions: defaultPermissions,
    updatedAt: serverTimestamp()
  };

  if (!existingDoc.exists()) {
    userData.createdAt = serverTimestamp();
    try {
      const schoolDocRef = doc(db, "schools", cleanSchoolId);
      await updateDoc(schoolDocRef, {
        usersCount: increment(1)
      });
    } catch (e) {
      console.warn("Could not increment school user count:", e);
    }
  }

  await setDoc(userDocRef, userData, { merge: true });

  await logAdminAction({
    action: existingDoc.exists() ? "User Settings Updated" : "User Configured",
    target: `${cleanName} (${cleanUid})`,
    details: `School: ${cleanSchoolId}, Device Limit: ${userData.deviceLimit}, Status: ${status}`
  });

  return { id: cleanUid, ...userData };
}

/**
 * ============================================================================
 * 4. ACTIVE SESSIONS & FORCE LOGOUT
 * ============================================================================
 */

/**
 * Force Logout / Terminate an Active Session
 */
export async function terminateSession(sessionId) {
  try {
    const sessionDocRef = doc(db, "sessions", sessionId);
    await updateDoc(sessionDocRef, {
      status: "terminated",
      logoutTime: serverTimestamp()
    });

    await logAdminAction({
      action: "Session Force Logged Out",
      target: `Session: ${sessionId}`,
      details: "Session marked as terminated"
    });
  } catch (err) {
    console.warn("Terminate session error:", err);
  }
}
