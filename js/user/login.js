import {
  auth,
  db,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
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

// 1. Session state listener
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Authenticated User UID:", user.uid);
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

// 3. Clear errors on typing
if (emailInput) emailInput.addEventListener("input", clearError);
if (passwordInput) passwordInput.addEventListener("input", clearError);
if (schoolCodeInput) schoolCodeInput.addEventListener("input", clearError);

// 4. Handle Form Submission with Status & Device Limit Enforcement
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const schoolCode = schoolCodeInput ? schoolCodeInput.value.trim().toUpperCase() : "";
    const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
    const password = passwordInput ? passwordInput.value : "";

    if (!schoolCode) {
      showError("Please enter your School ID.");
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
      // Step A: Check if school exists and is Active in Firestore
      try {
        let schoolDocSnap = await getDoc(doc(db, "schools", schoolCode));
        let schoolData = schoolDocSnap.exists() ? schoolDocSnap.data() : null;

        if (schoolData && schoolData.status === "Inactive") {
          showError("This school institution has been deactivated. Access is suspended.");
          setLoading(false);
          return;
        }
      } catch (checkErr) {
        console.warn("School status check skipped:", checkErr);
      }

      // Step B: Authenticate with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (!user) {
        setLoading(false);
        return;
      }

      // Step C: Verify User Record in Firestore
      let userDocSnap = await getDoc(doc(db, "users", user.uid));
      let userData = userDocSnap.exists() ? userDocSnap.data() : null;

      if (userData) {
        // Check User Status
        if (userData.status === "Inactive") {
          await signOut(auth);
          showError("Your user account has been deactivated. Please contact your school administrator.");
          setLoading(false);
          return;
        }

        // Check School ID Association
        if (userData.schoolId && userData.schoolId.toUpperCase() !== schoolCode) {
          await signOut(auth);
          showError(`Access Denied: This account is not registered under School ID: ${schoolCode}.`);
          setLoading(false);
          return;
        }

        // Step D: Device Limit Enforcement
        const deviceLimit = userData.deviceLimit || 3;
        try {
          const sessionsCol = collection(db, "sessions");
          const q = query(sessionsCol, where("userUid", "==", user.uid), where("status", "==", "active"));
          const activeSessionsSnap = await getDocs(q);

          if (activeSessionsSnap.size >= deviceLimit) {
            await signOut(auth);
            showError(`Maximum device limit reached (${deviceLimit} active devices). Please log out from another device.`);
            setLoading(false);
            return;
          }

          // Register new active session
          const sessionId = `SES_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
          const sessionDocRef = doc(db, "sessions", sessionId);
          await setDoc(sessionDocRef, {
            sessionId,
            userUid: user.uid,
            schoolId: userData.schoolId || schoolCode,
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
      }

      alert("School Portal authenticated successfully! Active device session registered.");
      setLoading(false);
    } catch (error) {
      console.error("School Portal Login Error:", error.code, error.message);
      const friendlyMessage = getFriendlyErrorMessage(error.code);
      showError(friendlyMessage);
      setLoading(false);
    }
  });
}
