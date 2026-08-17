import { auth, signOut, onAuthStateChanged } from "../firebase.js";
import { initSuperAdminUI, showToast, closeModal } from "./superadmin-ui.js";

// Super Admin UID access-control constant (Admin Panel ONLY)
const SUPER_ADMIN_UID = "FSe6FQsJrKaDVqqjcO4jv2EIkfp2";

// DOM Elements
const pageLoader = document.getElementById("page-loader");
const adminEmailDisplay = document.getElementById("admin-email-display");
const sidebarUserEmail = document.getElementById("sidebar-user-email");
const userAvatarInitial = document.getElementById("user-avatar-initial");
const sidebarUserAvatar = document.getElementById("sidebar-user-avatar");
const logoutBtn = document.getElementById("logout-btn");

/**
 * 1. Authentication State Protection Guard with Super Admin UID verification
 */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // If not authenticated, redirect to Super Admin login page (admin/index.html)
    window.location.replace("./index.html");
  } else if (user.uid !== SUPER_ADMIN_UID) {
    // Access Denied: Authenticated user is NOT the authorized Super Admin
    console.warn("Unauthorized access attempt to Super Admin Dashboard. UID:", user.uid);
    
    const loaderText = document.querySelector(".page-loader-text");
    if (loaderText) {
      loaderText.innerHTML = '<span style="color: #ef4444; font-weight: 700;">Access Denied:</span> You do not have Super Admin privileges.<br>Redirecting...';
    }
    
    await signOut(auth);
    setTimeout(() => {
      window.location.replace("./index.html");
    }, 1500);
  } else {
    // Authorized Super Admin: Populate user details
    const email = user.email || "Super Admin";
    const initial = email.charAt(0).toUpperCase();

    if (adminEmailDisplay) adminEmailDisplay.textContent = email;
    if (sidebarUserEmail) sidebarUserEmail.textContent = email;
    if (userAvatarInitial) userAvatarInitial.textContent = initial;
    if (sidebarUserAvatar) sidebarUserAvatar.textContent = initial;

    // Initialize Super Admin Views & Event Handlers
    initSuperAdminUI();

    // Hide loader and reveal dashboard
    if (pageLoader) {
      pageLoader.classList.add("hidden");
    }
  }
});

// Failsafe: Hide loader after timeout if auth takes unusually long (only for verified super admin)
setTimeout(() => {
  if (pageLoader && !pageLoader.classList.contains("hidden")) {
    if (auth.currentUser && auth.currentUser.uid === SUPER_ADMIN_UID) {
      pageLoader.classList.add("hidden");
      initSuperAdminUI();
    }
  }
}, 3000);

/**
 * 2. Logout Handler
 */
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      if (pageLoader) {
        pageLoader.classList.remove("hidden");
      }
      await signOut(auth);
      // Redirect to Super Admin login page
      window.location.replace("./index.html");
    } catch (error) {
      console.error("Logout Error:", error);
      if (pageLoader) {
        pageLoader.classList.add("hidden");
      }
      showToast("An error occurred while logging out. Please try again.", "error");
    }
  });
}

/**
 * Global helpers for modals
 */
window.confirmPasswordReset = () => {
  closeModal("modal-password-reset");
  showToast("Password reset instructions email has been sent.", "success");
};
