import { auth, signInWithEmailAndPassword, onAuthStateChanged } from "../firebase.js";

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
 * @param {string} errorCode 
 * @returns {string} Friendly error message
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

/**
 * Display error banner
 * @param {string} message 
 */
function showError(message) {
  authErrorText.textContent = message;
  authError.classList.add("visible");
}

/**
 * Hide error banner
 */
function clearError() {
  authErrorText.textContent = "";
  authError.classList.remove("visible");
}

/**
 * Set form loading state
 * @param {boolean} isLoading 
 */
function setLoading(isLoading) {
  if (isLoading) {
    loginBtn.classList.add("is-loading");
    loginBtn.disabled = true;
    emailInput.disabled = true;
    passwordInput.disabled = true;
    togglePasswordBtn.disabled = true;
  } else {
    loginBtn.classList.remove("is-loading");
    loginBtn.disabled = false;
    emailInput.disabled = false;
    passwordInput.disabled = false;
    togglePasswordBtn.disabled = false;
  }
}

// 1. Listen for existing authenticated session (redirect to admin/dashboard.html)
onAuthStateChanged(auth, (user) => {
  if (user) {
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
      togglePasswordBtn.setAttribute("title", "Hide password");
    } else {
      if (eyeIconShow) eyeIconShow.style.display = "block";
      if (eyeIconHide) eyeIconHide.style.display = "none";
      togglePasswordBtn.setAttribute("aria-label", "Show password");
      togglePasswordBtn.setAttribute("title", "Show password");
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

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    // Basic client-side validation
    if (!email) {
      showError("Please enter your Super Admin email.");
      emailInput.focus();
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showError("Please enter a valid email address.");
      emailInput.focus();
      return;
    }

    if (!password) {
      showError("Please enter your password.");
      passwordInput.focus();
      return;
    }

    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      if (userCredential.user) {
        window.location.replace("./dashboard.html");
      }
    } catch (error) {
      console.error("Super Admin Authentication Error:", error.code, error.message);
      const friendlyMessage = getFriendlyErrorMessage(error.code);
      showError(friendlyMessage);
      setLoading(false);
    }
  });
}
