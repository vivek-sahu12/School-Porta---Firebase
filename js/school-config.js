/**
 * Centralized Canonical School Configuration & Class Range Engine
 * Authoritative source for class range validation, senior subject detection, and class ordering.
 */

export const CANONICAL_CLASSES = [
  { id: "Nursery", label: "Nursery", rank: 0 },
  { id: "KG 1", label: "KG 1 / LKG", rank: 1 },
  { id: "KG 2", label: "KG 2 / UKG", rank: 2 },
  { id: "Class 1", label: "Class 1", rank: 3 },
  { id: "Class 2", label: "Class 2", rank: 4 },
  { id: "Class 3", label: "Class 3", rank: 5 },
  { id: "Class 4", label: "Class 4", rank: 6 },
  { id: "Class 5", label: "Class 5", rank: 7 },
  { id: "Class 6", label: "Class 6", rank: 8 },
  { id: "Class 7", label: "Class 7", rank: 9 },
  { id: "Class 8", label: "Class 8", rank: 10 },
  { id: "Class 9", label: "Class 9", rank: 11 },
  { id: "Class 10", label: "Class 10", rank: 12 },
  { id: "Class 11", label: "Class 11", rank: 13 },
  { id: "Class 12", label: "Class 12", rank: 14 }
];

export const STANDARD_SENIOR_SUBJECTS = [
  "Physics",
  "Chemistry",
  "Mathematics",
  "Biology",
  "English",
  "Hindi",
  "Accountancy",
  "Business Studies",
  "Economics",
  "Computer Science",
  "Information Practices",
  "History",
  "Political Science",
  "Geography",
  "Psychology",
  "Sociology",
  "Physical Education"
];

/**
 * Normalizes class labels for consistent school display:
 * - "KG 1", "K G 1", "KG-1", "K.G. 1" -> "KG1"
 * - "KG 2", "K G 2", "KG-2", "K.G. 2" -> "KG2"
 * - "Class 1", "Grade 1", "Std 1" -> "1"
 * - Roman numerals "I".."XII" -> "1".."12"
 * - Preserves legitimate grade names: "Nursery", "LKG", "UKG"
 * - Numeric classes "1".."12" -> "1".."12"
 */
export function normalizeClassLabel(val) {
  if (val === null || val === undefined) return "Unassigned";
  let s = String(val).trim();
  if (!s) return "Unassigned";

  // Check KG1 variations: "K G 1", "KG 1", "KG-1", "K.G. 1", "KG_1"
  if (/^k\.?\s*g\.?\s*[-_]?\s*1$/i.test(s)) {
    return "KG1";
  }
  // Check KG2 variations: "K G 2", "KG 2", "KG-2", "K.G. 2", "KG_2"
  if (/^k\.?\s*g\.?\s*[-_]?\s*2$/i.test(s)) {
    return "KG2";
  }

  // Preserve Nursery, LKG, UKG as standard capitalized
  if (/^nursery$/i.test(s)) return "Nursery";
  if (/^lkg$/i.test(s)) return "LKG";
  if (/^ukg$/i.test(s)) return "UKG";

  // Strip prefixes like "Class ", "Grade ", "Std ", "Standard "
  const prefixMatch = s.match(/^(?:class|std\.?|standard|grade)\s+(.+)$/i);
  const core = prefixMatch ? prefixMatch[1].trim() : s;

  // Roman numerals mapping
  const ROMAN_MAP = {
    "I": "1", "II": "2", "III": "3", "IV": "4", "V": "5", "VI": "6",
    "VII": "7", "VIII": "8", "IX": "9", "X": "10", "XI": "11", "XII": "12"
  };
  const upper = core.toUpperCase();
  if (ROMAN_MAP[upper]) {
    return ROMAN_MAP[upper];
  }

  // If purely numeric
  if (/^\d+$/.test(core)) {
    return String(parseInt(core, 10));
  }

  return s;
}

/**
 * Format class for display:
 * Converts numeric classes ("1".."12") to "Class 1".."Class 12".
 * Preserves standard grade names ("Nursery", "KG1", "KG2", "LKG", "UKG") as-is.
 * Does NOT alter underlying database values.
 */
export function formatClassDisplay(className) {
  if (className === null || className === undefined) return "—";
  const str = String(className).trim();
  if (!str) return "—";
  const norm = normalizeClassLabel(str);
  if (/^\d+$/.test(norm)) {
    return `Class ${norm}`;
  }
  return norm;
}

/**
 * Natural school class ranking for sorting:
 * Nursery (0) -> KG1 (1) / LKG (1) -> KG2 (2) / UKG (2) -> 1 (11) -> 2 (12) -> ... -> 12 (22)
 * Eliminates alphabetical sort defects (such as "10" before "2").
 */
export function getNaturalClassOrder(className) {
  const norm = normalizeClassLabel(className);
  const lower = norm.toLowerCase();

  if (lower === "nursery") return 0;
  if (lower === "kg1" || lower === "lkg") return 1;
  if (lower === "kg2" || lower === "ukg") return 2;

  const num = parseInt(norm, 10);
  if (!isNaN(num) && /^\d+$/.test(norm)) {
    return 10 + num; // 1 -> 11, 2 -> 12, ..., 12 -> 22
  }

  return 1000;
}

/**
 * Universal Student Comparator Rule:
 * 1. Primary: Natural Class Order (Nursery -> KG1 -> KG2 -> 1 -> 2 -> ... -> 12)
 * 2. Secondary: Student Name Alphabetically A-Z (case-insensitive, trimmed)
 *
 * Applicable uniformly to All Students, Boys, Girls, Category lists, Search Results,
 * and Class-specific rosters (where uniform class rank collapses naturally to Name A-Z).
 */
export function compareStudentsByClassAndName(a, b) {
  const rankA = getNaturalClassOrder(a?.className);
  const rankB = getNaturalClassOrder(b?.className);

  if (rankA !== rankB) {
    return rankA - rankB;
  }

  const nameA = (a?.studentName || "").trim();
  const nameB = (b?.studentName || "").trim();
  return nameA.localeCompare(nameB, undefined, { sensitivity: "base", numeric: true });
}


/**
 * Get class rank for logical order comparison
 * @param {string} className
 * @returns {number} Rank or -1 if not found
 */
export function getClassRank(className) {
  if (!className || typeof className !== "string") return -1;
  const rank = getNaturalClassOrder(className);
  return rank <= 100 ? rank : -1;
}

/**
 * Validates whether a given class range is logically sound (start <= end)
 * @param {string} startingClass
 * @param {string} endingClass
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateClassRange(startingClass, endingClass) {
  const startRank = getClassRank(startingClass);
  const endRank = getClassRank(endingClass);

  if (startRank === -1) {
    return { valid: false, error: "Please select a valid Starting Class." };
  }
  if (endRank === -1) {
    return { valid: false, error: "Please select a valid Ending Class." };
  }
  if (endRank < startRank) {
    return { 
      valid: false, 
      error: `Invalid Class Range: Ending Class (${endingClass}) cannot come before Starting Class (${startingClass}).` 
    };
  }

  return { valid: true };
}

/**
 * Determines whether the school offers senior classes (Class 11 or Class 12)
 * @param {string} startingClass
 * @param {string} endingClass
 * @returns {boolean}
 */
export function includesSeniorClasses(startingClass, endingClass) {
  const endRank = getClassRank(endingClass);
  const startRank = getClassRank(startingClass);
  const class11Rank = getClassRank("Class 11"); // 13

  if (endRank === -1) return false;
  return endRank >= class11Rank || startRank >= class11Rank;
}

/**
 * Generates <option> HTML string for class dropdowns
 * @param {string} selectedClass
 * @param {string} placeholder
 * @returns {string} HTML string
 */
export function getClassSelectOptions(selectedClass = "", placeholder = "Select Class") {
  let html = placeholder ? `<option value="">-- ${placeholder} --</option>` : "";
  html += CANONICAL_CLASSES.map(c => `
    <option value="${c.id}" ${c.id === selectedClass ? "selected" : ""}>${c.label}</option>
  `).join("");
  return html;
}

/**
 * Returns an array of classes in range from start to end (inclusive)
 * @param {string} startingClass
 * @param {string} endingClass
 * @returns {string[]} Array of class IDs
 */
export function getClassesInRange(startingClass, endingClass) {
  const startRank = getClassRank(startingClass);
  const endRank = getClassRank(endingClass);
  if (startRank === -1 || endRank === -1 || endRank < startRank) return [];
  return CANONICAL_CLASSES.slice(startRank, endRank + 1).map(c => c.id);
}

/**
 * Escapes characters with special meaning in HTML to avoid XSS injection.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escapes special regex characters in a search term.
 * @param {string} str
 * @returns {string}
 */
export function escapeRegExp(str) {
  if (!str) return "";
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Safely highlights all case-insensitive occurrences of a search query within text.
 * Preserves the original text casing and escapes HTML everywhere.
 *
 * Example:
 * highlightSearchMatches("Vikram Sharma", "rm") -> "Vik<mark class=\"search-highlight\">rm</mark>ak Sharma" (where "rm" matched)
 *
 * @param {string} text The raw data string
 * @param {string} query The user's search query
 * @returns {string} Sanitized HTML with highlighted matches
 */
export function highlightSearchMatches(text, query) {
  if (text === null || text === undefined) return "";
  const str = String(text);
  if (!query || !query.trim()) {
    return escapeHtml(str);
  }

  const cleanQuery = query.trim();
  const escapedQuery = escapeRegExp(cleanQuery);
  const regex = new RegExp(escapedQuery, "gi");

  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(str)) !== null) {
    const matchIndex = match.index;
    const matchLength = match[0].length;

    // Append unhighlighted escaped text before the match
    result += escapeHtml(str.substring(lastIndex, matchIndex));

    // Append highlighted escaped match
    const matchedText = str.substring(matchIndex, matchIndex + matchLength);
    result += `<mark class="search-highlight">${escapeHtml(matchedText)}</mark>`;

    lastIndex = matchIndex + matchLength;
  }

  // Append remaining text
  result += escapeHtml(str.substring(lastIndex));
  return result;
}

/**
 * Normalizes a section name:
 * - Trims whitespace
 * - Collapses consecutive spaces
 * - Converts to uppercase
 * Example: " a " -> "A", "sec-a" -> "SEC-A"
 * @param {*} val
 * @returns {string}
 */
export function normalizeSectionName(val) {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  if (!s) return "";
  return s.replace(/\s+/g, " ").toUpperCase();
}

/**
 * Resolves configured section names for a given class from a school entity.
 * Checks both normalized class label (e.g. "1") and canonical ID (e.g. "Class 1").
 * Returns an array of section strings (e.g. ["A", "B", "C"]).
 *
 * @param {Object} schoolEntity School document or configuration object
 * @param {string} className Class name to look up
 * @returns {string[]} Array of configured section names
 */
export function getSectionsForClass(schoolEntity, className) {
  if (!schoolEntity || !schoolEntity.sectionsEnabled || !schoolEntity.sections) {
    return [];
  }
  const sections = schoolEntity.sections;
  if (typeof sections !== "object" || sections === null) return [];

  const norm = normalizeClassLabel(className);
  const raw = String(className || "").trim();

  const found = sections[norm] || sections[raw] || sections[formatClassDisplay(className)];
  if (Array.isArray(found)) {
    return found.map(s => typeof s === "string" ? s.trim() : (s?.name ? String(s.name).trim() : "")).filter(Boolean);
  }
  return [];
}

/**
 * Supported Column Types for Custom School Data Fields
 */
export const SUPPORTED_COLUMN_TYPES = [
  { id: "text", label: "Text" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "phone", label: "Phone" },
  { id: "boolean", label: "Yes/No (Boolean)" }
];

/**
 * Permanent Core System Fields for School Data (Mandatory & Protected from Deletion)
 */
export const CORE_SCHOOL_DATA_COLUMNS = [
  { columnId: "scholarNo", label: "Scholar No", type: "text", isCore: true, order: 1 },
  { columnId: "studentName", label: "Student Name", type: "text", isCore: true, order: 2 },
  { columnId: "className", label: "Class", type: "text", isCore: true, order: 3 },
  { columnId: "gender", label: "Gender", type: "text", isCore: true, order: 4 },
  { columnId: "category", label: "Category", type: "text", isCore: true, order: 5 }
];

/**
 * Standard Default Columns populated for legacy schools without custom column config
 */
export const DEFAULT_SCHOOL_DATA_COLUMNS = [
  { columnId: "scholarNo", label: "Scholar No", type: "text", isCore: true, order: 1 },
  { columnId: "studentName", label: "Student Name", type: "text", isCore: true, order: 2 },
  { columnId: "className", label: "Class", type: "text", isCore: true, order: 3 },
  { columnId: "gender", label: "Gender", type: "text", isCore: true, order: 4 },
  { columnId: "category", label: "Category", type: "text", isCore: true, order: 5 },
  { columnId: "fatherName", label: "Father Name", type: "text", isCore: false, order: 6 },
  { columnId: "motherName", label: "Mother Name", type: "text", isCore: false, order: 7 },
  { columnId: "dob", label: "Date of Birth", type: "date", isCore: false, order: 8 },
  { columnId: "mobile", label: "Mobile Number", type: "phone", isCore: false, order: 9 },
  { columnId: "address", label: "Address", type: "text", isCore: false, order: 10 },
  { columnId: "rollNo", label: "Roll Number", type: "number", isCore: false, order: 11 }
];

/**
 * Normalizes a column label for trimmed, case-insensitive comparison.
 * @param {string} label
 * @returns {string}
 */
export function normalizeColumnLabel(label) {
  if (!label || typeof label !== "string") return "";
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Resolves the effective School Data columns for a given school entity.
 * - Prioritizes school.schoolDataColumns (or schoolDataConfig.columns).
 * - Falls back to DEFAULT_SCHOOL_DATA_COLUMNS.
 * - Always ensures all CORE_SCHOOL_DATA_COLUMNS are preserved.
 * - Dynamically includes `section` when sections are enabled.
 * - Returns clean array sorted by column order.
 *
 * @param {Object} school
 * @returns {Array<Object>}
 */
export function getSchoolDataColumns(school) {
  let cols = [];
  if (Array.isArray(school?.schoolDataColumns) && school.schoolDataColumns.length > 0) {
    cols = school.schoolDataColumns.map(c => ({ ...c }));
  } else if (Array.isArray(school?.schoolDataConfig?.columns) && school.schoolDataConfig.columns.length > 0) {
    cols = school.schoolDataConfig.columns.map(c => ({ ...c }));
  } else {
    cols = DEFAULT_SCHOOL_DATA_COLUMNS.map(c => ({ ...c }));
  }

  // Ensure all core system columns exist in the configuration
  CORE_SCHOOL_DATA_COLUMNS.forEach(core => {
    const exists = cols.some(c => c.columnId === core.columnId);
    if (!exists) {
      cols.unshift({ ...core });
    }
  });

  // Ensure isCore flag is strictly enforced on core columns
  const coreIds = new Set(CORE_SCHOOL_DATA_COLUMNS.map(c => c.columnId));
  cols.forEach(c => {
    if (coreIds.has(c.columnId)) {
      c.isCore = true;
    }
  });

  // Dynamically handle 'section' column based on master toggle
  const sectionsOn = Boolean(school?.sectionsEnabled);
  const secIdx = cols.findIndex(c => c.columnId === "section");

  if (sectionsOn) {
    if (secIdx === -1) {
      // Insert Section immediately after Class
      const classIdx = cols.findIndex(c => c.columnId === "className");
      const insertAt = classIdx !== -1 ? classIdx + 1 : 3;
      cols.splice(insertAt, 0, {
        columnId: "section",
        label: "Section",
        type: "text",
        isCore: true,
        isSystem: true,
        order: insertAt + 1
      });
    } else {
      cols[secIdx].isCore = true;
      cols[secIdx].isSystem = true;
    }
  } else if (secIdx !== -1) {
    // Hide section completely when master toggle is OFF
    cols.splice(secIdx, 1);
  }

  // Sort by order ascending
  cols.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

  // Normalize order values 1, 2, 3...
  cols.forEach((c, idx) => {
    c.order = idx + 1;
  });

  return cols;
}

/**
 * Safely resolves a student field value given a column definition.
 * Looks up customFields[columnId], student[columnId], or student[legacyKey].
 *
 * @param {Object} student
 * @param {Object|string} column
 * @returns {any}
 */
export function getStudentFieldValue(student, column) {
  if (!student) return "";
  const columnId = typeof column === "string" ? column : (column?.columnId || column?.key);
  if (!columnId) return "";

  // 1. Direct customFields mapping
  if (student.customFields && student.customFields[columnId] !== undefined && student.customFields[columnId] !== null) {
    return student.customFields[columnId];
  }

  // 2. Direct top-level property
  if (student[columnId] !== undefined && student[columnId] !== null) {
    return student[columnId];
  }

  // 3. Fallback aliases for legacy fields
  const aliases = {
    fatherName: ["father_name", "father", "fatherName"],
    motherName: ["mother_name", "mother", "motherName"],
    scholarNo: ["scholar_no", "admissionNo", "id"],
    mobile: ["phone", "phoneNumber", "contact"]
  };

  const aliasList = aliases[columnId];
  if (Array.isArray(aliasList)) {
    for (const al of aliasList) {
      if (student[al] !== undefined && student[al] !== null) {
        return student[al];
      }
    }
  }

  return "";
}


