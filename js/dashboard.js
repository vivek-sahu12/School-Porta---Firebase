import { auth, signOut, onAuthStateChanged } from "./firebase.js";
import { initSuperAdminUI, showToast, closeModal } from "./superadmin-ui.js";

// DOM Elements
const pageLoader = document.getElementById("page-loader");
const adminEmailDisplay = document.getElementById("admin-email-display");
const sidebarUserEmail = document.getElementById("sidebar-user-email");
const userAvatarInitial = document.getElementById("user-avatar-initial");
const sidebarUserAvatar = document.getElementById("sidebar-user-avatar");
const logoutBtn = document.getElementById("logout-btn");

/**
 * 1. Authentication State Protection Guard
 */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    // If not authenticated, redirect to login page
    window.location.replace("../index.html");
  } else {
    // Authenticated: Populate Super Admin user details
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

// Failsafe: Hide loader after timeout if auth takes unusually long
setTimeout(() => {
  if (pageLoader && !pageLoader.classList.contains("hidden")) {
    pageLoader.classList.add("hidden");
    initSuperAdminUI();
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
      window.location.replace("../index.html");
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
