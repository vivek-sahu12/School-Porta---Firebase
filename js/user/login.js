import { auth, signInWithEmailAndPassword, onAuthStateChanged } from "../firebase.js";

// DOM Elements
const loginForm = document.getElementById("user-login-form");
const schoolCodeInput = document.getElementById("school-code");
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
      return "Invalid email or password for this school.";
    case "auth/user-disabled":
      return "This account has been disabled by your School Administrator.";
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
  if (authErrorText && authError) {
    authErrorText.textContent = message;
    authError.classList.add("visible");
  }
}

/**
 * Hide error banner
 */
function clearError() {
  if (authErrorText && authError) {
    authErrorText.textContent = "";
    authError.classList.remove("visible");
  }
}

/**
 * Set form loading state
 * @param {boolean} isLoading 
 */
function setLoading(isLoading) {
  if (!loginBtn) return;
  if (isLoading) {
    loginBtn.classList.add("is-loading");
    loginBtn.disabled = true;
    if (schoolCodeInput) schoolCodeInput.disabled = true;
    if (emailInput) emailInput.disabled = true;
    if (passwordInput) passwordInput.disabled = true;
    if (togglePasswordBtn) togglePasswordBtn.disabled = true;
  } else {
    loginBtn.classList.remove("is-loading");
    loginBtn.disabled = false;
    if (schoolCodeInput) schoolCodeInput.disabled = false;
    if (emailInput) emailInput.disabled = false;
    if (passwordInput) passwordInput.disabled = false;
    if (togglePasswordBtn) togglePasswordBtn.disabled = false;
  }
}

// 1. Check existing authentication session
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Session is active
    console.log("Authenticated User Session:", user.email);
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
if (schoolCodeInput) schoolCodeInput.addEventListener("input", clearError);

// 4. Handle Form Submission
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const schoolCode = schoolCodeInput ? schoolCodeInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";

    if (schoolCodeInput && !schoolCode) {
      showError("Please enter your School Code or ID.");
      schoolCodeInput.focus();
      return;
    }

    if (!email) {
      showError("Please enter your registered email.");
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
        // School portal user authenticated
        alert("School Portal authenticated successfully! School modules will be unlocked in the next development phase.");
        setLoading(false);
      }
    } catch (error) {
      console.error("School Portal Login Error:", error.code, error.message);
      const friendlyMessage = getFriendlyErrorMessage(error.code);
      showError(friendlyMessage);
      setLoading(false);
    }
  });
}
