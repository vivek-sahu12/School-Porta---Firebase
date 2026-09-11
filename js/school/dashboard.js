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
  performForcedLogout,
  syncPendingQueueToFirebase
} from "../session-manager.js";

import { 
  initSchoolPortalUI, 
  refreshSchoolPortalDataViews, 
  updateUserAccountData 
} from "./school-ui.js";
import { checkAndSyncDatasets } from "./student-service.js";
import { SUPER_ADMIN_UID } from "../admin/firestore-service.js";

// DOM Elements
const pageLoader = document.getElementById("page-loader");
const schoolLogoutBtn = document.getElementById("school-logout-btn");

// Unsubscribe hooks for real-time listeners
let unsubSessionMonitor = null;
let unsubUserMonitor = null;
let unsubSchoolMonitor = null;
let heartbeatInterval = null;
let hourlySyncInterval = null;
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
    // 1. When reconnecting from offline, verify if Admin force-logged out this session while offline
    if (auth.currentUser) {
      await verifyAuthoritativeSession(auth.currentUser, (reason) => {
        performForcedLogout(reason, "./index.html");
      });
    }

    // 2. Automatically synchronize any offline pending mutations to Firebase
    await syncPendingQueueToFirebase();

    // 3. Lightweight dataset freshness check on reconnect
    const currentSchoolId = localStorage.getItem("current_school_id");
    if (currentSchoolId) {
      try {
        const syncRes = await checkAndSyncDatasets(currentSchoolId);
        if (syncRes.updated) {
          refreshSchoolPortalDataViews();
        }
      } catch (err) {
        console.warn("Reconnect freshness check note:", err);
      }
    }
  }
});

/**
 * 2. Authentication State Guard & Real-Time Session Monitoring for School Portal
 */
/**
 * 2. Authentication State Guard & Cache-First Boot for School Portal
 */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // If not authenticated, redirect to School Portal login (index.html)
    window.location.replace("./index.html");
    return;
  }

  if (user.uid === SUPER_ADMIN_UID) {
    // Super Admin should not be handled by School Dashboard; redirect to Super Admin Panel
    window.location.replace("./admin/dashboard.html");
    return;
  }

  try {
    // =========================================================================
    // STEP 1: INSTANT LOCAL CACHE RESTORATION (Offline-First Boot)
    // =========================================================================
    let userData = await getDocFromCache("users", user.uid);
    let schoolData = userData?.schoolId ? await getDocFromCache("schools", userData.schoolId) : null;

    if (!userData || !userData.schoolId) {
      const storedSchoolId = localStorage.getItem("current_school_id");
      if (storedSchoolId) {
        userData = {
          uid: user.uid,
          schoolId: storedSchoolId,
          email: user.email || "school@portal.com",
          status: "Active"
        };
        if (!schoolData) {
          schoolData = await getDocFromCache("schools", storedSchoolId);
        }
      }
    }

    if (userData?.schoolId) {
      localStorage.setItem("current_school_id", userData.schoolId);
    }

    // Ensure session identifier is persisted
    activeSessionId = localStorage.getItem("current_session_id") || sessionStorage.getItem("current_session_id");
    if (!activeSessionId) {
      activeSessionId = `SES_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem("current_session_id", activeSessionId);
      sessionStorage.setItem("current_session_id", activeSessionId);
    }

    // Check last-known cached status for instant local authorization
    if (userData && (userData.status === "Inactive" || userData.status === "Deleted")) {
      await performForcedLogout("Your account has been deactivated or deleted by the administrator.", "./index.html");
      return;
    }

    if (schoolData && schoolData.status === "Inactive") {
      await performForcedLogout("This school institution has been deactivated. Access suspended.", "./index.html");
      return;
    }

    // =========================================================================
    // STEP 2: IMMEDIATELY INITIALIZE UI FROM CACHE (Zero Network Dependency to Boot!)
    // =========================================================================
    const effectiveUserData = userData || {
      uid: user.uid,
      schoolId: localStorage.getItem("current_school_id") || "SCH",
      email: user.email || "school@portal.com",
      status: "Active"
    };

    await initSchoolPortalUI(user, effectiveUserData, schoolData);

    if (pageLoader) {
      pageLoader.classList.add("hidden");
    }

    // =========================================================================
    // STEP 3: ASYNCHRONOUS BACKGROUND REVALIDATION & SYNC (When Online)
    // Does NOT block the UI boot or throw "Failed to fetch" on startup
    // =========================================================================
    if (navigator.onLine) {
      runBackgroundRevalidation(user, effectiveUserData.schoolId);
    }
  } catch (err) {
    console.error("School Portal Auth Guard Error:", err);
    if (pageLoader) pageLoader.classList.add("hidden");
  }
});

/**
 * Background Asynchronous Verification & Live Monitoring
 * Executes only when online to reconcile authoritative server state without blocking boot
 */
async function runBackgroundRevalidation(user, schoolId) {
  if (!navigator.onLine || !user) return;

  try {
    // 1. Verify User Document
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const freshUserData = userDocSnap.data();
      if (freshUserData.status === "Inactive" || freshUserData.status === "Deleted") {
        console.warn("Background check: User account inactive or deleted. Revoking access.");
        await performForcedLogout("Your account has been deactivated or deleted by the administrator.", "./index.html");
        return;
      }
      await saveDocToCache("users", user.uid, freshUserData);
      updateUserAccountData(freshUserData);
    } else if (!userDocSnap.metadata?.fromCache) {
      console.warn("Background check: User account confirmed deleted in Firestore. Revoking access.");
      await performForcedLogout("Your account has been deleted by an administrator.", "./index.html");
      return;
    }

    // 2. Verify School Entity
    const effectiveSchoolId = schoolId || localStorage.getItem("current_school_id");
    if (effectiveSchoolId) {
      const schoolDocRef = doc(db, "schools", effectiveSchoolId);
      const schoolDocSnap = await getDoc(schoolDocRef);
      if (schoolDocSnap.exists()) {
        const freshSchoolData = schoolDocSnap.data();
        if (freshSchoolData.status === "Inactive") {
          console.warn("Background check: School inactive. Suspending access.");
          await performForcedLogout("This school institution has been deactivated. Access suspended.", "./index.html");
          return;
        }
        await saveDocToCache("schools", effectiveSchoolId, freshSchoolData);
      }
    }

    // 3. Register or Reconcile Session
    if (activeSessionId) {
      const sessionDocRef = doc(db, "sessions", activeSessionId);
      const sessionSnap = await getDoc(sessionDocRef);

      if (sessionSnap.exists()) {
        const sessionData = sessionSnap.data();
        if (sessionData && sessionData.status !== "active") {
          console.warn("Background check: Session revoked by administrator.");
          await performForcedLogout("Your session was ended by the administrator.", "./index.html");
          return;
        }
      } else {
        // Session not yet present in Firestore (e.g. created offline): register cleanly
        try {
          const sessionPayload = {
            sessionId: activeSessionId,
            userUid: user.uid,
            userEmail: user.email || "school@portal.com",
            userName: user.displayName || user.email?.split("@")[0] || "School User",
            schoolId: effectiveSchoolId || "SCH",
            deviceId: `DEV_${Math.floor(1000 + Math.random() * 9000)}`,
            deviceName: getClientDeviceName(),
            status: "active"
          };
          await setDoc(sessionDocRef, {
            ...sessionPayload,
            loginTime: serverTimestamp(),
            lastActive: serverTimestamp(),
            logoutTime: null
          }, { merge: true });
          enforceUserSessionRetention(user.uid, 3).catch(() => {});
        } catch (regErr) {
          console.warn("Session background registration note:", regErr.message);
        }
      }
    }

    // 4. Setup Live Firestore Listeners
    setupBackgroundLiveListeners(user, effectiveSchoolId);

    // 5. Setup Periodic Heartbeat
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
      try {
        if (navigator.onLine && activeSessionId && auth.currentUser) {
          await updateDoc(doc(db, "sessions", activeSessionId), {
            lastActive: serverTimestamp()
          });
        }
      } catch (hbErr) {
        // Skip silent error
      }
    }, 60000);

    // 6. Setup Background Dataset Freshness Checks (~1 hour)
    if (hourlySyncInterval) clearInterval(hourlySyncInterval);
    hourlySyncInterval = setInterval(async () => {
      try {
        if (navigator.onLine && effectiveSchoolId) {
          const syncRes = await checkAndSyncDatasets(effectiveSchoolId);
          if (syncRes.updated) {
            refreshSchoolPortalDataViews();
          }
        }
      } catch (hourlyErr) {
        console.warn("Background hourly freshness check note:", hourlyErr.message);
      }
    }, 60 * 60 * 1000);

    // 7. Sync any pending offline mutations
    await syncPendingQueueToFirebase();
  } catch (bgErr) {
    console.warn("Background revalidation note (non-blocking):", bgErr.message);
  }
}

/**
 * Setup Live Snapshot Listeners when Online
 */
function setupBackgroundLiveListeners(user, schoolId) {
  if (!navigator.onLine || !user) return;

  // Clean up previous listeners
  if (unsubSessionMonitor) { unsubSessionMonitor(); unsubSessionMonitor = null; }
  if (unsubUserMonitor) { unsubUserMonitor(); unsubUserMonitor = null; }
  if (unsubSchoolMonitor) { unsubSchoolMonitor(); unsubSchoolMonitor = null; }

  try {
    // Monitor Active Session
    if (activeSessionId) {
      const activeSessionRef = doc(db, "sessions", activeSessionId);
      unsubSessionMonitor = onSnapshot(activeSessionRef, async (snap) => {
        if (snap.exists()) {
          const sessionData = snap.data();
          if (sessionData && sessionData.status !== "active") {
            console.warn("Live listener: Session status is", sessionData.status);
            await performForcedLogout("Your session was ended by the administrator.", "./index.html");
          }
        }
        // Note: If !snap.exists(), do NOT log out; session might be pending registration
      }, (err) => {
        console.warn("Session snapshot listener note:", err.message);
      });
    }

    // Monitor User Account Deactivation / Permissions
    const userDocRef = doc(db, "users", user.uid);
    unsubUserMonitor = onSnapshot(userDocRef, async (snap) => {
      if (snap.exists()) {
        const freshUserData = snap.data();
        if (freshUserData && (freshUserData.status === "Inactive" || freshUserData.status === "Deleted")) {
          console.warn("Live listener: User deactivated or deleted.");
          await performForcedLogout("Your account has been deactivated or deleted by the administrator.", "./index.html");
          return;
        }
        await saveDocToCache("users", user.uid, freshUserData);
        updateUserAccountData(freshUserData);
      } else if (navigator.onLine && !snap.metadata?.fromCache) {
        console.warn("Live listener: User account record deleted by administrator.");
        await performForcedLogout("Your account has been deleted by an administrator.", "./index.html");
      }
    }, (err) => {
      console.warn("User snapshot listener note:", err.message);
    });

    // Monitor School Deactivation
    if (schoolId) {
      const schoolDocRef = doc(db, "schools", schoolId);
      unsubSchoolMonitor = onSnapshot(schoolDocRef, async (snap) => {
        if (snap.exists() && snap.data().status === "Inactive") {
          console.warn("Live listener: School institution deactivated.");
          await performForcedLogout("This school institution has been deactivated.", "./index.html");
        }
      }, (err) => {
        console.warn("School snapshot listener note:", err.message);
      });
    }
  } catch (listenerErr) {
    console.warn("Live listeners initialization note:", listenerErr.message);
  }
}

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
    if (hourlySyncInterval) clearInterval(hourlySyncInterval);
    localStorage.removeItem("current_school_id");

    await performExplicitLogout("./index.html");
  });
}
