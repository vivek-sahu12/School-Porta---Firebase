/**
 * Student Data & Analytics Service for School Data Portal
 * Manages dataset loading, caching, seed generation, analytics calculations,
 * and high-performance in-memory search/filtering across School Data, UDISE, and 3.0 datasets.
 */

import {
  saveCollectionToCache,
  getCollectionFromCache,
  saveSyncMeta,
  getSyncMeta
} from "../offline-store.js";

import {
  db,
  doc,
  getDoc
} from "../firebase.js";

import {
  CANONICAL_CLASSES,
  getClassRank,
  normalizeClassLabel,
  getNaturalClassOrder,
  compareStudentsByClassAndName
} from "../school-config.js";

export const DATASET_KEYS = {
  SCHOOL_DATA: "school_data",
  UDISE: "udise",
  THREE_POINT_ZERO: "three_point_zero"
};

export const DATASET_LABELS = {
  [DATASET_KEYS.SCHOOL_DATA]: "School Data",
  [DATASET_KEYS.UDISE]: "UDISE",
  [DATASET_KEYS.THREE_POINT_ZERO]: "3.0"
};

// In-Memory Live Dataset Storage per School
const memoryStore = {
  schoolId: null,
  [DATASET_KEYS.SCHOOL_DATA]: [],
  [DATASET_KEYS.UDISE]: [],
  [DATASET_KEYS.THREE_POINT_ZERO]: []
};

/**
 * Initialize / override in-memory store (used for tests and rapid initialization)
 */
export function initStudentServiceMemory({ schoolId = "SCH", schoolData = [], udise = [], threePointZero = [] } = {}) {
  memoryStore.schoolId = schoolId;
  memoryStore[DATASET_KEYS.SCHOOL_DATA] = schoolData;
  memoryStore[DATASET_KEYS.UDISE] = udise;
  memoryStore[DATASET_KEYS.THREE_POINT_ZERO] = threePointZero;
}

/**
 * Completely purge in-memory student datasets and sync signatures
 * (Invoked during user revocation / forced logout to prevent data leak)
 */
export function clearStudentServiceMemory() {
  memoryStore.schoolId = null;
  memoryStore[DATASET_KEYS.SCHOOL_DATA] = [];
  memoryStore[DATASET_KEYS.UDISE] = [];
  memoryStore[DATASET_KEYS.THREE_POINT_ZERO] = [];
  lastSyncSignatures = {
    school_data: "",
    udise: "",
    three_point_zero: ""
  };
}

// Track dataset sync signatures to determine if fresh data arrived
let lastSyncSignatures = {
  school_data: "",
  udise: "",
  three_point_zero: ""
};

/**
 * Helper to compute lightweight sync signature from dataset doc data
 */
function computeSignature(docData) {
  if (!docData) return "empty";
  const count = docData.recordCount || docData.students?.length || 0;
  const time = docData.uploadedAt?.toMillis?.() || docData.updatedAt?.toMillis?.() || 0;
  return `${count}_${time}`;
}

/**
 * Initialize / Load datasets for a specific school.
 * Cache-First Architecture:
 * 1. Restores latest valid cached data immediately from IndexedDB into memory and UI.
 * 2. Does NOT repeatedly request data from Firebase during normal navigation or interaction.
 * 3. Only performs full Firebase fetches when explicitly forced (Manual Sync) or when cache is empty.
 *
 * @param {string} schoolId
 * @param {Object} [options]
 * @param {boolean} [options.forceRefresh=false] - Force live fetch from Cloud Firestore (e.g. Manual Sync)
 * @returns {Promise<{ school_data: Array, udise: Array, three_point_zero: Array, updated: boolean }>}
 */
export async function loadSchoolDatasets(schoolId, { forceRefresh = false } = {}) {
  if (!schoolId) {
    return {
      [DATASET_KEYS.SCHOOL_DATA]: [],
      [DATASET_KEYS.UDISE]: [],
      [DATASET_KEYS.THREE_POINT_ZERO]: [],
      updated: false
    };
  }

  const cleanSchoolId = schoolId.trim().toUpperCase();

  // If already in memory for this school and not forced, return immediately (0 Firebase reads)
  if (
    !forceRefresh &&
    memoryStore.schoolId === cleanSchoolId &&
    (memoryStore[DATASET_KEYS.SCHOOL_DATA].length > 0 ||
     memoryStore[DATASET_KEYS.UDISE].length > 0 ||
     memoryStore[DATASET_KEYS.THREE_POINT_ZERO].length > 0)
  ) {
    return {
      [DATASET_KEYS.SCHOOL_DATA]: memoryStore[DATASET_KEYS.SCHOOL_DATA],
      [DATASET_KEYS.UDISE]: memoryStore[DATASET_KEYS.UDISE],
      [DATASET_KEYS.THREE_POINT_ZERO]: memoryStore[DATASET_KEYS.THREE_POINT_ZERO],
      updated: false
    };
  }

  // 1. Restore from local IndexedDB cache first
  const [cachedSD, cachedUD, cachedP3] = await Promise.all([
    getCollectionFromCache(`students_sd_${cleanSchoolId}`),
    getCollectionFromCache(`students_ud_${cleanSchoolId}`),
    getCollectionFromCache(`students_p3_${cleanSchoolId}`)
  ]);

  const hasCachedData = (
    (cachedSD && cachedSD.length > 0) ||
    (cachedUD && cachedUD.length > 0) ||
    (cachedP3 && cachedP3.length > 0)
  );

  if (hasCachedData && !forceRefresh) {
    memoryStore.schoolId = cleanSchoolId;
    memoryStore[DATASET_KEYS.SCHOOL_DATA] = cachedSD || [];
    memoryStore[DATASET_KEYS.UDISE] = cachedUD || [];
    memoryStore[DATASET_KEYS.THREE_POINT_ZERO] = cachedP3 || [];

    return {
      [DATASET_KEYS.SCHOOL_DATA]: memoryStore[DATASET_KEYS.SCHOOL_DATA],
      [DATASET_KEYS.UDISE]: memoryStore[DATASET_KEYS.UDISE],
      [DATASET_KEYS.THREE_POINT_ZERO]: memoryStore[DATASET_KEYS.THREE_POINT_ZERO],
      updated: false
    };
  }

  // 2. Fetch from Cloud Firestore if forced (Manual Sync) or cache was completely empty while online
  if (navigator.onLine) {
    try {
      const [snapSD, snapUD, snapP3] = await Promise.all([
        getDoc(doc(db, "student_datasets", `${cleanSchoolId}_school_data`)),
        getDoc(doc(db, "student_datasets", `${cleanSchoolId}_udise`)),
        getDoc(doc(db, "student_datasets", `${cleanSchoolId}_three_point_zero`))
      ]);

      const firestoreSD = snapSD.exists() ? (snapSD.data().students || []) : [];
      const firestoreUD = snapUD.exists() ? (snapUD.data().students || []) : [];
      const firestoreP3 = snapP3.exists() ? (snapP3.data().students || []) : [];

      const sigSD = snapSD.exists() ? `${firestoreSD.length}_${snapSD.data().uploadedAt?.toMillis?.() || 0}` : "empty";
      const sigUD = snapUD.exists() ? `${firestoreUD.length}_${snapUD.data().uploadedAt?.toMillis?.() || 0}` : "empty";
      const sigP3 = snapP3.exists() ? `${firestoreP3.length}_${snapP3.data().uploadedAt?.toMillis?.() || 0}` : "empty";

      const hasChanged = (
        memoryStore.schoolId !== cleanSchoolId ||
        sigSD !== lastSyncSignatures.school_data ||
        sigUD !== lastSyncSignatures.udise ||
        sigP3 !== lastSyncSignatures.three_point_zero
      );

      lastSyncSignatures = {
        school_data: sigSD,
        udise: sigUD,
        three_point_zero: sigP3
      };

      // Synchronize to IndexedDB cache
      await Promise.all([
        saveCollectionToCache(`students_sd_${cleanSchoolId}`, firestoreSD, "id"),
        saveCollectionToCache(`students_ud_${cleanSchoolId}`, firestoreUD, "id"),
        saveCollectionToCache(`students_p3_${cleanSchoolId}`, firestoreP3, "id"),
        saveSyncMeta(cleanSchoolId, {
          signatures: lastSyncSignatures,
          lastSyncedAt: Date.now()
        })
      ]);

      // Update in-memory store
      memoryStore.schoolId = cleanSchoolId;
      memoryStore[DATASET_KEYS.SCHOOL_DATA] = firestoreSD;
      memoryStore[DATASET_KEYS.UDISE] = firestoreUD;
      memoryStore[DATASET_KEYS.THREE_POINT_ZERO] = firestoreP3;

      return {
        [DATASET_KEYS.SCHOOL_DATA]: firestoreSD,
        [DATASET_KEYS.UDISE]: firestoreUD,
        [DATASET_KEYS.THREE_POINT_ZERO]: firestoreP3,
        updated: hasChanged
      };
    } catch (err) {
      console.warn("Could not load student datasets from Firestore, falling back to local cache:", err);
    }
  }

  // 3. Fallback: populate memory from whatever local cache exists
  memoryStore.schoolId = cleanSchoolId;
  memoryStore[DATASET_KEYS.SCHOOL_DATA] = cachedSD || [];
  memoryStore[DATASET_KEYS.UDISE] = cachedUD || [];
  memoryStore[DATASET_KEYS.THREE_POINT_ZERO] = cachedP3 || [];

  return {
    [DATASET_KEYS.SCHOOL_DATA]: memoryStore[DATASET_KEYS.SCHOOL_DATA],
    [DATASET_KEYS.UDISE]: memoryStore[DATASET_KEYS.UDISE],
    [DATASET_KEYS.THREE_POINT_ZERO]: memoryStore[DATASET_KEYS.THREE_POINT_ZERO],
    updated: false
  };
}

/**
 * Smart Lightweight Freshness Check (~Every 1 hour or on Reconnection).
 * Reads ONLY the lightweight school document metadata to check if datasets were updated.
 * Does NOT blindly download full student datasets unless a change is detected.
 *
 * @param {string} schoolId
 * @returns {Promise<{ updated: boolean, changed: Array<string> }>}
 */
export async function checkAndSyncDatasets(schoolId) {
  if (!schoolId || !navigator.onLine) {
    return { updated: false, changed: [] };
  }

  const cleanSchoolId = schoolId.trim().toUpperCase();

  try {
    // 1. Fetch single lightweight school doc containing datasets metadata
    const schoolDocRef = doc(db, "schools", cleanSchoolId);
    const schoolSnap = await getDoc(schoolDocRef);
    if (!schoolSnap.exists()) {
      return { updated: false, changed: [] };
    }

    const schoolData = schoolSnap.data();
    const serverDatasets = schoolData.datasets || {};
    const localMeta = await getSyncMeta(cleanSchoolId);
    const localSignatures = localMeta?.signatures || lastSyncSignatures || {};

    const datasetsToFetch = [];

    // Check School Data metadata
    const sdMeta = serverDatasets.school_data;
    const sdSig = sdMeta ? `${sdMeta.recordCount || 0}_${sdMeta.updatedAt?.toMillis?.() || 0}` : "";
    if (sdSig && sdSig !== localSignatures.school_data) {
      datasetsToFetch.push({ key: DATASET_KEYS.SCHOOL_DATA, cacheKey: `students_sd_${cleanSchoolId}`, docKey: "school_data", sig: sdSig });
    }

    // Check UDISE metadata
    const udMeta = serverDatasets.udise;
    const udSig = udMeta ? `${udMeta.recordCount || 0}_${udMeta.updatedAt?.toMillis?.() || 0}` : "";
    if (udSig && udSig !== localSignatures.udise) {
      datasetsToFetch.push({ key: DATASET_KEYS.UDISE, cacheKey: `students_ud_${cleanSchoolId}`, docKey: "udise", sig: udSig });
    }

    // Check 3.0 metadata
    const p3Meta = serverDatasets.three_point_zero;
    const p3Sig = p3Meta ? `${p3Meta.recordCount || 0}_${p3Meta.updatedAt?.toMillis?.() || 0}` : "";
    if (p3Sig && p3Sig !== localSignatures.three_point_zero) {
      datasetsToFetch.push({ key: DATASET_KEYS.THREE_POINT_ZERO, cacheKey: `students_p3_${cleanSchoolId}`, docKey: "three_point_zero", sig: p3Sig });
    }

    // If no changes detected on server, DO NOTHING (0 student dataset reads!)
    if (datasetsToFetch.length === 0) {
      return { updated: false, changed: [] };
    }

    // Only fetch the specific dataset(s) that changed
    const changedKeys = [];
    for (const item of datasetsToFetch) {
      try {
        const snap = await getDoc(doc(db, "student_datasets", `${cleanSchoolId}_${item.docKey}`));
        const students = snap.exists() ? (snap.data().students || []) : [];

        await saveCollectionToCache(item.cacheKey, students, "id");
        memoryStore[item.key] = students;
        lastSyncSignatures[item.docKey] = item.sig;
        changedKeys.push(item.key);
      } catch (fetchErr) {
        console.warn(`Failed to fetch updated dataset ${item.key}:`, fetchErr);
      }
    }

    if (changedKeys.length > 0) {
      await saveSyncMeta(cleanSchoolId, {
        signatures: lastSyncSignatures,
        lastSyncedAt: Date.now()
      });
      return { updated: true, changed: changedKeys };
    }

    return { updated: false, changed: [] };
  } catch (err) {
    console.warn("Lightweight freshness check note:", err);
    return { updated: false, changed: [] };
  }
}

/**
 * Get total student counts for all 3 datasets
 */
export function getDatasetTotals() {
  return {
    [DATASET_KEYS.SCHOOL_DATA]: (memoryStore[DATASET_KEYS.SCHOOL_DATA] || []).length,
    [DATASET_KEYS.UDISE]: (memoryStore[DATASET_KEYS.UDISE] || []).length,
    [DATASET_KEYS.THREE_POINT_ZERO]: (memoryStore[DATASET_KEYS.THREE_POINT_ZERO] || []).length
  };
}

/**
 * Get student records for a specific dataset, sorted universally by:
 * 1. Natural Class Order (Nursery -> KG1 -> KG2 -> 1 -> ... -> 12)
 * 2. Student Name Alphabetically A-Z (case-insensitive, trimmed)
 */
export function getDatasetStudents(datasetKey = DATASET_KEYS.SCHOOL_DATA) {
  const students = memoryStore[datasetKey] || [];
  return [...students].sort(compareStudentsByClassAndName);
}

/**
 * Calculate comprehensive dashboard analytics for the chosen dataset
 * Applies natural class ordering: Nursery -> KG1 -> KG2 -> 1 -> 2 -> ... -> 12
 */
export function calculateDatasetAnalytics(datasetKey = DATASET_KEYS.SCHOOL_DATA) {
  const students = memoryStore[datasetKey] || [];
  const total = students.length;

  if (total === 0) {
    return {
      datasetKey,
      datasetLabel: DATASET_LABELS[datasetKey] || "School Data",
      totalStudents: 0,
      classList: [],
      gender: {
        boys: 0,
        girls: 0,
        other: 0,
        boysPercent: 0,
        girlsPercent: 0
      },
      categories: [
        { category: "GEN", count: 0, percent: 0 },
        { category: "OBC", count: 0, percent: 0 },
        { category: "SC", count: 0, percent: 0 },
        { category: "ST", count: 0, percent: 0 }
      ]
    };
  }

  // 1. Class Distribution with Natural School Order
  const classMap = {};
  const classSectionCounts = {};
  students.forEach((st) => {
    const c = normalizeClassLabel(st.className);
    classMap[c] = (classMap[c] || 0) + 1;
    const sec = (st.section || "").trim().toUpperCase();
    if (sec) {
      if (!classSectionCounts[c]) classSectionCounts[c] = {};
      classSectionCounts[c][sec] = (classSectionCounts[c][sec] || 0) + 1;
    }
  });

  const classList = Object.keys(classMap).map(cls => ({
    className: cls,
    rank: getNaturalClassOrder(cls),
    count: classMap[cls],
    percent: total > 0 ? Math.round((classMap[cls] / total) * 100) : 0,
    sectionCounts: classSectionCounts[cls] || {}
  })).sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.className.localeCompare(b.className, undefined, { numeric: true });
  });

  // 2. Gender Breakdown
  let boys = 0;
  let girls = 0;
  let other = 0;

  students.forEach((st) => {
    const g = (st.gender || "").trim().toLowerCase();
    if (g === "boy" || g === "male" || g === "m") boys++;
    else if (g === "girl" || g === "female" || g === "f") girls++;
    else other++;
  });

  const boysPercent = total > 0 ? Math.round((boys / total) * 100) : 0;
  const girlsPercent = total > 0 ? (100 - boysPercent) : 0;

  // 3. Category Breakdown
  const catMap = {};
  students.forEach((st) => {
    const cat = (st.category || "").trim().toUpperCase();
    if (cat) {
      catMap[cat] = (catMap[cat] || 0) + 1;
    }
  });

  // Canonical ordering for categories: GEN, OBC, SC, ST, then any other
  const standardCats = ["GEN", "OBC", "SC", "ST"];
  const presentCats = Object.keys(catMap);
  const sortedCatKeys = [
    ...standardCats.filter(c => presentCats.includes(c)),
    ...presentCats.filter(c => !standardCats.includes(c))
  ];

  const categoryList = sortedCatKeys.map(cat => ({
    category: cat,
    count: catMap[cat],
    percent: total > 0 ? Math.round((catMap[cat] / total) * 100) : 0
  }));

  return {
    datasetKey,
    datasetLabel: DATASET_LABELS[datasetKey] || "School Data",
    totalStudents: total,
    classList,
    gender: {
      boys,
      girls,
      other,
      boysPercent,
      girlsPercent
    },
    categories: categoryList
  };
}

/**
 * Filter students in memory by class, gender, category, and search query.
 * All results are GUARANTEED to be sorted alphabetically by student name (A–Z, case-insensitive, trimmed).
 */
export function filterStudents(datasetKey, { search = "", className = "", section = "", gender = "", category = "" } = {}) {
  const students = memoryStore[datasetKey] || [];
  const q = search.trim().toLowerCase();
  const targetClass = className ? normalizeClassLabel(className).toLowerCase() : "";
  const targetSection = (section || "").trim().toUpperCase();
  const targetGender = gender.trim().toLowerCase();
  const targetCategory = category.trim().toUpperCase();

  const filtered = students.filter(st => {
    // 1. Class filter (compares normalized class labels)
    if (targetClass && normalizeClassLabel(st.className).toLowerCase() !== targetClass) {
      return false;
    }

    // 1b. Section filter (compares normalized section names)
    if (targetSection) {
      const stSec = (st.section || "").trim().toUpperCase();
      if (stSec !== targetSection) {
        return false;
      }
    }

    // 2. Gender filter
    if (targetGender) {
      const g = (st.gender || "").toLowerCase();
      if (targetGender === "boys" || targetGender === "boy" || targetGender === "male") {
        if (g !== "boy" && g !== "male" && g !== "m") return false;
      } else if (targetGender === "girls" || targetGender === "girl" || targetGender === "female") {
        if (g !== "girl" && g !== "female" && g !== "f") return false;
      }
    }

    // 3. Category filter
    if (targetCategory && (st.category || "").toUpperCase() !== targetCategory) {
      return false;
    }

    // 4. Text Search
    if (q) {
      const matchName = (st.studentName || "").toLowerCase().includes(q);
      const matchFather = (st.fatherName || "").toLowerCase().includes(q);
      const matchMother = (st.motherName || "").toLowerCase().includes(q);
      const matchScholar = (st.scholarNo || "").toLowerCase().includes(q);
      const matchSamagra = (st.samagraId || st.samagraMemberId || "").toLowerCase().includes(q);
      const matchPen = (st.penNo || "").toLowerCase().includes(q);
      const matchUdise = (st.udiseId || "").toLowerCase().includes(q);
      const matchRoll = (st.rollNo || "").toLowerCase().includes(q);

      if (!matchName && !matchFather && !matchMother && !matchScholar && !matchSamagra && !matchPen && !matchUdise && !matchRoll) {
        return false;
      }
    }

    return true;
  });

  // Search Relevance Ranking (Requirement 9 & 10):
  // When a search query is entered, prioritize matches in Student Name first.
  // Both priority groups preserve class-first natural ordering then Student Name A-Z.
  if (q) {
    const studentNameMatches = [];
    const otherFieldMatches = [];

    for (const st of filtered) {
      const matchName = (st.studentName || "").toLowerCase().includes(q);
      if (matchName) {
        studentNameMatches.push(st);
      } else {
        otherFieldMatches.push(st);
      }
    }

    studentNameMatches.sort(compareStudentsByClassAndName);
    otherFieldMatches.sort(compareStudentsByClassAndName);

    return [...studentNameMatches, ...otherFieldMatches];
  }

  // Universal Student Sorting Rule when no search term is active:
  // 1. Natural Class Order (Nursery -> KG1 -> KG2 -> 1 -> 2 -> ... -> 12)
  // 2. Student Name Alphabetically A-Z (case-insensitive, trimmed)
  return filtered.sort(compareStudentsByClassAndName);
}

/**
 * Find single student by ID
 */
export function getStudentById(datasetKey, studentId) {
  const students = memoryStore[datasetKey] || [];
  return students.find(s => s.id === studentId);
}
