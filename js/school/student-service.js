/**
 * Student Data & Analytics Service for School Data Portal
 * Manages dataset loading, caching, seed generation, analytics calculations,
 * and high-performance in-memory search/filtering across School Data, UDISE, and 3.0 datasets.
 */

import {
  saveCollectionToCache,
  getCollectionFromCache
} from "../offline-store.js";

import {
  CANONICAL_CLASSES,
  getClassRank
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

const SAMPLE_NAMES = [
  { name: "Aarav Sharma", father: "Ramesh Sharma", mother: "Sunita Sharma", gender: "Boy", category: "GEN" },
  { name: "Ananya Patel", father: "Mahesh Patel", mother: "Geeta Patel", gender: "Girl", category: "OBC" },
  { name: "Vihaan Verma", father: "Rajesh Verma", mother: "Pooja Verma", gender: "Boy", category: "SC" },
  { name: "Isha Gupta", father: "Alok Gupta", mother: "Anita Gupta", gender: "Girl", category: "GEN" },
  { name: "Reyansh Singh", father: "Dharmendra Singh", mother: "Kiran Singh", gender: "Boy", category: "OBC" },
  { name: "Myra Rajput", father: "Suraj Rajput", mother: "Sushma Rajput", gender: "Girl", category: "GEN" },
  { name: "Kabir Khan", father: "Imran Khan", mother: "Farida Khan", gender: "Boy", category: "GEN" },
  { name: "Saanvi Joshi", father: "Dinesh Joshi", mother: "Meena Joshi", gender: "Girl", category: "GEN" },
  { name: "Aditya Mishra", father: "Brijesh Mishra", mother: "Manju Mishra", gender: "Boy", category: "GEN" },
  { name: "Diya Yadav", father: "Gopal Yadav", mother: "Rekha Yadav", gender: "Girl", category: "OBC" },
  { name: "Aryan Sahu", father: "Pramod Sahu", mother: "Kavita Sahu", gender: "Boy", category: "OBC" },
  { name: "Anushka Tiwari", father: "Vinod Tiwari", mother: "Shobha Tiwari", gender: "Girl", category: "GEN" },
  { name: "Devansh Meena", father: "Ramvilas Meena", mother: "Kamla Meena", gender: "Boy", category: "ST" },
  { name: "Riya Chouhan", father: "Harish Chouhan", mother: "Lata Chouhan", gender: "Girl", category: "SC" },
  { name: "Krish Dubey", father: "Pankaj Dubey", mother: "Radha Dubey", gender: "Boy", category: "GEN" },
  { name: "Tanvi Rathore", father: "Bhupendra Rathore", mother: "Asha Rathore", gender: "Girl", category: "GEN" },
  { name: "Shaurya Thakur", father: "Vikram Thakur", mother: "Mamta Thakur", gender: "Boy", category: "OBC" },
  { name: "Pari Malviya", father: "Ghanshyam Malviya", mother: "Geetanjali Malviya", gender: "Girl", category: "SC" },
  { name: "Rudra Bhil", father: "Nathu Bhil", mother: "Janki Bhil", gender: "Boy", category: "ST" },
  { name: "Navya Sen", father: "Jagdish Sen", mother: "Saroj Sen", gender: "Girl", category: "OBC" }
];

/**
 * Generate synthetic realistic datasets for a school based on its class range
 */
function generateSchoolDatasets(schoolId, startingClass = "Nursery", endingClass = "Class 10") {
  const startRank = Math.max(0, getClassRank(startingClass));
  const endRank = Math.max(startRank, getClassRank(endingClass));
  const activeClasses = CANONICAL_CLASSES.slice(startRank, endRank + 1).map(c => c.id);

  const schoolDataStudents = [];
  const udiseStudents = [];
  const portal3Students = [];

  let globalStudentId = 1001;

  activeClasses.forEach((clsName, classIdx) => {
    // Generate between 8 and 18 students per class
    const count = 10 + ((classIdx * 7 + 3) % 9);
    for (let i = 0; i < count; i++) {
      const sample = SAMPLE_NAMES[(classIdx * 4 + i) % SAMPLE_NAMES.length];
      const rollNo = (i + 1).toString().padStart(2, "0");
      const section = i % 2 === 0 ? "A" : "B";
      const scholarNo = `SCH-${schoolId}-${clsName.replace(/\s+/g, "")}-${rollNo}`;
      const samagraId = (910000000 + globalStudentId).toString();
      const panNo = `ABCPS${(8000 + globalStudentId)}K`;
      const penNo = `PEN-${(1000000000 + globalStudentId)}`;
      const udiseId = `UDISE-${schoolId}-${globalStudentId}`;
      const dobYear = 2024 - (classIdx + 4);
      const dobMonth = (1 + (i % 12)).toString().padStart(2, "0");
      const dobDay = (1 + ((i * 3) % 28)).toString().padStart(2, "0");
      const dob = `${dobYear}-${dobMonth}-${dobDay}`;
      const mobile = `9826${(100000 + globalStudentId).toString().substring(0, 6)}`;
      const address = `Ward ${1 + (i % 15)}, Civil Lines, Campus Vicinity`;

      // 1. School Data Record
      const schoolRecord = {
        id: `SD-${schoolId}-${globalStudentId}`,
        dataset: DATASET_KEYS.SCHOOL_DATA,
        schoolId,
        studentName: sample.name,
        fatherName: sample.father,
        motherName: sample.mother,
        gender: sample.gender,
        category: sample.category,
        className: clsName,
        section,
        scholarNo,
        rollNo,
        dob,
        mobile,
        address,
        samagraId,
        panNo,
        admissionDate: `${dobYear + 3}-06-15`,
        status: "Active"
      };
      schoolDataStudents.push(schoolRecord);

      // 2. UDISE Record (98% match with slight variation)
      if ((i + classIdx) % 15 !== 0) {
        udiseStudents.push({
          id: `UD-${schoolId}-${globalStudentId}`,
          dataset: DATASET_KEYS.UDISE,
          schoolId,
          studentName: sample.name,
          fatherName: sample.father,
          motherName: sample.mother,
          gender: sample.gender,
          category: sample.category,
          className: clsName,
          section,
          penNo,
          udiseId,
          udiseSchoolCode: `UD${schoolId}99`,
          aadharNo: `XXXX-XXXX-${(4000 + (globalStudentId % 6000))}`,
          dob,
          mobile,
          address,
          status: "Verified"
        });
      }

      // 3. 3.0 Portal Record (92% match)
      if ((i + classIdx) % 12 !== 0) {
        portal3Students.push({
          id: `P3-${schoolId}-${globalStudentId}`,
          dataset: DATASET_KEYS.THREE_POINT_ZERO,
          schoolId,
          studentName: sample.name,
          fatherName: sample.father,
          motherName: sample.mother,
          gender: sample.gender,
          category: sample.category,
          className: clsName,
          section,
          samagraMemberId: samagraId,
          samagraFamilyId: (71000000 + (globalStudentId % 500)).toString(),
          scholarNo,
          dob,
          mobile,
          address,
          status: "Enrolled"
        });
      }

      globalStudentId++;
    }
  });

  return {
    [DATASET_KEYS.SCHOOL_DATA]: schoolDataStudents,
    [DATASET_KEYS.UDISE]: udiseStudents,
    [DATASET_KEYS.THREE_POINT_ZERO]: portal3Students
  };
}

/**
 * Initialize / Load datasets for a specific school
 */
export async function loadSchoolDatasets(schoolId, schoolConfig = {}) {
  if (!schoolId) return { [DATASET_KEYS.SCHOOL_DATA]: [], [DATASET_KEYS.UDISE]: [], [DATASET_KEYS.THREE_POINT_ZERO]: [] };

  const cleanSchoolId = schoolId.trim().toUpperCase();

  // If already in memory for this school, return instantly
  if (memoryStore.schoolId === cleanSchoolId && memoryStore[DATASET_KEYS.SCHOOL_DATA].length > 0) {
    return {
      [DATASET_KEYS.SCHOOL_DATA]: memoryStore[DATASET_KEYS.SCHOOL_DATA],
      [DATASET_KEYS.UDISE]: memoryStore[DATASET_KEYS.UDISE],
      [DATASET_KEYS.THREE_POINT_ZERO]: memoryStore[DATASET_KEYS.THREE_POINT_ZERO]
    };
  }

  // 1. Try loading from IndexedDB
  const cachedSD = await getCollectionFromCache(`students_sd_${cleanSchoolId}`);
  const cachedUD = await getCollectionFromCache(`students_ud_${cleanSchoolId}`);
  const cachedP3 = await getCollectionFromCache(`students_p3_${cleanSchoolId}`);

  if (cachedSD && cachedSD.length > 0) {
    memoryStore.schoolId = cleanSchoolId;
    memoryStore[DATASET_KEYS.SCHOOL_DATA] = cachedSD;
    memoryStore[DATASET_KEYS.UDISE] = cachedUD || [];
    memoryStore[DATASET_KEYS.THREE_POINT_ZERO] = cachedP3 || [];
    return {
      [DATASET_KEYS.SCHOOL_DATA]: memoryStore[DATASET_KEYS.SCHOOL_DATA],
      [DATASET_KEYS.UDISE]: memoryStore[DATASET_KEYS.UDISE],
      [DATASET_KEYS.THREE_POINT_ZERO]: memoryStore[DATASET_KEYS.THREE_POINT_ZERO]
    };
  }

  // 2. Otherwise generate seed data matching configured class range and persist to IndexedDB
  const generated = generateSchoolDatasets(
    cleanSchoolId,
    schoolConfig.startingClass || "Nursery",
    schoolConfig.endingClass || "Class 10"
  );

  memoryStore.schoolId = cleanSchoolId;
  memoryStore[DATASET_KEYS.SCHOOL_DATA] = generated[DATASET_KEYS.SCHOOL_DATA];
  memoryStore[DATASET_KEYS.UDISE] = generated[DATASET_KEYS.UDISE];
  memoryStore[DATASET_KEYS.THREE_POINT_ZERO] = generated[DATASET_KEYS.THREE_POINT_ZERO];

  await saveCollectionToCache(`students_sd_${cleanSchoolId}`, memoryStore[DATASET_KEYS.SCHOOL_DATA], "id");
  await saveCollectionToCache(`students_ud_${cleanSchoolId}`, memoryStore[DATASET_KEYS.UDISE], "id");
  await saveCollectionToCache(`students_p3_${cleanSchoolId}`, memoryStore[DATASET_KEYS.THREE_POINT_ZERO], "id");

  return {
    [DATASET_KEYS.SCHOOL_DATA]: memoryStore[DATASET_KEYS.SCHOOL_DATA],
    [DATASET_KEYS.UDISE]: memoryStore[DATASET_KEYS.UDISE],
    [DATASET_KEYS.THREE_POINT_ZERO]: memoryStore[DATASET_KEYS.THREE_POINT_ZERO]
  };
}

/**
 * Get total student counts for all 3 datasets
 */
export function getDatasetTotals() {
  return {
    [DATASET_KEYS.SCHOOL_DATA]: memoryStore[DATASET_KEYS.SCHOOL_DATA].length,
    [DATASET_KEYS.UDISE]: memoryStore[DATASET_KEYS.UDISE].length,
    [DATASET_KEYS.THREE_POINT_ZERO]: memoryStore[DATASET_KEYS.THREE_POINT_ZERO].length
  };
}

/**
 * Get student records for a specific dataset
 */
export function getDatasetStudents(datasetKey = DATASET_KEYS.SCHOOL_DATA) {
  return memoryStore[datasetKey] || [];
}

/**
 * Calculate comprehensive dashboard analytics for the chosen dataset
 */
export function calculateDatasetAnalytics(datasetKey = DATASET_KEYS.SCHOOL_DATA) {
  const students = getDatasetStudents(datasetKey);
  const total = students.length;

  // 1. Class Distribution
  const classMap = {};
  students.forEach((st) => {
    const c = st.className || "Unassigned";
    classMap[c] = (classMap[c] || 0) + 1;
  });

  const classList = Object.keys(classMap).map(cls => ({
    className: cls,
    rank: getClassRank(cls),
    count: classMap[cls],
    percent: total > 0 ? Math.round((classMap[cls] / total) * 100) : 0
  })).sort((a, b) => {
    if (a.rank !== -1 && b.rank !== -1) return a.rank - b.rank;
    return a.className.localeCompare(b.className);
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
 * Filter students in memory by class, gender, category, and search query
 */
export function filterStudents(datasetKey, { search = "", className = "", gender = "", category = "" } = {}) {
  const students = getDatasetStudents(datasetKey);
  const q = search.trim().toLowerCase();
  const targetClass = className.trim().toLowerCase();
  const targetGender = gender.trim().toLowerCase();
  const targetCategory = category.trim().toUpperCase();

  return students.filter(st => {
    // 1. Class filter
    if (targetClass && (st.className || "").toLowerCase() !== targetClass) {
      return false;
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
}

/**
 * Find single student by ID
 */
export function getStudentById(datasetKey, studentId) {
  const students = getDatasetStudents(datasetKey);
  return students.find(s => s.id === studentId);
}
