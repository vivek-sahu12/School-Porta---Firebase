/**
 * IndexedDB Offline Storage & Sync Queue Engine for School Data Portal
 * Manages local persistent cache and offline pending operation queue.
 */

const DB_NAME = "SchoolPortalOfflineDB";
const DB_VERSION = 1;

let dbPromise = null;

/**
 * Open or upgrade the IndexedDB database
 */
export function openOfflineDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn("IndexedDB is not supported in this browser. Offline persistence will be degraded.");
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
 * @param {Object} op - { collection, docId, action: 'set'|'update'|'delete', payload: Object }
 */
export async function enqueuePendingOp({ collection, docId, action = "set", payload = {} }) {
  try {
    const db = await openOfflineDB();
    if (!db) {
      // Fallback to localStorage if IndexedDB is unavailable
      const fallbackQueue = JSON.parse(localStorage.getItem("fallback_pending_queue") || "[]");
      fallbackQueue.push({
        id: Date.now() + Math.random(),
        collection,
        docId,
        action,
        payload,
        createdAt: Date.now()
      });
      localStorage.setItem("fallback_pending_queue", JSON.stringify(fallbackQueue));
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction("pendingQueue", "readwrite");
      const store = tx.objectStore("pendingQueue");

      const req = store.add({
        collection,
        docId,
        action,
        payload,
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
      const filtered = fallbackQueue.filter((item) => item.id !== opId);
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
 * Clear local cached database upon explicit user logout
 */
export async function clearOfflineCache() {
  try {
    const db = await openOfflineDB();
    if (!db) return;

    const tx = db.transaction(["cache", "pendingQueue"], "readwrite");
    tx.objectStore("cache").clear();
    tx.objectStore("pendingQueue").clear();
    localStorage.removeItem("fallback_pending_queue");
  } catch (err) {
    console.warn("Failed to clear offline cache:", err);
  }
}
