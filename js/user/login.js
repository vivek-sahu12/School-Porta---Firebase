import {
  auth,
  db,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  setDoc,
  serverTimestamp
} from "../firebase.js";

import { enforceUserSessionRetention } from "../session-manager.js";

// DOM Elements
const loginForm = document.getElementById("school-login-form");
const emailInput = document.getElementById("login-id");
const passwordInput = document.getElementById("login-password");
const togglePasswordBtn = document.getElementById("toggle-password");
const eyeIconShow = document.getElementById("eye-icon-show");
const eyeIconHide = document.getElementById("eye-icon-hide");
const loginBtn = document.getElementById("login-submit-btn");
const authError = document.getElementById("auth-error");
const authErrorText = document.getElementById("auth-error-text");

/**
 * Detect client device & browser name cleanly
 */
function getClientDeviceName() {
  const ua = navigator.userAgent;
  let browser = "Browser";
  let os = "Device";

  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";

  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Macintosh") || ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";

  return `${browser} on ${os}`;
}

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

// 0. Check for forced logout / deactivation messages on load
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason");
  const storedReason = sessionStorage.getItem("forced_logout_reason");

  if (storedReason) {
    showError(storedReason);
    sessionStorage.removeItem("forced_logout_reason");
  } else if (reason === "inactivity") {
    showError("Your session expired due to 24 hours of inactivity. Please sign in again.");
  } else if (reason === "force_logout") {
    showError("Your session was ended by the administrator.");
  } else if (reason === "account_inactive") {
    showError("Your account has been deactivated by the administrator.");
  } else if (reason === "school_inactive") {
    showError("This school institution has been deactivated. Access suspended.");
  }
});

// 1. Persistent Authentication State Check
// If user is already authenticated and active, seamlessly forward to dashboard on page reopen
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const params = new URLSearchParams(window.location.search);
    if (params.has("reason")) {
      return; // Do not auto-redirect if user was deliberately redirected to login with a reason
    }

    // Check if 24-hour inactivity timer has expired
    const lastActive = localStorage.getItem("portal_last_activity");
    if (lastActive && (Date.now() - Number(lastActive) >= 24 * 60 * 60 * 1000)) {
      console.warn("Session expired due to 24h inactivity on login check.");
      const currentSessionId = localStorage.getItem("current_session_id");
      if (currentSessionId && navigator.onLine) {
        try {
          await updateDoc(doc(db, "sessions", currentSessionId), {
            status: "expired",
            logoutTime: serverTimestamp()
          });
        } catch (e) {}
      }
      localStorage.removeItem("current_session_id");
      localStorage.removeItem("portal_last_activity");
      await signOut(auth);
      showError("Your session expired due to 24 hours of inactivity. Please sign in again.");
      return;
    }

    // User is persistently authenticated -> navigate to dashboard
    window.location.replace("./dashboard.html");
  }
});

// 2. Password Visibility Toggle
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

// 3. Clear errors on typing
if (emailInput) emailInput.addEventListener("input", clearError);
if (passwordInput) passwordInput.addEventListener("input", clearError);

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

      // Step D: Invalidate any previous session from this exact client/device to prevent stale records
      const previousSessionId = localStorage.getItem("current_session_id");
      if (previousSessionId) {
        try {
          const prevRef = doc(db, "sessions", previousSessionId);
          await updateDoc(prevRef, {
            status: "terminated",
            logoutTime: serverTimestamp()
          });
        } catch (e) {
          console.warn("Previous session termination skipped:", e);
        }
      }

      // Step E: Device Limit Enforcement & Session Creation
      const deviceLimit = userData.deviceLimit || 3;
      const sessionId = `SES_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      const deviceId = `DEV_${Math.floor(1000 + Math.random() * 9000)}`;
      const deviceName = getClientDeviceName();

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

        // Register new active session in Firestore
        const sessionDocRef = doc(db, "sessions", sessionId);
        await setDoc(sessionDocRef, {
          sessionId,
          userUid: user.uid,
          userEmail: user.email || email,
          userName: userData.displayName || userData.name || email.split("@")[0],
          schoolId: userData.schoolId,
          deviceId,
          deviceName,
          loginTime: serverTimestamp(),
          lastActive: serverTimestamp(),
          logoutTime: null,
          status: "active"
        });

        // Store active session identifier and activity in client storage
        sessionStorage.setItem("current_session_id", sessionId);
        localStorage.setItem("current_session_id", sessionId);
        localStorage.setItem("portal_last_activity", String(Date.now()));

        // Enforce per-user last 3 session history retention (physically deletes 4th+ sessions from Firestore)
        try {
          await enforceUserSessionRetention(user.uid, 3);
        } catch (retErr) {
          console.warn("Session retention cleanup warning:", retErr);
        }
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
