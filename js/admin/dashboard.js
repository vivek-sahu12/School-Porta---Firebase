import { auth, signOut, onAuthStateChanged } from "../firebase.js";
import { initSuperAdminUI, showToast, closeModal } from "./superadmin-ui.js";

// Super Admin UID access-control constant (Admin Panel ONLY)
const SUPER_ADMIN_UID = "FSe6FQsJrKaDVqqjcO4jv2EIkfp2";

// State Flag to prevent duplicate initializations or listener duplication
let isSuperAdminInitialized = false;

// DOM Elements
const pageLoader = document.getElementById("page-loader");
const adminEmailDisplay = document.getElementById("admin-email-display");
const sidebarUserEmail = document.getElementById("sidebar-user-email");
const userAvatarInitial = document.getElementById("user-avatar-initial");
const sidebarUserAvatar = document.getElementById("sidebar-user-avatar");
const logoutBtn = document.getElementById("logout-btn");

/**
 * 1. Single Authentication State Listener with Super Admin UID Guard
 */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // If no authenticated session exists, redirect cleanly to Super Admin login
    window.location.replace("./index.html");
    return;
  }

  if (user.uid !== SUPER_ADMIN_UID) {
    // Authenticated user is NOT the authorized Super Admin
    console.warn("Unauthorized access attempt to Super Admin Dashboard. UID:", user.uid);

    const loaderText = document.querySelector(".page-loader-text");
    if (loaderText) {
      loaderText.innerHTML = '<span style="color: #ef4444; font-weight: 700;">Access Denied:</span> This account does not have Super Admin clearance.<br>Redirecting...';
    }

    try {
      await signOut(auth);
    } catch (e) {}

    setTimeout(() => {
      window.location.replace("./index.html");
    }, 1200);
    return;
  }

  // Authorized Super Admin:
  const email = user.email || "admin@portal.com";
  const initial = email.charAt(0).toUpperCase() || "SA";

  if (adminEmailDisplay) adminEmailDisplay.textContent = email;
  if (sidebarUserEmail) sidebarUserEmail.textContent = email;
  if (userAvatarInitial) userAvatarInitial.textContent = initial;
  if (sidebarUserAvatar) sidebarUserAvatar.textContent = initial;

  // Initialize UI once per page load
  if (!isSuperAdminInitialized) {
    isSuperAdminInitialized = true;
    initSuperAdminUI();
  }

  // Reveal Dashboard
  if (pageLoader) {
    pageLoader.classList.add("hidden");
  }
});

/**
 * 2. Explicit Manual Logout Handler
 */
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      if (pageLoader) {
        pageLoader.classList.remove("hidden");
      }
      await signOut(auth);
      window.location.replace("./index.html");
    } catch (error) {
      console.error("Logout Error:", error);
      if (pageLoader) {
        pageLoader.classList.add("hidden");
      }
      showToast("An error occurred while signing out. Please try again.", "error");
    }
  });
}

/**
 * 3. Global helpers for modals
 */
window.confirmPasswordReset = () => {
  closeModal("modal-password-reset");
  showToast("Password reset instructions email has been sent.", "success");
};
