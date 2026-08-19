/**
 * Session & Inactivity Lifecycle Manager for School Data Portal
 * Manages:
 * 1. 24-Hour genuine user inactivity timer (persists across tab/browser close, does NOT reset on load).
 * 2. Network connectivity detection & topbar status indicator.
 * 3. Automatic synchronization of IndexedDB pending operation queue.
 * 4. Force Logout verification upon reconnection & real-time monitoring.
 * 5. Device-specific session persistence.
 */

import {
  auth,
  db,
  signOut,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from "./firebase.js";

/**
 * Enforce Per-User Session Retention Rule:
 * Strictly retains the newest 3 session records for this specific user.
 * Physically deletes all 4th and older session documents from Cloud Firestore.
 */
export async function enforceUserSessionRetention(userUid, maxToKeep = 3) {
  if (!userUid || !navigator.onLine) return;
  try {
    const cleanUid = userUid.trim();
    const sessionsCol = collection(db, "sessions");
    const q = query(sessionsCol, where("userUid", "==", cleanUid));
    const snap = await getDocs(q);

    if (snap.size <= maxToKeep) return;

    const userSessions = snap.docs.map((d) => {
      const data = d.data();
      let time = 0;
      if (data.loginTime?.toDate) {
        time = data.loginTime.toDate().getTime();
      } else if (data.loginTime?._seconds) {
        time = data.loginTime._seconds * 1000;
      } else if (typeof data.loginTime === "number") {
        time = data.loginTime;
      }
      return { id: d.id, ref: d.ref, time };
    });

    userSessions.sort((a, b) => b.time - a.time);

    const toDelete = userSessions.slice(maxToKeep);
    if (toDelete.length > 0) {
      const deletePromises = toDelete.map((item) => deleteDoc(item.ref));
      await Promise.all(deletePromises);
      console.log(`[Retention] Physically purged ${toDelete.length} older session(s) for user ${cleanUid}.`);
    }
  } catch (err) {
    console.warn("Session retention cleanup warning:", err);
  }
}

import {
  getPendingOps,
  removePendingOp,
  getPendingOpsCount,
  clearOfflineCache
} from "./offline-store.js";

// Constants
export const INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 Hours
const ACTIVITY_THROTTLE_MS = 15000; // Update stored timestamp at most once every 15 seconds of activity
const STORAGE_KEY_LAST_ACTIVITY = "portal_last_activity";
const STORAGE_KEY_SESSION_ID = "current_session_id";
const STORAGE_KEY_LOGOUT_REASON = "forced_logout_reason";

// Internal State
let lastRecordedActivityTime = 0;
let inactivityCheckInterval = null;
let syncInProgress = false;
let onSyncCompletedCallbacks = [];

/**
 * Get the currently stored last activity timestamp
 */
export function getLastActivityTimestamp() {
  const stored = localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY);
  return stored ? Number(stored) : null;
}

/**
 * Record genuine user activity.
 * CRITICAL: This is throttled and only called by actual user events (clicks, typing, navigation, etc.),
 * NOT merely because a browser tab or window opened.
 */
export function recordUserActivity() {
  const now = Date.now();
  if (now - lastRecordedActivityTime < ACTIVITY_THROTTLE_MS) {
    return;
  }
  lastRecordedActivityTime = now;
  localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, String(now));
}

/**
 * Check if the 24-hour inactivity period has elapsed
 */
export function isSessionExpiredDueToInactivity() {
  const lastActive = getLastActivityTimestamp();
  if (!lastActive) return false;
  const elapsed = Date.now() - lastActive;
  return elapsed >= INACTIVITY_TIMEOUT_MS;
}

/**
 * Start monitoring genuine user interactions to track 24-hour activity
 */
export function initInactivityTracker(onTimeout) {
  // 1. If no activity timestamp has ever been set (fresh session start), initialize it
  if (!getLastActivityTimestamp()) {
    localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, String(Date.now()));
  }

  // 2. Check immediately on startup if already expired (e.g. user left computer for >24h and came back)
  if (isSessionExpiredDueToInactivity()) {
    console.warn("Session expired due to 24 hours of inactivity on load.");
    if (onTimeout) onTimeout("Your session expired due to 24 hours of inactivity.");
    return;
  }

  // 3. User interaction event listeners
  const activityEvents = ["mousedown", "keydown", "touchstart", "scroll", "input", "click"];
  const handleActivity = () => {
    recordUserActivity();
  };

  activityEvents.forEach((evt) => {
    window.addEventListener(evt, handleActivity, { passive: true });
  });

  // 4. Periodic background check for 24-hour expiration (checks every 30 seconds)
  if (inactivityCheckInterval) clearInterval(inactivityCheckInterval);
  inactivityCheckInterval = setInterval(() => {
    if (isSessionExpiredDueToInactivity()) {
      console.warn("24-hour inactivity timeout reached.");
      if (onTimeout) {
        onTimeout("Your session expired due to 24 hours of inactivity.");
      }
    }
  }, 30000);
}

/**
 * Stop activity tracker
 */
export function stopInactivityTracker() {
  if (inactivityCheckInterval) {
    clearInterval(inactivityCheckInterval);
    inactivityCheckInterval = null;
  }
}

/**
 * Register a callback when synchronization completes
 */
export function onSyncCompleted(cb) {
  if (typeof cb === "function") {
    onSyncCompletedCallbacks.push(cb);
  }
}

/**
 * Update the Top-bar Network / Sync Status UI indicator
 */
export function updateNetworkStatusUI(status, message = "") {
  let badge = document.getElementById("portal-network-status-badge");

  if (!badge) {
    // Look for top bar right container in dashboard
    const topBarRight = document.querySelector(".top-bar-right");
    if (topBarRight) {
      badge = document.createElement("div");
      badge.id = "portal-network-status-badge";
      badge.className = "network-status-badge";
      topBarRight.insertBefore(badge, topBarRight.firstChild);
    }
  }

  if (!badge) return;

  badge.className = "network-status-badge";

  switch (status) {
    case "online":
      badge.classList.add("status-online");
      badge.innerHTML = `<span class="status-dot"></span><span>Online</span>`;
      badge.title = "Connected to Firebase server";
      break;

    case "offline":
      badge.classList.add("status-offline");
      badge.innerHTML = `<span class="status-dot"></span><span>Offline ${message ? '(' + message + ')' : '(Working from local cache)'}</span>`;
      badge.title = "Offline mode active. All edits are saved locally and will sync automatically when reconnected.";
      break;

    case "syncing":
      badge.classList.add("status-syncing");
      badge.innerHTML = `<span class="sync-spinner"></span><span>Syncing ${message}...</span>`;
      badge.title = "Synchronizing local changes to Firebase...";
      break;

    case "synced":
      badge.classList.add("status-synced");
      badge.innerHTML = `<span class="status-icon">✓</span><span>${message || 'Synced'}</span>`;
      badge.title = "All changes synchronized with server.";
      // Automatically return to subtle online badge after 3 seconds
      setTimeout(() => {
        if (navigator.onLine) {
          updateNetworkStatusUI("online");
        }
      }, 3000);
      break;
  }
}

/**
 * Process all pending offline operations from IndexedDB queue to Firebase
 */
export async function syncPendingQueueToFirebase() {
  if (syncInProgress || !navigator.onLine) return;
  syncInProgress = true;

  try {
    const pendingOps = await getPendingOps();
    if (pendingOps.length === 0) {
      syncInProgress = false;
      return;
    }

    updateNetworkStatusUI("syncing", `${pendingOps.length} item${pendingOps.length > 1 ? 's' : ''}`);

    for (const op of pendingOps) {
      try {
        const docRef = doc(db, op.collection, op.docId);

        // Sanitize payload and restore Firestore serverTimestamp if appropriate
        const cleanPayload = { ...op.payload };
        if (cleanPayload.updatedAt) {
          cleanPayload.updatedAt = serverTimestamp();
        }

        if (op.action === "set") {
          await setDoc(docRef, cleanPayload, { merge: true });
        } else if (op.action === "update") {
          await updateDoc(docRef, cleanPayload);
        } else if (op.action === "delete") {
          await deleteDoc(docRef);
        }

        // Successfully synced, remove from queue
        await removePendingOp(op.id);
      } catch (opErr) {
        console.error(`Failed to sync op ${op.id} (${op.collection}/${op.docId}):`, opErr);
        // If network failed midway, break out of sync loop
        if (!navigator.onLine || opErr.code === "unavailable" || opErr.message?.includes("network")) {
          break;
        }
      }
    }

    const remainingCount = await getPendingOpsCount();
    if (remainingCount === 0) {
      updateNetworkStatusUI("synced", "Changes Synced");
      onSyncCompletedCallbacks.forEach((cb) => {
        try { cb(); } catch (e) {}
      });
    } else {
      updateNetworkStatusUI("offline", `${remainingCount} unsynced`);
    }
  } catch (err) {
    console.error("Sync engine error:", err);
  } finally {
    syncInProgress = false;
  }
}

/**
 * Verify authoritative session state with Firebase on reconnection / initial load
 */
export async function verifyAuthoritativeSession(user, onRevoked) {
  if (!navigator.onLine || !user) return { valid: true };

  const sessionId = localStorage.getItem(STORAGE_KEY_SESSION_ID);
  if (!sessionId) return { valid: true };

  try {
    // 1. Verify User Document
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.status === "Inactive") {
        if (onRevoked) onRevoked("Your account has been deactivated by the administrator.");
        return { valid: false, reason: "account_inactive" };
      }

      // Check School Status
      if (userData.schoolId) {
        const schoolDocRef = doc(db, "schools", userData.schoolId);
        const schoolSnap = await getDoc(schoolDocRef);
        if (schoolSnap.exists() && schoolSnap.data().status === "Inactive") {
          if (onRevoked) onRevoked("This school institution has been deactivated. Access suspended.");
          return { valid: false, reason: "school_inactive" };
        }
      }
    }

    // 2. Verify Session Document
    const sessionDocRef = doc(db, "sessions", sessionId);
    const sessionSnap = await getDoc(sessionDocRef);

    if (!sessionSnap.exists()) {
      // Session document does not exist yet in Firestore (e.g. created offline or refreshed)
      // Allow user to remain logged in and re-register session
      return { valid: true, needsRegistration: true };
    }

    const sessionData = sessionSnap.data();
    if (sessionData && sessionData.status !== "active") {
      console.warn("Authoritative session check: Session status is", sessionData.status);
      if (onRevoked) onRevoked("Your session was ended by the administrator.");
      return { valid: false, reason: "force_logout" };
    }

    return { valid: true, sessionData };
  } catch (err) {
    console.warn("Authoritative session check skipped (offline/network issue):", err);
    return { valid: true }; // Don't block offline operation
  }
}

/**
 * Setup Global Network Connection Listeners
 */
export function initNetworkMonitor({ onReconnect, onDisconnect } = {}) {
  const handleOnline = async () => {
    console.log("App is back ONLINE. Initiating sync and session verification...");
    updateNetworkStatusUI("syncing", "Reconnecting...");

    if (onReconnect) {
      try {
        await onReconnect();
      } catch (e) {
        console.warn("onReconnect handler error:", e);
      }
    }

    await syncPendingQueueToFirebase();
    if (navigator.onLine) {
      updateNetworkStatusUI("online");
    }
  };

  const handleOffline = () => {
    console.log("App is OFFLINE. Utilizing local cache & pending queue.");
    updateNetworkStatusUI("offline");
    if (onDisconnect) onDisconnect();
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Initial state setup
  if (navigator.onLine) {
    updateNetworkStatusUI("online");
    // Attempt to sync any unsynced pending ops from prior sessions
    setTimeout(() => syncPendingQueueToFirebase(), 2000);
  } else {
    updateNetworkStatusUI("offline");
  }

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

/**
 * Perform Clean Explicit User Logout
 */
export async function performExplicitLogout(redirectUrl = "./index.html") {
  try {
    stopInactivityTracker();
    const sessionId = localStorage.getItem(STORAGE_KEY_SESSION_ID);

    if (sessionId && navigator.onLine && auth.currentUser) {
      try {
        await updateDoc(doc(db, "sessions", sessionId), {
          status: "logged_out",
          logoutTime: serverTimestamp()
        });
      } catch (e) {
        console.warn("Could not mark session as logged_out:", e);
      }
    }

    // Clean up local storage session identifiers
    localStorage.removeItem(STORAGE_KEY_SESSION_ID);
    localStorage.removeItem(STORAGE_KEY_LAST_ACTIVITY);
    sessionStorage.removeItem(STORAGE_KEY_SESSION_ID);
    sessionStorage.removeItem(STORAGE_KEY_LOGOUT_REASON);

    await clearOfflineCache();
    await signOut(auth);
  } catch (err) {
    console.error("SignOut error:", err);
  } finally {
    window.location.replace(redirectUrl);
  }
}

/**
 * Perform Forced Logout (e.g. Admin Revocation or Inactivity)
 */
export async function performForcedLogout(reason, redirectUrl = "./index.html") {
  try {
    stopInactivityTracker();
    sessionStorage.setItem(STORAGE_KEY_LOGOUT_REASON, reason || "Your session has ended.");
    localStorage.removeItem(STORAGE_KEY_SESSION_ID);
    localStorage.removeItem(STORAGE_KEY_LAST_ACTIVITY);
    sessionStorage.removeItem(STORAGE_KEY_SESSION_ID);

    await signOut(auth);
  } catch (err) {
    console.warn("Forced logout signOut error:", err);
  } finally {
    const reasonParam = reason?.includes("inactivity") ? "inactivity" : "force_logout";
    window.location.replace(`${redirectUrl}?reason=${reasonParam}`);
  }
}
