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
 * Subscribe to Students belonging to a specific School
 */
export function subscribeToStudentsBySchool(schoolId, onData, onError) {
  if (!schoolId) {
    onData([]);
    return () => {};
  }
  try {
    const q = query(studentsCol, where("schoolId", "==", schoolId), orderBy("createdAt", "desc"), limit(100));
    return onSnapshot(q, (snapshot) => {
      const students = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));
      onData(students);
    }, (error) => {
      console.warn("Students listener error:", error);
      if (onError) onError(error);
      else onData([]);
    });
  } catch (err) {
    console.warn("Could not setup students listener:", err);
    onData([]);
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
  return newStatus;
}

/**
 * Permanently Delete School
 */
export async function permanentlyDeleteSchool(schoolId) {
  const cleanSchoolId = schoolId.trim().toUpperCase();
  const schoolDocRef = doc(db, "schools", cleanSchoolId);
  await deleteDoc(schoolDocRef);
}

/**
 * ============================================================================
 * 3. LEVEL 3: SCHOOL USER ACCOUNT OPERATIONS (Per-User Permissions & Device Limits)
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
    // Increment school user count
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
  return { id: cleanUid, ...userData };
}

/**
 * Update Individual User Permissions
 */
export async function updateUserPermissions(firebaseUid, permissions) {
  const cleanUid = firebaseUid.trim();
  const userDocRef = doc(db, "users", cleanUid);
  await updateDoc(userDocRef, {
    permissions,
    updatedAt: serverTimestamp()
  });
}

/**
 * Update Individual User Device Limit
 */
export async function updateUserDeviceLimit(firebaseUid, deviceLimit) {
  const cleanUid = firebaseUid.trim();
  const userDocRef = doc(db, "users", cleanUid);
  const newLimit = Math.max(1, Math.min(15, Number(deviceLimit) || 1));
  await updateDoc(userDocRef, {
    deviceLimit: newLimit,
    updatedAt: serverTimestamp()
  });
  return newLimit;
}

/**
 * Toggle User Status (Active <-> Inactive)
 */
export async function toggleUserStatus(firebaseUid, currentStatus) {
  const cleanUid = firebaseUid.trim();
  const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
  const userDocRef = doc(db, "users", cleanUid);
  await updateDoc(userDocRef, {
    status: newStatus,
    updatedAt: serverTimestamp()
  });
  return newStatus;
}

/**
 * Delete User Configuration
 */
export async function deleteUserAccount(firebaseUid, schoolId) {
  const cleanUid = firebaseUid.trim();
  const userDocRef = doc(db, "users", cleanUid);
  await deleteDoc(userDocRef);

  if (schoolId) {
    try {
      const schoolDocRef = doc(db, "schools", schoolId.trim().toUpperCase());
      await updateDoc(schoolDocRef, {
        usersCount: increment(-1)
      });
    } catch (e) {
      console.warn("Could not decrement user count:", e);
    }
  }
}

/**
 * Trigger Password Reset Email
 */
export async function sendUserPasswordReset(email) {
  if (!email) throw new Error("No email provided");
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

/**
 * ============================================================================
 * 4. ACTIVE SESSIONS & DEVICE LIMIT ENFORCEMENT
 * ============================================================================
 */

/**
 * Get active sessions count for a specific user
 */
export async function getActiveSessionsCountForUser(userUid) {
  try {
    const q = query(sessionsCol, where("userUid", "==", userUid), where("status", "==", "active"));
    const snap = await getDocs(q);
    return snap.size;
  } catch (err) {
    console.warn("Error fetching user active sessions count:", err);
    return 0;
  }
}

/**
 * Create a new Active Session Record on successful login
 */
export async function createSessionRecord({ userUid, schoolId, deviceId, deviceName }) {
  const sessionId = `SES_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
  const sessionDocRef = doc(db, "sessions", sessionId);

  const sessionData = {
    sessionId,
    userUid,
    schoolId,
    deviceId: deviceId || `DEV_${Math.floor(1000 + Math.random() * 9000)}`,
    deviceName: deviceName || (navigator.userAgent.includes("Mobile") ? "Mobile Device" : "Desktop Browser"),
    loginTime: serverTimestamp(),
    lastActive: serverTimestamp(),
    logoutTime: null,
    status: "active"
  };

  await setDoc(sessionDocRef, sessionData);
  return sessionData;
}

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
  } catch (err) {
    console.warn("Terminate session error:", err);
  }
}

/**
 * ============================================================================
 * 5. STUDENT DATA & EXCEL IMPORT OPERATIONS (Per School)
 * ============================================================================
 */

/**
 * Batch import validated student records for a specific school
 */
export async function importStudentsBatch(schoolId, studentsList) {
  const cleanSchoolId = schoolId.trim().toUpperCase();
  if (!cleanSchoolId || !Array.isArray(studentsList) || studentsList.length === 0) {
    throw new Error("Invalid student data payload.");
  }

  let importedCount = 0;

  for (const student of studentsList) {
    const studentDocRef = doc(studentsCol);
    await setDoc(studentDocRef, {
      schoolId: cleanSchoolId,
      studentName: student.studentName || student.name || "Student",
      className: student.className || student.class || "",
      rollNo: student.rollNo ? String(student.rollNo) : "",
      fatherName: student.fatherName || "",
      createdAt: serverTimestamp()
    });
    importedCount++;
  }

  // Update school's studentsCount
  try {
    const schoolDocRef = doc(db, "schools", cleanSchoolId);
    await updateDoc(schoolDocRef, {
      studentsCount: increment(importedCount),
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.warn("Could not update school student count:", err);
  }

  return importedCount;
}
