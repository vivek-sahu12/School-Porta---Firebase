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

// Super Admin UID constant for access control
export const SUPER_ADMIN_UID = "FSe6FQsJrKaDVqqjcO4jv2EIkfp2";

// Collection References
const schoolsCol = collection(db, "schools");
const usersCol = collection(db, "users");
const studentsCol = collection(db, "students");

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
      const schools = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          schoolId: data.schoolId || d.id,
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
 * Subscribe to all Users
 */
export function subscribeToUsers(onData, onError) {
  try {
    const q = query(usersCol, orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          uid: data.uid || d.id,
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
 * 2. SCHOOL ACCOUNT OPERATIONS
 * ============================================================================
 */

/**
 * Register / Configure an Existing School Account
 */
export async function saveSchoolAccount({
  schoolId,
  schoolName,
  logoUrl = "",
  address = "",
  adminEmail = "",
  status = "Active"
}) {
  const cleanSchoolId = schoolId.trim().toUpperCase();
  const cleanSchoolName = schoolName.trim();
  const cleanLogoUrl = logoUrl ? logoUrl.trim() : "";

  const schoolDocRef = doc(db, "schools", cleanSchoolId);
  const existingDoc = await getDoc(schoolDocRef);

  const schoolData = {
    schoolId: cleanSchoolId,
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
 * 3. USER ACCOUNT OPERATIONS (Configuring Existing Firebase Authentication accounts)
 * ============================================================================
 */

/**
 * Configure an Existing Firebase Authentication User Account under a School
 */
export async function saveUserAccount({
  uid,
  schoolId,
  displayName = "",
  email = "",
  status = "Active",
  deviceLimit = 3,
  permissions = {}
}) {
  const cleanUid = uid.trim();
  const cleanSchoolId = schoolId.trim().toUpperCase();
  const cleanEmail = email ? email.trim().toLowerCase() : "";
  const cleanName = displayName ? displayName.trim() : (cleanEmail.split("@")[0] || "User");

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
export async function updateUserPermissions(uid, permissions) {
  const cleanUid = uid.trim();
  const userDocRef = doc(db, "users", cleanUid);
  await updateDoc(userDocRef, {
    permissions,
    updatedAt: serverTimestamp()
  });
}

/**
 * Update Individual User Device Limit
 */
export async function updateUserDeviceLimit(uid, deviceLimit) {
  const cleanUid = uid.trim();
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
export async function toggleUserStatus(uid, currentStatus) {
  const cleanUid = uid.trim();
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
export async function deleteUserAccount(uid, schoolId) {
  const cleanUid = uid.trim();
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
 * 4. STUDENT DATA & EXCEL IMPORT OPERATIONS (Per School)
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
