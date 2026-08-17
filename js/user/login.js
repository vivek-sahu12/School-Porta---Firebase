import {
  auth,
  db,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  setDoc,
  serverTimestamp
} from "../firebase.js";

// DOM Elements
const loginForm = document.getElementById("school-login-form");
const emailInput = document.getElementById("login-id");
const passwordInput = document.getElementById("login-password");
const togglePasswordBtn = document.getElementById("toggle-password");
const eyeIconShow = document.getElementById("eye-icon-show");
const eyeIconHide = document.getElementById("eye-icon-hide");
const loginBtn = document.getElementById("login-submit-btn");
const forgotPasswordBtn = document.getElementById("forgot-password-btn");
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
      return "Invalid login email or password.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact your administrator.";
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
  } else {
    loginBtn.classList.remove("is-loading");
    loginBtn.disabled = false;
    if (emailInput) emailInput.disabled = false;
    if (passwordInput) passwordInput.disabled = false;
  }
}

// 1. Password Visibility Toggle
if (togglePasswordBtn && passwordInput) {
  togglePasswordBtn.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    
    if (isPassword) {
      if (eyeIconShow) eyeIconShow.style.display = "none";
      if (eyeIconHide) eyeIconHide.style.display = "block";
    } else {
      if (eyeIconShow) eyeIconShow.style.display = "block";
      if (eyeIconHide) eyeIconHide.style.display = "none";
    }
  });
}

// 2. Clear errors on typing
if (emailInput) emailInput.addEventListener("input", clearError);
if (passwordInput) passwordInput.addEventListener("input", clearError);

// 3. Forgot Password Handler
if (forgotPasswordBtn) {
  forgotPasswordBtn.addEventListener("click", async () => {
    const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
    if (!email) {
      showError("Please enter your login email to receive password reset instructions.");
      if (emailInput) emailInput.focus();
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      alert(`Password reset email has been sent to ${email}. Please check your inbox.`);
    } catch (err) {
      showError(getFriendlyErrorMessage(err.code));
    }
  });
}

// 4. Handle School Portal Login
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
    const password = passwordInput ? passwordInput.value : "";

    if (!email) {
      showError("Please enter your Login ID / Email.");
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
      // Step A: Authenticate via Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (!user) {
        setLoading(false);
        return;
      }

      // Step B: Verify Associated Account in Firestore (users/{user.uid})
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      const userData = userDocSnap.exists() ? userDocSnap.data() : null;

      if (!userData || !userData.schoolId) {
        await signOut(auth);
        showError("Access Denied: This account is not registered with any School Institution.");
        setLoading(false);
        return;
      }

      // Verify Account Status
      if (userData.status === "Inactive") {
        await signOut(auth);
        showError("Your school account has been deactivated. Access suspended.");
        setLoading(false);
        return;
      }

      // Step C: Verify School Entity Status
      try {
        const schoolDocRef = doc(db, "schools", userData.schoolId);
        const schoolDocSnap = await getDoc(schoolDocRef);
        if (schoolDocSnap.exists() && schoolDocSnap.data().status === "Inactive") {
          await signOut(auth);
          showError("This School Institution is currently inactive. Access suspended.");
          setLoading(false);
          return;
        }
      } catch (schErr) {
        console.warn("School status check skipped:", schErr);
      }

      // Step D: Device Limit Enforcement
      const deviceLimit = userData.deviceLimit || 3;
      try {
        const sessionsCol = collection(db, "sessions");
        const q = query(sessionsCol, where("userUid", "==", user.uid), where("status", "==", "active"));
        const activeSessionsSnap = await getDocs(q);

        if (activeSessionsSnap.size >= deviceLimit) {
          await signOut(auth);
          showError(`Maximum device limit reached (${deviceLimit} devices). Please log out from another device.`);
          setLoading(false);
          return;
        }

        // Register active session
        const sessionId = `SES_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
        const sessionDocRef = doc(db, "sessions", sessionId);
        await setDoc(sessionDocRef, {
          sessionId,
          userUid: user.uid,
          schoolId: userData.schoolId,
          deviceId: `DEV_${Math.floor(1000 + Math.random() * 9000)}`,
          deviceName: navigator.userAgent.includes("Mobile") ? "Mobile Device" : "Desktop Browser",
          loginTime: serverTimestamp(),
          lastActive: serverTimestamp(),
          logoutTime: null,
          status: "active"
        });
      } catch (sesErr) {
        console.warn("Session tracking registration skipped:", sesErr);
      }

      // Redirect to School Dashboard
      window.location.replace("./dashboard.html");
    } catch (error) {
      console.error("School Portal Login Error:", error.code, error.message);
      showError(getFriendlyErrorMessage(error.code));
      setLoading(false);
    }
  });
}
