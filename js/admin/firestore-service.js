import {
  auth,
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment
} from "../firebase.js";

// Super Admin UID constant for access control (Level 1)
export const SUPER_ADMIN_UID = "FSe6FQsJrKaDVqqjcO4jv2EIkfp2";

// Collection References
const schoolsCol = collection(db, "schools");
const usersCol = collection(db, "users");
const sessionsCol = collection(db, "sessions");
const adminLogsCol = collection(db, "admin_logs");

/**
 * ============================================================================
 * 1. REAL-TIME SUBSCRIPTIONS
 * ============================================================================
 */

/**
 * Subscribe to all School Documents
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
 * Subscribe to all Authenticated Accounts (Both School Accounts and School Users)
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
          type: data.type || (data.firebaseUid?.startsWith("SCH") ? "school" : "user"),
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
 * Subscribe to Active Sessions (ONLY currently active sessions)
 */
export function subscribeToSessions(onData, onError) {
  try {
    const q = query(sessionsCol, where("status", "==", "active"));
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
      // Sort in-memory by loginTime descending
      sessions.sort((a, b) => {
        const tA = a.loginTime?.toDate ? a.loginTime.toDate().getTime() : 0;
        const tB = b.loginTime?.toDate ? b.loginTime.toDate().getTime() : 0;
        return tB - tA;
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
 * Subscribe to Admin Activity Logs
 */
export function subscribeToAdminLogs(onData, onError) {
  try {
    const q = query(adminLogsCol, orderBy("timestamp", "desc"), limit(100));
    return onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          formattedTime: data.timestamp?.toDate 
            ? data.timestamp.toDate().toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) 
            : "Recently"
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
 * Record an audit log entry
 */
export async function logAdminAction({ action, target, details }) {
  try {
    const adminUser = auth.currentUser;
    await setDoc(doc(adminLogsCol), {
      action: action || "Admin Action",
      target: target || "System",
      details: details || "Success",
      admin: adminUser?.email || "Super Admin",
      adminUid: adminUser?.uid || SUPER_ADMIN_UID,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.warn("Could not record admin log:", err);
  }
}

/**
 * ============================================================================
 * 2. LEVEL 2: SCHOOLS CRUD OPERATIONS
 * ============================================================================
 */

/**
 * Save / Enroll a School and its Primary Authentication Account
 */
export async function saveSchoolWithAccount({
  schoolId,
  schoolName,
  firebaseUid = "",
  adminEmail = "",
  logoUrl = "",
  address = "",
  status = "Active",
  startingClass = "Nursery",
  endingClass = "Class 10",
  subjects = [],
  deviceLimit = 3,
  permissions = {}
}) {
  const cleanSchoolId = schoolId.trim().toUpperCase();
  const cleanSchoolName = schoolName.trim();
  const cleanFirebaseUid = firebaseUid ? firebaseUid.trim() : "";
  const cleanEmail = adminEmail ? adminEmail.trim().toLowerCase() : "";
  const cleanLogoUrl = logoUrl ? logoUrl.trim() : "";

  if (!cleanSchoolId || !cleanSchoolName) {
    throw new Error("School ID and School Name are required.");
  }

  // 1. Write School Entity Record (schools/SCHOOL001)
  const schoolDocRef = doc(db, "schools", cleanSchoolId);
  const existingSchoolDoc = await getDoc(schoolDocRef);

  const schoolData = {
    schoolId: cleanSchoolId,
    firebaseUid: cleanFirebaseUid,
    name: cleanSchoolName,
    schoolName: cleanSchoolName,
    logoUrl: cleanLogoUrl,
    logoInitial: cleanSchoolName.substring(0, 2).toUpperCase(),
    status: status || "Active",
    address: address ? address.trim() : "Campus Address",
    adminEmail: cleanEmail,
    startingClass: startingClass || "Nursery",
    endingClass: endingClass || "Class 10",
    subjects: Array.isArray(subjects) ? subjects : [],
    usersCount: existingSchoolDoc.exists() ? (existingSchoolDoc.data().usersCount || 0) : 0,
    updatedAt: serverTimestamp()
  };

  if (!existingSchoolDoc.exists()) {
    schoolData.createdAt = serverTimestamp();
  }

  await setDoc(schoolDocRef, schoolData, { merge: true });

  // 2. Write Primary School Authenticated Account Record (users/SCHOOL_A_UID)
  if (cleanFirebaseUid) {
    const userDocRef = doc(db, "users", cleanFirebaseUid);
    const existingUserDoc = await getDoc(userDocRef);

    const defaultPermissions = {
      editable: permissions.editable !== undefined ? !!permissions.editable : true,
      addStudent: permissions.addStudent !== undefined ? !!permissions.addStudent : true,
      deleteStudent: permissions.deleteStudent !== undefined ? !!permissions.deleteStudent : true,
      excelExport: permissions.excelExport !== undefined ? !!permissions.excelExport : true,
      reports: permissions.reports !== undefined ? !!permissions.reports : true
    };

    const schoolAccountData = {
      firebaseUid: cleanFirebaseUid,
      uid: cleanFirebaseUid,
      type: "school",
      schoolId: cleanSchoolId,
      name: cleanSchoolName,
      displayName: `${cleanSchoolName} (Primary Account)`,
      email: cleanEmail,
      status: status || "Active",
      deviceLimit: Math.max(1, Math.min(15, Number(deviceLimit) || 3)),
      permissions: defaultPermissions,
      updatedAt: serverTimestamp()
    };

    if (!existingUserDoc.exists()) {
      schoolAccountData.createdAt = serverTimestamp();
    }

    await setDoc(userDocRef, schoolAccountData, { merge: true });
  }

  await logAdminAction({
    action: existingSchoolDoc.exists() ? "School Account Updated" : "School Account Configured",
    target: `${cleanSchoolName} (${cleanSchoolId})`,
    details: `Status: ${status}, Device Limit: ${deviceLimit}`
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
 * Terminate all active sessions belonging to a specific school
 */
export async function terminateSchoolSessions(schoolId) {
  try {
    const cleanSchoolId = (schoolId || "").trim().toUpperCase();
    if (!cleanSchoolId) return;
    const q = query(sessionsCol, where("schoolId", "==", cleanSchoolId), where("status", "==", "active"));
    const snap = await getDocs(q);
    const updates = [];
    snap.forEach((d) => {
      updates.push(updateDoc(d.ref, {
        status: "terminated",
        logoutTime: serverTimestamp()
      }));
    });
    if (updates.length > 0) {
      await Promise.all(updates);
    }
  } catch (err) {
    console.warn("Error terminating school sessions:", err);
  }
}

/**
 * Terminate all active sessions belonging to a specific user
 */
export async function terminateUserSessions(userUid) {
  try {
    const cleanUid = (userUid || "").trim();
    if (!cleanUid) return;
    const q = query(sessionsCol, where("userUid", "==", cleanUid), where("status", "==", "active"));
    const snap = await getDocs(q);
    const updates = [];
    snap.forEach((d) => {
      updates.push(updateDoc(d.ref, {
        status: "terminated",
        logoutTime: serverTimestamp()
      }));
    });
    if (updates.length > 0) {
      await Promise.all(updates);
    }
  } catch (err) {
    console.warn("Error terminating user sessions:", err);
  }
}

/**
 * Toggle School Status (Active <-> Inactive for both School entity and School Account)
 */
export async function toggleSchoolStatus(schoolId, currentStatus, firebaseUid = "") {
  const cleanSchoolId = schoolId.trim().toUpperCase();
  const newStatus = currentStatus === "Active" ? "Inactive" : "Active";

  // Update school record
  const schoolDocRef = doc(db, "schools", cleanSchoolId);
  await updateDoc(schoolDocRef, {
    status: newStatus,
    updatedAt: serverTimestamp()
  });

  // Also update primary school account status if UID exists
  if (firebaseUid) {
    try {
      const userDocRef = doc(db, "users", firebaseUid.trim());
      await updateDoc(userDocRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.warn("Could not sync status to school account UID:", e);
    }
  }

  // If deactivating, terminate all active sessions for this school immediately
  if (newStatus === "Inactive") {
    await terminateSchoolSessions(cleanSchoolId);
  }

  await logAdminAction({
    action: newStatus === "Active" ? "School Activated" : "School Deactivated",
    target: `School ID: ${cleanSchoolId}`,
    details: `Status changed: ${currentStatus} -> ${newStatus}${newStatus === "Inactive" ? " (All active sessions revoked)" : ""}`
  });

  return newStatus;
}

/**
 * Permanently Delete School & associated account record
 */
export async function permanentlyDeleteSchool(schoolId, firebaseUid = "") {
  const cleanSchoolId = schoolId.trim().toUpperCase();
  const schoolDocRef = doc(db, "schools", cleanSchoolId);
  await deleteDoc(schoolDocRef);

  if (firebaseUid) {
    try {
      const userDocRef = doc(db, "users", firebaseUid.trim());
      await deleteDoc(userDocRef);
    } catch (e) {
      console.warn("Could not delete school user document:", e);
    }
  }

  await logAdminAction({
    action: "School Permanently Deleted",
    target: `School ID: ${cleanSchoolId}`,
    details: "School document removed from Firestore"
  });
}

/**
 * ============================================================================
 * 3. LEVEL 3: SCHOOL USERS (Additional Accounts belonging to School)
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
  permissions = {},
  type = "user"
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
    deleteStudent: permissions.deleteStudent !== undefined ? !!permissions.deleteStudent : (type === "school"),
    excelExport: permissions.excelExport !== undefined ? !!permissions.excelExport : true,
    reports: permissions.reports !== undefined ? !!permissions.reports : (type === "school")
  };

  const userData = {
    firebaseUid: cleanUid,
    uid: cleanUid,
    type: type || "user",
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
    if (type !== "school") {
      try {
        const schoolDocRef = doc(db, "schools", cleanSchoolId);
        await updateDoc(schoolDocRef, {
          usersCount: increment(1)
        });
      } catch (e) {
        console.warn("Could not increment school user count:", e);
      }
    }
  }

  await setDoc(userDocRef, userData, { merge: true });

  // If user is deactivated, immediately terminate all active sessions for this user
  if (status === "Inactive") {
    await terminateUserSessions(cleanUid);
  }

  await logAdminAction({
    action: existingDoc.exists() ? "Account Settings Updated" : (type === "school" ? "School Account Saved" : "User Configured"),
    target: `${cleanName} (${cleanSchoolId})`,
    details: `Type: ${type}, School: ${cleanSchoolId}, Device Limit: ${userData.deviceLimit}, Status: ${status}${status === "Inactive" ? " (All active sessions revoked)" : ""}`
  });

  return { id: cleanUid, ...userData };
}

/**
 * ============================================================================
 * 4. ACTIVE SESSIONS, FORCE LOGOUT & RETENTION CLEANUP
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
    return { success: true };
  } catch (err) {
    console.error("Terminate session error:", err);
    throw err;
  }
}

/**
 * Enforce Per-User Session Retention Rule:
 * Strictly retains the newest 3 session records for this specific user.
 * Physically deletes all 4th and older session documents from Cloud Firestore.
 * Scoped strictly to userUid (User A's sessions never touch User B's).
 */
export async function enforceUserSessionRetention(userUid, maxToKeep = 3) {
  if (!userUid) return;
  try {
    const cleanUid = userUid.trim();
    const q = query(sessionsCol, where("userUid", "==", cleanUid));
    const snap = await getDocs(q);

    if (snap.size <= maxToKeep) return;

    const userSessions = snap.docs.map((d) => {
      const data = d.data();
      let time = 0;
      if (data.loginTime?.toDate) {
        time = data.loginTime.toDate().getTime();
      } else if (data.loginTime?._seconds) {
        time = data.loginTime._seconds * 1000;
      } else if (typeof data.loginTime === "number") {
        time = data.loginTime;
      }
      return { id: d.id, ref: d.ref, time };
    });

    // Sort descending by loginTime (newest first)
    userSessions.sort((a, b) => b.time - a.time);

    // Keep top 3 (indices 0, 1, 2); delete 4th and older (indices >= 3)
    const toDelete = userSessions.slice(maxToKeep);
    if (toDelete.length > 0) {
      const deletePromises = toDelete.map((item) => deleteDoc(item.ref));
      await Promise.all(deletePromises);
      console.log(`Physically purged ${toDelete.length} obsolete session document(s) for user ${cleanUid}.`);
    }
  } catch (err) {
    console.warn("Session retention cleanup warning:", err);
  }
}

/**
 * Fetch retained recent session history for a specific user (maximum 3 records)
 */
export async function getUserSessionHistory(userUid, max = 3) {
  if (!userUid) return [];
  try {
    const cleanUid = userUid.trim();
    const q = query(sessionsCol, where("userUid", "==", cleanUid));
    const snap = await getDocs(q);

    const sessions = snap.docs.map((d) => {
      const data = d.data();
      let time = 0;
      if (data.loginTime?.toDate) {
        time = data.loginTime.toDate().getTime();
      } else if (data.loginTime?._seconds) {
        time = data.loginTime._seconds * 1000;
      }
      return {
        id: d.id,
        sessionId: data.sessionId || d.id,
        ...data,
        timestamp: time,
        formattedLoginTime: data.loginTime?.toDate 
          ? data.loginTime.toDate().toLocaleString([], { dateStyle: "short", timeStyle: "short" }) 
          : "Recently",
        formattedLastActive: data.lastActive?.toDate 
          ? data.lastActive.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) 
          : "Now"
      };
    });

    sessions.sort((a, b) => b.timestamp - a.timestamp);
    return sessions.slice(0, max);
  } catch (err) {
    console.warn("Error fetching user session history:", err);
    return [];
  }
}

/**
 * Clean up old session records older than 48 hours (1-2 days target retention)
 */
export async function cleanupOldSessions() {
  try {
    const twoDaysAgo = new Date(Date.now() - (48 * 60 * 60 * 1000));
    const oldSessionsSnap = await getDocs(sessionsCol);

    let deletedCount = 0;
    const deletePromises = [];

    oldSessionsSnap.forEach((d) => {
      const data = d.data();
      const loginDate = data.loginTime?.toDate ? data.loginTime.toDate() : null;
      const logoutDate = data.logoutTime?.toDate ? data.logoutTime.toDate() : null;
      const lastActiveDate = data.lastActive?.toDate ? data.lastActive.toDate() : null;

      const isOld = (loginDate && loginDate < twoDaysAgo) || 
                    (logoutDate && logoutDate < twoDaysAgo) ||
                    (lastActiveDate && lastActiveDate < twoDaysAgo);

      const isTerminated = data.status === "terminated" || data.status === "logged_out";

      if (isOld || (isTerminated && logoutDate && logoutDate < twoDaysAgo)) {
        deletePromises.push(deleteDoc(d.ref));
        deletedCount++;
      }
    });

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
      console.log(`Cleaned up ${deletedCount} expired session records (older than 48h).`);
    }
  } catch (err) {
    console.warn("Session cleanup routine error:", err);
  }
}

export const saveSchoolAccount = saveSchoolWithAccount;
