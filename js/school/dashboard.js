import { auth, db, signOut, onAuthStateChanged, doc, getDoc } from "../firebase.js";
import { initSchoolPortalUI } from "./school-ui.js";

// DOM Elements
const pageLoader = document.getElementById("page-loader");
const schoolLogoutBtn = document.getElementById("school-logout-btn");

/**
 * 1. Authentication State Guard for School Portal
 */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // If not authenticated, redirect to School Portal login (index.html)
    window.location.replace("./index.html");
    return;
  }

  try {
    // Fetch user account record to verify School ID
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);
    const userData = userDocSnap.exists() ? userDocSnap.data() : null;

    if (!userData || !userData.schoolId) {
      console.warn("Unauthorized access to School Portal. No associated schoolId found for UID:", user.uid);
      await signOut(auth);
      window.location.replace("./index.html");
      return;
    }

    // Verify School Status
    const schoolDocRef = doc(db, "schools", userData.schoolId);
    const schoolDocSnap = await getDoc(schoolDocRef);
    const schoolData = schoolDocSnap.exists() ? schoolDocSnap.data() : null;

    if (schoolData && schoolData.status === "Inactive") {
      alert("This school institution has been deactivated. Access suspended.");
      await signOut(auth);
      window.location.replace("./index.html");
      return;
    }

    // Initialize School Portal UI with current school context
    await initSchoolPortalUI(user, userData, schoolData);

    if (pageLoader) {
      pageLoader.classList.add("hidden");
    }
  } catch (err) {
    console.error("School Portal Auth Guard Error:", err);
    if (pageLoader) pageLoader.classList.add("hidden");
  }
});

// Failsafe loader hide
setTimeout(() => {
  if (pageLoader && !pageLoader.classList.contains("hidden") && auth.currentUser) {
    pageLoader.classList.add("hidden");
  }
}, 4000);

// Logout Handler
if (schoolLogoutBtn) {
  schoolLogoutBtn.addEventListener("click", async () => {
    try {
      if (pageLoader) pageLoader.classList.remove("hidden");
      await signOut(auth);
      window.location.replace("./index.html");
    } catch (error) {
      console.error("Logout Error:", error);
      if (pageLoader) pageLoader.classList.add("hidden");
    }
  });
}
