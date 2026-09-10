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
  increment,
  runTransaction
} from "../firebase.js";

import {
  saveCollectionToCache
} from "../offline-store.js";

import {
  normalizeStudentDataset
} from "./excel-parser.js";

// Super Admin UID constant for access control (Level 1)
export const SUPER_ADMIN_UID = "FSe6FQsJrKaDVqqjcO4jv2EIkfp2";

// Collection References
const schoolsCol = collection(db, "schools");
const usersCol = collection(db, "users");
const sessionsCol = collection(db, "sessions");
const adminLogsCol = collection(db, "admin_logs");
const studentDatasetsCol = collection(db, "student_datasets");

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
        const schoolPhone = data.phoneNumber || data.phone || "";
        return {
          id: d.id,
          schoolId: data.schoolId || d.id,
          firebaseUid: data.firebaseUid || "",
          ...data,
          phoneNumber: schoolPhone,
          phone: schoolPhone, // Read fallback
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
 * Prune older admin logs from Firestore so ONLY the latest maxKeep (10) remain stored.
 * Actually deletes documents beyond the latest 10 from the database.
 */
export async function pruneOldAdminLogs(maxKeep = 10) {
  try {
    const q = query(adminLogsCol, orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    if (snapshot.size > maxKeep) {
      const staleDocs = snapshot.docs.slice(maxKeep);
      const deletePromises = staleDocs.map(d => deleteDoc(d.ref).catch(err => {
        console.warn("Failed to delete stale admin log:", d.id, err);
      }));
      await Promise.all(deletePromises);
    }
  } catch (err) {
    console.warn("Could not prune admin logs:", err);
  }
}

/**
 * Subscribe to Admin Activity Logs (Maintains & displays ONLY the latest 10 records)
 */
export function subscribeToAdminLogs(onData, onError) {
  try {
    // Initial cleanup: prune any pre-existing historical backlog beyond 10
    pruneOldAdminLogs(10).catch(() => {});

    // Listen only to the top 10 most recent records
    const q = query(adminLogsCol, orderBy("timestamp", "desc"), limit(10));
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
 * Record an audit log entry and ensure database maintains ONLY the latest 10 records
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

    // Physically prune any records older than the latest 10
    await pruneOldAdminLogs(10);
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
 * Create a new School Account atomically, enforcing School ID and UID uniqueness.
 *
 * RULES:
 *  - If schoolId already exists in Firestore → REJECT (never update/overwrite).
 *  - If firebaseUid is already associated with a DIFFERENT school → REJECT.
 *  - Only if both checks pass: write school + user documents atomically.
 *
 * Use updateSchool() or saveUserAccount() for legitimate edits.
 */
export async function saveSchoolWithAccount({
  schoolId,
  schoolName,
  firebaseUid = "",
  adminEmail = "",
  phone = "",
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
  const cleanPhone = phone ? phone.trim() : "";
  const cleanLogoUrl = logoUrl ? logoUrl.trim() : "";

  if (!cleanSchoolId || !cleanSchoolName) {
    throw new Error("School ID and School Name are required.");
  }

  const schoolDocRef = doc(db, "schools", cleanSchoolId);
  const userDocRef = cleanFirebaseUid ? doc(db, "users", cleanFirebaseUid) : null;

  const defaultPermissions = {
    editable: permissions.editable !== undefined ? !!permissions.editable : true,
    addStudent: permissions.addStudent !== undefined ? !!permissions.addStudent : true,
    deleteStudent: permissions.deleteStudent !== undefined ? !!permissions.deleteStudent : true,
    excelExport: permissions.excelExport !== undefined ? !!permissions.excelExport : true,
    reports: permissions.reports !== undefined ? !!permissions.reports : true
  };

  // Atomic transaction: check-then-write with server-side serialization.
  // Prevents duplicates from concurrent Admin operations.
  const result = await runTransaction(db, async (transaction) => {
    // 1. Read school document inside transaction
    const schoolSnap = await transaction.get(schoolDocRef);

    if (schoolSnap.exists()) {
      // School ID is already taken — reject entirely, touch nothing
      throw new Error(
        `School ID already exists. "${cleanSchoolId}" is already assigned to another school. ` +
        `Please use a unique School ID or edit the existing school.`
      );
    }

    // 2. Read user document inside transaction (if UID was provided)
    if (userDocRef) {
      const userSnap = await transaction.get(userDocRef);

      if (userSnap.exists()) {
        const existingData = userSnap.data();
        const existingSchoolId = existingData.schoolId || "";

        if (existingSchoolId && existingSchoolId !== cleanSchoolId) {
          // UID already bound to a DIFFERENT school — reject
          throw new Error(
            `User is already assigned to another school (${existingSchoolId}). ` +
            `Please use the correct user or edit the existing assignment through the appropriate workflow.`
          );
        }
        // If the UID exists but is already for this same schoolId (edge case),
        // fall through and allow the write to update/complete the record.
      }
    }

    // 3. Both checks passed — write atomically inside the transaction
    const now = serverTimestamp();

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
      phoneNumber: cleanPhone,
      startingClass: startingClass || "Nursery",
      endingClass: endingClass || "Class 10",
      subjects: Array.isArray(subjects) ? subjects : [],
      usersCount: 0,
      createdAt: now,
      updatedAt: now
    };

    transaction.set(schoolDocRef, schoolData);

    if (userDocRef) {
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
        createdAt: now,
        updatedAt: now
      };

      transaction.set(userDocRef, schoolAccountData);
    }

    return { id: cleanSchoolId, schoolId: cleanSchoolId, schoolName: cleanSchoolName };
  });

  // Log after successful transaction
  await logAdminAction({
    action: "School Account Configured",
    target: `${cleanSchoolName} (${cleanSchoolId})`,
    details: `Status: ${status}, Device Limit: ${deviceLimit}`
  });

  return result;
}

/**
 * Update School Details
 */
export async function updateSchool(schoolId, updateData) {
  const cleanSchoolId = schoolId.trim().toUpperCase();
  const schoolDocRef = doc(db, "schools", cleanSchoolId);

  const payload = {
    ...updateData,
    updatedAt: serverTimestamp()
  };

  // Canonicalize phone field to phoneNumber
  if (updateData.phoneNumber !== undefined || updateData.phone !== undefined) {
    payload.phoneNumber = updateData.phoneNumber !== undefined ? updateData.phoneNumber : updateData.phone;
    delete payload.phone;
  }

  // Remove any undefined keys to avoid Firestore rejection
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  await updateDoc(schoolDocRef, payload);

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
    // New user creation: ensure this UID is not already assigned to a DIFFERENT school
    // (prevents silent UID reassignment through the sub-user create flow)
    userData.createdAt = serverTimestamp();

    if (type !== "school") {
      // Increment the sub-user count on the school document
      try {
        const schoolDocRef = doc(db, "schools", cleanSchoolId);
        await updateDoc(schoolDocRef, {
          usersCount: increment(1)
        });
      } catch (e) {
        console.warn("Could not increment school user count:", e);
      }
    }
  } else {
    // Existing document: verify it belongs to the same school before allowing updates.
    // If a different schoolId is stored, reject to prevent cross-school reassignment.
    const storedSchoolId = existingDoc.data().schoolId || "";
    if (storedSchoolId && storedSchoolId !== cleanSchoolId) {
      throw new Error(
        `User is already assigned to another school (${storedSchoolId}). ` +
        `Please use the correct user or edit the existing assignment through the appropriate workflow.`
      );
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
 * Permanently Delete a School User Account
 */
export async function deleteUserAccount(userUid) {
  const cleanUid = (userUid || "").trim();
  if (!cleanUid) {
    throw new Error("User UID is required.");
  }

  const userDocRef = doc(db, "users", cleanUid);
  const userSnap = await getDoc(userDocRef);
  const userData = userSnap.exists() ? userSnap.data() : null;

  // 1. Delete user document from Cloud Firestore
  await deleteDoc(userDocRef);

  // 2. Decrement school user count if applicable
  if (userData?.schoolId && userData.type !== "school") {
    try {
      const schoolDocRef = doc(db, "schools", userData.schoolId);
      await updateDoc(schoolDocRef, {
        usersCount: increment(-1)
      });
    } catch (e) {
      console.warn("Could not decrement school user count:", e);
    }
  }

  // 3. Terminate active sessions and delete all session records for this user
  try {
    const q = query(sessionsCol, where("userUid", "==", cleanUid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      // Update active sessions so live listeners receive immediate termination event
      const termPromises = snap.docs.map((d) =>
        updateDoc(d.ref, {
          status: "terminated",
          reason: "account_deleted",
          logoutTime: serverTimestamp()
        }).catch(() => {})
      );
      await Promise.all(termPromises);

      // Purge session documents from Firestore
      const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    }
  } catch (sesErr) {
    console.warn("Could not delete user sessions:", sesErr);
  }

  // 4. Log admin audit action
  await logAdminAction({
    action: "School User Permanently Deleted",
    target: `${userData?.displayName || userData?.name || cleanUid} (${userData?.schoolId || "Unknown School"})`,
    details: `User UID: ${cleanUid} deleted and all sessions purged`
  });

  return { success: true };
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

/**
 * ============================================================================
 * 6. STUDENT DATASETS MANAGEMENT (School Data, UDISE, 3.0)
 * ============================================================================
 */

/**
 * Upload & replace a student dataset for a specific school (Admin Only)
 */
export async function uploadSchoolDataset(schoolId, datasetKey, students, metadata = {}) {
  // 1. Strict Super Admin clearance guard
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== SUPER_ADMIN_UID) {
    throw new Error("Unauthorized: Only authenticated Super Administrators can upload student datasets.");
  }

  const cleanSchoolId = (schoolId || "").trim().toUpperCase();
  if (!cleanSchoolId) {
    throw new Error("Invalid School ID for dataset upload.");
  }

  if (!Array.isArray(students)) {
    throw new Error("Invalid student data array.");
  }

  // Database-level normalization: convert applicable text values to UPPERCASE and normalize whitespace
  const normalizedStudents = normalizeStudentDataset(students);

  const docId = `${cleanSchoolId}_${datasetKey}`;
  const datasetDocRef = doc(db, "student_datasets", docId);

  // 2. Atomic write/snapshot replacement in student_datasets
  await setDoc(datasetDocRef, {
    schoolId: cleanSchoolId,
    datasetKey,
    recordCount: normalizedStudents.length,
    fileName: metadata.fileName || "students.xlsx",
    uploadedBy: currentUser.email || "Super Admin",
    uploadedAt: serverTimestamp(),
    students: normalizedStudents
  });

  // 3. Update dataset metadata mirrors on school entity
  const schoolDocRef = doc(db, "schools", cleanSchoolId);
  const schoolUpdate = {
    [`datasets.${datasetKey}`]: {
      recordCount: normalizedStudents.length,
      fileName: metadata.fileName || "students.xlsx",
      updatedAt: serverTimestamp()
    },
    updatedAt: serverTimestamp()
  };

  if (datasetKey === "school_data") {
    schoolUpdate.studentsCount = normalizedStudents.length;
  }

  await updateDoc(schoolDocRef, schoolUpdate);

  // 4. Cache to local IndexedDB for immediate offline availability
  const cacheKeyMap = {
    school_data: `students_sd_${cleanSchoolId}`,
    udise: `students_ud_${cleanSchoolId}`,
    three_point_zero: `students_p3_${cleanSchoolId}`
  };
  const cacheKey = cacheKeyMap[datasetKey];
  if (cacheKey) {
    await saveCollectionToCache(cacheKey, normalizedStudents, "id");
  }

  // 5. Record admin audit log
  const labelMap = {
    school_data: "School Data",
    udise: "UDISE",
    three_point_zero: "3.0"
  };
  const label = labelMap[datasetKey] || datasetKey;

  await logAdminAction({
    action: `${label} Dataset Uploaded`,
    target: `School: ${cleanSchoolId}`,
    details: `${normalizedStudents.length} records processed from '${metadata.fileName || 'students.xlsx'}'`
  });

  return {
    success: true,
    datasetKey,
    schoolId: cleanSchoolId,
    recordCount: normalizedStudents.length
  };
}

/**
 * Fetch a single dataset for a school
 */
export async function getSchoolDataset(schoolId, datasetKey) {
  const cleanSchoolId = (schoolId || "").trim().toUpperCase();
  if (!cleanSchoolId) return null;

  const docId = `${cleanSchoolId}_${datasetKey}`;
  const datasetDocRef = doc(db, "student_datasets", docId);
  const snap = await getDoc(datasetDocRef);
  if (snap.exists()) {
    return snap.data();
  }
  return null;
}

/**
 * Fetch dataset metadata summaries for a school
 */
export async function getSchoolDatasetSummaries(schoolId) {
  const cleanSchoolId = (schoolId || "").trim().toUpperCase();
  if (!cleanSchoolId) return {};

  const summaries = {};
  const schoolDocRef = doc(db, "schools", cleanSchoolId);
  const schoolSnap = await getDoc(schoolDocRef);
  if (schoolSnap.exists() && schoolSnap.data().datasets) {
    const d = schoolSnap.data().datasets;
    return d;
  }

  // Fallback: check student_datasets collection directly
  const keys = ["school_data", "udise", "three_point_zero"];
  for (const k of keys) {
    try {
      const dSnap = await getDoc(doc(db, "student_datasets", `${cleanSchoolId}_${k}`));
      if (dSnap.exists()) {
        const data = dSnap.data();
        summaries[k] = {
          recordCount: data.recordCount || 0,
          fileName: data.fileName || "",
          updatedAt: data.uploadedAt
        };
      }
    } catch (e) {
      console.warn(`Error reading summary for ${k}:`, e);
    }
  }

  return summaries;
}

