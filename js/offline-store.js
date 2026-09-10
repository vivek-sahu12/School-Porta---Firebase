/**
 * IndexedDB Offline Storage & Sync Queue Engine for School Data Portal
 * Manages local persistent cache and offline pending operation queue.
 */

const DB_NAME = "SchoolPortalOfflineDB";
const DB_VERSION = 2;

let dbPromise = null;

/**
 * Open or upgrade the IndexedDB database
 */
export function openOfflineDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Store for caching Firestore documents
      if (!db.objectStoreNames.contains("cache")) {
        const cacheStore = db.createObjectStore("cache", { keyPath: "key" });
        cacheStore.createIndex("collection", "collection", { unique: false });
        cacheStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      // 2. Store for persistent pending operations queue
      if (!db.objectStoreNames.contains("pendingQueue")) {
        const queueStore = db.createObjectStore("pendingQueue", { keyPath: "id", autoIncrement: true });
        queueStore.createIndex("collection", "collection", { unique: false });
        queueStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // 3. Dedicated store for persistent school logo base64 image data
      if (!db.objectStoreNames.contains("logos")) {
        db.createObjectStore("logos", { keyPath: "schoolId" });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error("IndexedDB open error:", event.target.error);
      reject(event.target.error);
    };
  });

  return dbPromise;
}

/**
 * Save a document to the local IndexedDB cache
 */
export async function saveDocToCache(collectionName, docId, data) {
  try {
    const db = await openOfflineDB();
    if (!db) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction("cache", "readwrite");
      const store = tx.objectStore("cache");
      const key = `${collectionName}_${docId}`;

      // Convert any Firestore timestamps or dates to serializable format
      const serializableData = JSON.parse(JSON.stringify(data, (key, value) => {
        if (value && typeof value === "object" && typeof value.toDate === "function") {
          return { _seconds: Math.floor(value.toDate().getTime() / 1000) };
        }
        return value;
      }));

      const record = {
        key,
        collection: collectionName,
        docId,
        data: serializableData,
        updatedAt: Date.now()
      };

      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`Failed to cache ${collectionName}/${docId}:`, err);
  }
}

/**
 * Get a single document from local cache
 */
export async function getDocFromCache(collectionName, docId) {
  try {
    const db = await openOfflineDB();
    if (!db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction("cache", "readonly");
      const store = tx.objectStore("cache");
      const key = `${collectionName}_${docId}`;
      const req = store.get(key);

      req.onsuccess = () => {
        if (req.result && req.result.data) {
          resolve(req.result.data);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn(`Error reading ${collectionName}/${docId} from cache:`, err);
    return null;
  }
}

/**
 * Get all cached documents for a collection
 */
export async function getCollectionFromCache(collectionName) {
  try {
    const db = await openOfflineDB();
    if (!db) return [];

    return new Promise((resolve) => {
      const tx = db.transaction("cache", "readonly");
      const store = tx.objectStore("cache");
      const index = store.index("collection");
      const req = index.getAll(collectionName);

      req.onsuccess = () => {
        const results = (req.result || []).map((item) => item.data);
        resolve(results);
      };
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn(`Error reading collection ${collectionName} from cache:`, err);
    return [];
  }
}

/**
 * Save multiple documents to cache
 */
export async function saveCollectionToCache(collectionName, docsArray, idField = "id") {
  try {
    const db = await openOfflineDB();
    if (!db || !Array.isArray(docsArray)) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction("cache", "readwrite");
      const store = tx.objectStore("cache");

      docsArray.forEach((docItem) => {
        const docId = docItem[idField] || docItem.schoolId || docItem.firebaseUid || docItem.sessionId || docItem.uid;
        if (!docId) return;

        const key = `${collectionName}_${docId}`;
        const serializableData = JSON.parse(JSON.stringify(docItem, (k, v) => {
          if (v && typeof v === "object" && typeof v.toDate === "function") {
            return { _seconds: Math.floor(v.toDate().getTime() / 1000) };
          }
          return v;
        }));

        store.put({
          key,
          collection: collectionName,
          docId,
          data: serializableData,
          updatedAt: Date.now()
        });
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`Error caching collection ${collectionName}:`, err);
  }
}

/**
 * Enqueue a pending operation into the reliable offline queue
 * @param {Object} op - { collection, docId, action: 'set'|'update'|'delete', payload: Object, schoolId: string }
 */
export async function enqueuePendingOp({ collection, docId, action = "set", payload = {}, schoolId = "" }) {
  try {
    const opId = `OP_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const db = await openOfflineDB();
    if (!db) {
      // Fallback to localStorage if IndexedDB is unavailable
      const fallbackQueue = JSON.parse(localStorage.getItem("fallback_pending_queue") || "[]");
      fallbackQueue.push({
        id: opId,
        collection,
        docId,
        action,
        payload,
        schoolId,
        createdAt: Date.now(),
        attempts: 0
      });
      localStorage.setItem("fallback_pending_queue", JSON.stringify(fallbackQueue));
      return opId;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction("pendingQueue", "readwrite");
      const store = tx.objectStore("pendingQueue");

      const req = store.add({
        opId,
        collection,
        docId,
        action,
        payload,
        schoolId,
        createdAt: Date.now(),
        attempts: 0
      });

      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("Failed to enqueue pending operation:", err);
  }
}

/**
 * Get all pending operations in FIFO order
 */
export async function getPendingOps() {
  try {
    const db = await openOfflineDB();
    if (!db) {
      return JSON.parse(localStorage.getItem("fallback_pending_queue") || "[]");
    }

    return new Promise((resolve) => {
      const tx = db.transaction("pendingQueue", "readonly");
      const store = tx.objectStore("pendingQueue");
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn("Failed to get pending operations:", err);
    return [];
  }
}

/**
 * Get total pending operations count
 */
export async function getPendingOpsCount() {
  try {
    const ops = await getPendingOps();
    return ops.length;
  } catch (e) {
    return 0;
  }
}

/**
 * Remove a specific processed operation from the queue
 */
export async function removePendingOp(opId) {
  try {
    const db = await openOfflineDB();
    if (!db) {
      const fallbackQueue = JSON.parse(localStorage.getItem("fallback_pending_queue") || "[]");
      const filtered = fallbackQueue.filter((item) => (item.id !== opId && item.opId !== opId));
      localStorage.setItem("fallback_pending_queue", JSON.stringify(filtered));
      return;
    }

    return new Promise((resolve) => {
      const tx = db.transaction("pendingQueue", "readwrite");
      const store = tx.objectStore("pendingQueue");
      const req = store.delete(opId);

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn(`Failed to remove pending op ${opId}:`, err);
  }
}

/**
 * Save school logo representation (Base64 dataUrl) to dedicated IndexedDB store
 */
export async function saveLogoToCache(schoolId, logoData) {
  if (!schoolId || !logoData) return false;
  try {
    const db = await openOfflineDB();
    if (!db) {
      try {
        localStorage.setItem(`school_logo_${schoolId}`, JSON.stringify(logoData));
        return true;
      } catch (e) {
        return false;
      }
    }

    return new Promise((resolve) => {
      const tx = db.transaction("logos", "readwrite");
      const store = tx.objectStore("logos");
      const record = {
        schoolId: String(schoolId).trim().toUpperCase(),
        ...logoData,
        savedAt: Date.now()
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn("Error caching logo:", err);
    return false;
  }
}

/**
 * Get cached school logo data from dedicated IndexedDB store
 */
export async function getLogoFromCache(schoolId) {
  if (!schoolId) return null;
  const cleanId = String(schoolId).trim().toUpperCase();
  try {
    const db = await openOfflineDB();
    if (!db) {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(`school_logo_${cleanId}`) : null;
      return raw ? JSON.parse(raw) : null;
    }

    return new Promise((resolve) => {
      const tx = db.transaction("logos", "readonly");
      const store = tx.objectStore("logos");
      const req = store.get(cleanId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn("Error reading cached logo:", err);
    return null;
  }
}

/**
 * Save dataset sync metadata (timestamps & hashes) for lightweight freshness checks
 */
export async function saveSyncMeta(schoolId, meta) {
  if (!schoolId) return;
  const cleanId = String(schoolId).trim().toUpperCase();
  return saveDocToCache("sync_meta", cleanId, {
    schoolId: cleanId,
    ...meta,
    updatedAt: Date.now()
  });
}

/**
 * Get dataset sync metadata for a school
 */
export async function getSyncMeta(schoolId) {
  if (!schoolId) return null;
  const cleanId = String(schoolId).trim().toUpperCase();
  return getDocFromCache("sync_meta", cleanId);
}

/**
 * Clear school-specific cached dataset to preserve school isolation
 */
export async function clearSchoolCache(schoolId) {
  if (!schoolId) return;
  const cleanId = String(schoolId).trim().toUpperCase();
  try {
    const db = await openOfflineDB();
    if (!db) return;

    const tx = db.transaction("cache", "readwrite");
    const store = tx.objectStore("cache");
    const keys = [
      `students_sd_${cleanId}`,
      `students_ud_${cleanId}`,
      `students_p3_${cleanId}`,
      `schools_${cleanId}`,
      `sync_meta_${cleanId}`
    ];

    keys.forEach((k) => store.delete(k));
  } catch (err) {
    console.warn("Error clearing school cache:", err);
  }
}

/**
 * Clear local cached database upon explicit user logout
 */
export async function clearOfflineCache() {
  try {
    const db = await openOfflineDB();
    if (!db) return;

    const tx = db.transaction(["cache", "pendingQueue", "logos"], "readwrite");
    tx.objectStore("cache").clear();
    tx.objectStore("pendingQueue").clear();
    tx.objectStore("logos").clear();
    localStorage.removeItem("fallback_pending_queue");
  } catch (err) {
    console.warn("Failed to clear offline cache:", err);
  }
}
