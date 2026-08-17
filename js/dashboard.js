import { auth, signOut, onAuthStateChanged } from "./firebase.js";

// DOM Elements
const pageLoader = document.getElementById("page-loader");
const adminEmailDisplay = document.getElementById("admin-email-display");
const userAvatarInitial = document.getElementById("user-avatar-initial");
const logoutBtn = document.getElementById("logout-btn");
const mobileToggleBtn = document.getElementById("mobile-toggle-btn");
const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");

/**
 * 1. Authentication State Protection Guard
 */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    // If not authenticated, immediately redirect to login page
    window.location.replace("../index.html");
  } else {
    // Authenticated: Populate user email and avatar initial
    const email = user.email || "Admin";
    if (adminEmailDisplay) {
      adminEmailDisplay.textContent = email;
    }
    if (userAvatarInitial) {
      userAvatarInitial.textContent = email.charAt(0).toUpperCase();
    }

    // Hide loader and reveal dashboard
    if (pageLoader) {
      pageLoader.classList.add("hidden");
    }
  }
});

/**
 * 2. Logout Handler
 */
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      // Show loader while signing out
      if (pageLoader) {
        pageLoader.classList.remove("hidden");
      }
      await signOut(auth);
      // Redirect to login page
      window.location.replace("../index.html");
    } catch (error) {
      console.error("Logout Error:", error);
      if (pageLoader) {
        pageLoader.classList.add("hidden");
      }
      alert("An error occurred while logging out. Please try again.");
    }
  });
}

/**
 * 3. Responsive Mobile Sidebar Toggle
 */
if (mobileToggleBtn && sidebar && sidebarBackdrop) {
  const toggleMobileNav = () => {
    sidebar.classList.toggle("open");
    sidebarBackdrop.classList.toggle("open");
  };

  mobileToggleBtn.addEventListener("click", toggleMobileNav);
  sidebarBackdrop.addEventListener("click", toggleMobileNav);
}
