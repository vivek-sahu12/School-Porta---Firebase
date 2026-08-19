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
 * Get class rank (0 to 14) for logical order comparison
 * @param {string} className
 * @returns {number} Rank or -1 if not found
 */
export function getClassRank(className) {
  if (!className || typeof className !== "string") return -1;
  const clean = className.trim().toLowerCase();
  const found = CANONICAL_CLASSES.find(
    c => c.id.toLowerCase() === clean || c.label.toLowerCase() === clean
  );
  return found ? found.rank : -1;
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
