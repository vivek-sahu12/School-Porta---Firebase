import {
  auth,
  db,
  signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from "../firebase.js";

import {
  saveDocToCache,
  getDocFromCache,
  enqueuePendingOp
} from "../offline-store.js";

import {
  initInactivityTracker,
  stopInactivityTracker,
  initNetworkMonitor,
  verifyAuthoritativeSession,
  enforceUserSessionRetention,
  performExplicitLogout,
  performForcedLogout
} from "../session-manager.js";

import { initSchoolPortalUI } from "./school-ui.js";

// DOM Elements
const pageLoader = document.getElementById("page-loader");
const schoolLogoutBtn = document.getElementById("school-logout-btn");

// Unsubscribe hooks for real-time listeners
let unsubSessionMonitor = null;
let unsubUserMonitor = null;
let unsubSchoolMonitor = null;
let heartbeatInterval = null;
let activeSessionId = null;

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
 * 1. Initialize Network Monitor & 24-Hour Inactivity Tracker
 */
initInactivityTracker((reason) => {
  console.warn("Inactivity timeout fired:", reason);
  performForcedLogout(reason, "./index.html");
});

initNetworkMonitor({
  onReconnect: async () => {
    // When reconnecting from offline, verify if Admin force-logged out this session while offline
    if (auth.currentUser) {
      await verifyAuthoritativeSession(auth.currentUser, (reason) => {
        performForcedLogout(reason, "./index.html");
      });
    }
  }
});

/**
 * 2. Authentication State Guard & Real-Time Session Monitoring for School Portal
 */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // If not authenticated, redirect to School Portal login (index.html)
    window.location.replace("./index.html");
    return;
  }

  try {
    // A. Check local cache first for instant offline readiness
    let userData = await getDocFromCache("users", user.uid);
    let schoolData = userData?.schoolId ? await getDocFromCache("schools", userData.schoolId) : null;

    // B. If online, fetch authoritative data and update cache
    if (navigator.onLine) {
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          userData = userDocSnap.data();
          await saveDocToCache("users", user.uid, userData);
        }

        if (userData?.schoolId) {
          const schoolDocRef = doc(db, "schools", userData.schoolId);
          const schoolDocSnap = await getDoc(schoolDocRef);
          if (schoolDocSnap.exists()) {
            schoolData = schoolDocSnap.data();
            await saveDocToCache("schools", userData.schoolId, schoolData);
          }
        }
      } catch (fetchErr) {
        console.warn("Online fetch error, relying on local cache:", fetchErr);
      }
    }

    // C. Verify authorization
    if (!userData || !userData.schoolId) {
      console.warn("Unauthorized access to School Portal. No associated schoolId found for UID:", user.uid);
      await performExplicitLogout("./index.html");
      return;
    }

    if (userData.status === "Inactive") {
      await performForcedLogout("Your account has been deactivated by the administrator.", "./index.html");
      return;
    }

    if (schoolData && schoolData.status === "Inactive") {
      await performForcedLogout("This school institution has been deactivated. Access suspended.", "./index.html");
      return;
    }

    // D. Setup active device session identifier (persisted in localStorage)
    activeSessionId = localStorage.getItem("current_session_id") || sessionStorage.getItem("current_session_id");

    if (!activeSessionId) {
      // Create new session document if opened directly
      activeSessionId = `SES_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem("current_session_id", activeSessionId);
      sessionStorage.setItem("current_session_id", activeSessionId);

      const sessionPayload = {
        sessionId: activeSessionId,
        userUid: user.uid,
        userEmail: user.email || "school@portal.com",
        userName: userData.displayName || userData.name || "School User",
        schoolId: userData.schoolId,
        deviceId: `DEV_${Math.floor(1000 + Math.random() * 9000)}`,
        deviceName: getClientDeviceName(),
        status: "active"
      };

      await saveDocToCache("sessions", activeSessionId, sessionPayload);

      if (navigator.onLine) {
        try {
          const sessionDocRef = doc(db, "sessions", activeSessionId);
          await setDoc(sessionDocRef, {
            ...sessionPayload,
            loginTime: serverTimestamp(),
            lastActive: serverTimestamp(),
            logoutTime: null
          });
          enforceUserSessionRetention(user.uid, 3).catch(() => {});
        } catch (sErr) {
          console.warn("Could not save session to Firestore, enqueuing offline op:", sErr);
          await enqueuePendingOp({
            collection: "sessions",
            docId: activeSessionId,
            action: "set",
            payload: sessionPayload
          });
        }
      } else {
        await enqueuePendingOp({
          collection: "sessions",
          docId: activeSessionId,
          action: "set",
          payload: sessionPayload
        });
      }
    } else {
      // Authoritative check if online
      if (navigator.onLine) {
        const check = await verifyAuthoritativeSession(user, (reason) => {
          performForcedLogout(reason, "./index.html");
        });
        if (!check.valid) return;

        if (check.needsRegistration) {
          try {
            const sessionPayload = {
              sessionId: activeSessionId,
              userUid: user.uid,
              userEmail: user.email || "school@portal.com",
              userName: userData.displayName || userData.name || "School User",
              schoolId: userData.schoolId,
              deviceId: `DEV_${Math.floor(1000 + Math.random() * 9000)}`,
              deviceName: getClientDeviceName(),
              status: "active"
            };
            const sessionDocRef = doc(db, "sessions", activeSessionId);
            await setDoc(sessionDocRef, {
              ...sessionPayload,
              loginTime: serverTimestamp(),
              lastActive: serverTimestamp(),
              logoutTime: null
            }, { merge: true });
            enforceUserSessionRetention(user.uid, 3).catch(() => {});
          } catch (regErr) {
            console.warn("Session re-registration note:", regErr);
          }
        }
      }
    }

    // =========================================================================
    // REAL-TIME SESSION MONITOR (Catches Admin Force Logout IMMEDIATELY when online)
    // =========================================================================
    if (navigator.onLine) {
      try {
        const activeSessionRef = doc(db, "sessions", activeSessionId);
        unsubSessionMonitor = onSnapshot(activeSessionRef, async (snap) => {
          if (snap.exists()) {
            const sessionData = snap.data();
            if (sessionData && sessionData.status !== "active") {
              console.warn("Session status marked as", sessionData.status, "by administrator.");
              await performForcedLogout("Your session was ended by the administrator.", "./index.html");
            }
          }
        }, (err) => {
          console.warn("Session snapshot listener warning:", err);
        });

        // Real-Time Account Deactivation Monitor
        const userDocRef = doc(db, "users", user.uid);
        unsubUserMonitor = onSnapshot(userDocRef, async (snap) => {
          if (snap.exists() && snap.data().status === "Inactive") {
            await performForcedLogout("Your account has been deactivated by the administrator.", "./index.html");
          }
        });

        // Real-Time School Deactivation Monitor
        const schoolDocRef = doc(db, "schools", userData.schoolId);
        unsubSchoolMonitor = onSnapshot(schoolDocRef, async (snap) => {
          if (snap.exists() && snap.data().status === "Inactive") {
            await performForcedLogout("This school institution has been deactivated.", "./index.html");
          }
        });
      } catch (listenerErr) {
        console.warn("Live listeners setup error:", listenerErr);
      }
    }

    // Periodic Heartbeat (Every 60 seconds when online)
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
      try {
        if (navigator.onLine && activeSessionId && auth.currentUser) {
          await updateDoc(doc(db, "sessions", activeSessionId), {
            lastActive: serverTimestamp()
          });
        }
      } catch (hbErr) {
        console.warn("Heartbeat update skipped:", hbErr);
      }
    }, 60000);

    // Initialize School Portal UI with current school context
    await initSchoolPortalUI(user, userData, schoolData);

    if (pageLoader) {
      pageLoader.classList.add("hidden");
    }
  } catch (err) {
    console.error("School Portal Auth Guard Error:", err);
    if (pageLoader) pageLoader.classList.add("hidden");
  }
});

// Failsafe loader hide
setTimeout(() => {
  if (pageLoader && !pageLoader.classList.contains("hidden") && auth.currentUser) {
    pageLoader.classList.add("hidden");
  }
}, 3000);

// Explicit Logout Handler
if (schoolLogoutBtn) {
  schoolLogoutBtn.addEventListener("click", async () => {
    if (pageLoader) pageLoader.classList.remove("hidden");
    if (unsubSessionMonitor) unsubSessionMonitor();
    if (unsubUserMonitor) unsubUserMonitor();
    if (unsubSchoolMonitor) unsubSchoolMonitor();
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    await performExplicitLogout("./index.html");
  });
}
