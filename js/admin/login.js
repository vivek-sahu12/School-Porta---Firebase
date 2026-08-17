import { auth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "../firebase.js";

// Super Admin UID access-control constant (Admin Panel ONLY)
const SUPER_ADMIN_UID = "FSe6FQsJrKaDVqqjcO4jv2EIkfp2";

// DOM Elements
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("toggle-password");
const eyeIconShow = document.getElementById("eye-icon-show");
const eyeIconHide = document.getElementById("eye-icon-hide");
const loginBtn = document.getElementById("login-btn");
const authError = document.getElementById("auth-error");
const authErrorText = document.getElementById("auth-error-text");

/**
 * Maps Firebase Auth error codes to user-friendly messages
 */
function getFriendlyErrorMessage(errorCode) {
  switch (errorCode) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Invalid email or password.";
    case "auth/user-disabled":
      return "This Super Admin account has been suspended.";
    case "auth/too-many-requests":
      return "Access temporarily locked due to many failed attempts. Please try again later.";
    case "auth/network-request-failed":
      return "Network connection error. Please check your internet connection.";
    default:
      return "An unexpected error occurred during sign in. Please try again.";
  }
}

function showError(message) {
  if (authErrorText && authError) {
    authErrorText.textContent = message;
    authError.classList.add("visible");
  }
}

function clearError() {
  if (authErrorText && authError) {
    authErrorText.textContent = "";
    authError.classList.remove("visible");
  }
}

function setLoading(isLoading) {
  if (!loginBtn) return;
  if (isLoading) {
    loginBtn.classList.add("is-loading");
    loginBtn.disabled = true;
    if (emailInput) emailInput.disabled = true;
    if (passwordInput) passwordInput.disabled = true;
    if (togglePasswordBtn) togglePasswordBtn.disabled = true;
  } else {
    loginBtn.classList.remove("is-loading");
    loginBtn.disabled = false;
    if (emailInput) emailInput.disabled = false;
    if (passwordInput) passwordInput.disabled = false;
    if (togglePasswordBtn) togglePasswordBtn.disabled = false;
  }
}

// 1. Listen for existing authenticated session (Single Listener)
onAuthStateChanged(auth, (user) => {
  if (user && user.uid === SUPER_ADMIN_UID) {
    // Already authenticated as Super Admin -> redirect immediately to Dashboard
    window.location.replace("./dashboard.html");
  }
});

// 2. Toggle password visibility
if (togglePasswordBtn && passwordInput) {
  togglePasswordBtn.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    
    if (isPassword) {
      if (eyeIconShow) eyeIconShow.style.display = "none";
      if (eyeIconHide) eyeIconHide.style.display = "block";
      togglePasswordBtn.setAttribute("aria-label", "Hide password");
    } else {
      if (eyeIconShow) eyeIconShow.style.display = "block";
      if (eyeIconHide) eyeIconHide.style.display = "none";
      togglePasswordBtn.setAttribute("aria-label", "Show password");
    }
  });
}

// 3. Clear errors on input typing
if (emailInput) emailInput.addEventListener("input", clearError);
if (passwordInput) passwordInput.addEventListener("input", clearError);

// 4. Handle Form Submission
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";

    if (!email) {
      showError("Please enter your Super Admin email.");
      if (emailInput) emailInput.focus();
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showError("Please enter a valid email address.");
      if (emailInput) emailInput.focus();
      return;
    }

    if (!password) {
      showError("Please enter your password.");
      if (passwordInput) passwordInput.focus();
      return;
    }

    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (user) {
        if (user.uid === SUPER_ADMIN_UID) {
          // Authorized Super Admin
          window.location.replace("./dashboard.html");
        } else {
          // Deny access if authenticated UID does not match Super Admin UID
          await signOut(auth);
          showError("Access Denied: This account is not authorized to access the Super Admin Panel.");
          setLoading(false);
        }
      }
    } catch (error) {
      console.error("Super Admin Authentication Error:", error.code, error.message);
      const friendlyMessage = getFriendlyErrorMessage(error.code);
      showError(friendlyMessage);
      setLoading(false);
    }
  });
}
