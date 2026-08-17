import { auth, signInWithEmailAndPassword, onAuthStateChanged } from "./firebase.js";

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
      return "This account has been disabled. Please contact support.";
    case "auth/too-many-requests":
      return "Access to this account has been temporarily disabled due to many failed attempts. Please try again later.";
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

// 1. Listen for existing authenticated session
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is already logged in, redirect to admin dashboard
    window.location.replace("./admin/dashboard.html");
  }
});

// 2. Toggle password visibility
togglePasswordBtn.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  
  if (isPassword) {
    eyeIconShow.style.display = "none";
    eyeIconHide.style.display = "block";
    togglePasswordBtn.setAttribute("aria-label", "Hide password");
    togglePasswordBtn.setAttribute("title", "Hide password");
  } else {
    eyeIconShow.style.display = "block";
    eyeIconHide.style.display = "none";
    togglePasswordBtn.setAttribute("aria-label", "Show password");
    togglePasswordBtn.setAttribute("title", "Show password");
  }
});

// 3. Clear errors on input typing
emailInput.addEventListener("input", clearError);
passwordInput.addEventListener("input", clearError);

// 4. Handle Form Submission
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  // Basic client-side validation
  if (!email) {
    showError("Please enter your email address.");
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
    // Sign-in successful; onAuthStateChanged will handle redirection or we redirect directly
    if (userCredential.user) {
      window.location.replace("./admin/dashboard.html");
    }
  } catch (error) {
    console.error("Authentication Error:", error.code, error.message);
    const friendlyMessage = getFriendlyErrorMessage(error.code);
    showError(friendlyMessage);
    setLoading(false);
  }
});
