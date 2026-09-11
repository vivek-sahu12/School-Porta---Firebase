/**
 * Excel Parser & Dataset Validator for School Data Portal
 * Validates and converts uploaded .xlsx files into normalized JSON student records.
 */

import * as XLSX from "xlsx";
import {
  getSectionsForClass,
  normalizeSectionName,
  formatClassDisplay,
  normalizeClassLabel,
  getSchoolDataColumns,
  normalizeColumnLabel
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

/**
 * Expected schema definitions for each dataset
 */
export const DATASET_SCHEMAS = {
  [DATASET_KEYS.UDISE]: {
    label: "UDISE",
    uniqueIdField: "penNo",
    uniqueIdLabel: "Student PEN",
    requiredHeaders: [
      { key: "className", label: "Class", aliases: ["class", "grade", "standard"] },
      { key: "studentName", label: "Name", aliases: ["name", "student name"] },
      { key: "gender", label: "Gender", aliases: ["gender", "sex"] },
      { key: "penNo", label: "Student PEN", aliases: ["student pen", "pen", "pen no", "pen number"] },
      { key: "fatherName", label: "Father Name", aliases: ["father name", "father's name", "father"] },
      { key: "category", label: "Social Category", aliases: ["social category", "category", "caste category"] }
    ],
    optionalHeaders: [
      { key: "motherName", label: "Mother Name", aliases: ["mother name", "mother's name", "mother"] },
      { key: "address", label: "Address", aliases: ["address", "residential address", "student address"] }
    ]
  },
  [DATASET_KEYS.THREE_POINT_ZERO]: {
    label: "3.0",
    uniqueIdField: "samagraId",
    uniqueIdLabel: "Samagra ID",
    requiredHeaders: [
      { key: "className", label: "Class", aliases: ["class", "grade", "standard"] },
      { key: "samagraId", label: "Samagra ID", aliases: ["samagra id", "samagra", "samagra member id", "samagra_id"] },
      { key: "studentName", label: "Student Name", aliases: ["student name", "name"] },
      { key: "fatherName", label: "Father Name", aliases: ["father name", "father's name", "father"] },
      { key: "category", label: "Category", aliases: ["category", "social category"] },
      { key: "gender", label: "Gender", aliases: ["gender", "sex"] }
    ],
    optionalHeaders: [
      { key: "motherName", label: "Mother Name", aliases: ["mother name", "mother's name", "mother"] },
      { key: "address", label: "Address", aliases: ["address", "residential address", "student address"] }
    ]
  },
  [DATASET_KEYS.SCHOOL_DATA]: {
    label: "School Data",
    uniqueIdField: "scholarNo",
    uniqueIdLabel: "Scholar No / Admission No",
    requiredHeaders: [
      { key: "className", label: "Class", aliases: ["class", "grade", "standard"] },
      { key: "studentName", label: "Student Name", aliases: ["student name", "name"] },
      { key: "fatherName", label: "Father Name", aliases: ["father name", "father's name", "father"] },
      { key: "gender", label: "Gender", aliases: ["gender", "sex"] },
      { key: "category", label: "Category", aliases: ["category", "social category"] },
      { key: "scholarNo", label: "Scholar No", aliases: ["scholar no", "scholar number", "admission no", "admission number", "roll no", "student id", "id"] }
    ],
    optionalHeaders: [
      { key: "section", label: "Section", aliases: ["section", "sec"] },
      { key: "motherName", label: "Mother Name", aliases: ["mother name", "mother's name", "mother"] },
      { key: "address", label: "Address", aliases: ["address", "residential address", "student address"] }
    ]
  }
};

export const ROMAN_TO_NUMERIC_CLASS = {
  "I": "1",
  "II": "2",
  "III": "3",
  "IV": "4",
  "V": "5",
  "VI": "6",
  "VII": "7",
  "VIII": "8",
  "IX": "9",
  "X": "10",
  "XI": "11",
  "XII": "12"
};

/**
 * Normalizes class value:
 * - Roman numerals ("I", "IV", "XII", "Class IV", etc.) -> numeric string ("1", "4", "12")
 * - Numeric values ("1", 10, "Class 10") -> numeric string ("1", "10")
 * - Non-Roman, non-numeric values ("Nursery", "LKG", "UKG") -> preserved as-is
 */
export function normalizeClassValue(rawVal) {
  if (rawVal === null || rawVal === undefined) return "Unassigned";
  const str = String(rawVal).trim();
  if (!str) return "Unassigned";

  // Check if purely numeric (e.g. 1, "1", "01", 10)
  if (/^\d+$/.test(str)) {
    return String(parseInt(str, 10));
  }

  // Check for common prefixes like "Class 5", "Grade IV", "Std. 10"
  const prefixMatch = str.match(/^(?:class|std\.?|standard|grade)\s+(.+)$/i);
  const coreVal = prefixMatch ? prefixMatch[1].trim() : str;

  // Check core value for purely numeric
  if (/^\d+$/.test(coreVal)) {
    return String(parseInt(coreVal, 10));
  }

  // Check Roman numerals (case-insensitive)
  const upper = coreVal.toUpperCase();
  if (ROMAN_TO_NUMERIC_CLASS[upper]) {
    return ROMAN_TO_NUMERIC_CLASS[upper];
  }

  // Preserve non-Roman, non-numeric values (e.g., Nursery, LKG, UKG)
  return str;
}

/**
 * Clean & normalize a string header
 */
function normalizeHeader(str) {
  if (!str) return "";
  return String(str).trim().toLowerCase().replace(/[\s_\-]+/g, " ");
}

/**
 * Normalizes human-readable student text:
 * 1. Preserves null, undefined, or empty/blank values without converting to "NULL"/"UNDEFINED"
 * 2. Trims leading and trailing whitespace
 * 3. Collapses multiple consecutive whitespace characters to a single space
 * 4. Converts the final string to UPPERCASE
 *
 * @param {*} val
 * @returns {string|*} Normalized uppercase string or original non-string/falsy value
 */
export function normalizeStudentText(val) {
  if (val === null || val === undefined) return val;
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\s+/g, " ").toUpperCase();
}

/**
 * Identifier and system fields that must NEVER be modified or uppercased
 */
export const PRESERVED_STUDENT_FIELDS = new Set([
  "id",
  "schoolId",
  "dataset",
  "className",
  "section",
  "penNo",
  "udiseId",
  "samagraId",
  "samagraMemberId",
  "scholarNo",
  "rollNo",
  "dob",
  "mobile",
  "phone",
  "aadhaarNo",
  "rawRowIndex",
  "status",
  "createdAt",
  "updatedAt",
  "uploadedAt",
  "uploadedBy",
  "email",
  "uid",
  "firebaseUid"
]);

/**
 * Normalizes an entire student record:
 * Converts applicable human-readable text fields (studentName, fatherName, motherName, address,
 * gender, category, etc.) to uppercase and collapses extra whitespace, while strictly
 * preserving IDs, system fields, class values, and non-string types.
 *
 * @param {Object} record
 * @returns {Object} Normalized copy of the student record
 */
export function normalizeStudentRecord(record) {
  if (!record || typeof record !== "object") return record;

  const normalized = { ...record };

  for (const [key, value] of Object.entries(normalized)) {
    // Never modify preserved fields (IDs, class values, system metadata)
    if (PRESERVED_STUDENT_FIELDS.has(key)) {
      continue;
    }

    // Normalize human-readable text fields
    if (typeof value === "string") {
      normalized[key] = normalizeStudentText(value);
    }
  }

  return normalized;
}

/**
 * Centralized dataset normalization utility for student datasets (School Data, UDISE, 3.0)
 * Normalizes all student records in an array before database storage.
 *
 * @param {Array<Object>} students
 * @returns {Array<Object>} Normalized student array
 */
export function normalizeStudentDataset(students) {
  if (!Array.isArray(students)) return [];
  return students.map(st => normalizeStudentRecord(st));
}

/**
 * Clean gender value to canonical uppercase forms ("BOY", "GIRL", or trimmed uppercase value)
 */
export function normalizeGender(val) {
  if (val === null || val === undefined) return "UNSPECIFIED";
  const g = String(val).trim().toLowerCase();
  if (g === "boy" || g === "male" || g === "m" || g === "b") return "BOY";
  if (g === "girl" || g === "female" || g === "f" || g === "g") return "GIRL";
  const norm = normalizeStudentText(String(val));
  return norm || "UNSPECIFIED";
}

/**
 * Clean category value to standard uppercase ("GEN", "OBC", "SC", "ST", etc.)
 */
export function normalizeCategory(val) {
  if (val === null || val === undefined) return "GEN";
  const c = normalizeStudentText(String(val));
  if (!c) return "GEN";
  if (c.includes("GEN") || c.includes("UR")) return "GEN";
  if (c.includes("OBC")) return "OBC";
  if (c.includes("SC")) return "SC";
  if (c.includes("ST")) return "ST";
  return c;
}

/**
 * Parse and validate an Excel file buffer for the selected dataset
 * @param {File} file - Browser File object
 * @param {string} datasetKey - One of DATASET_KEYS
 * @param {string} schoolId - Current school identifier
 * @returns {Promise<{ valid: boolean, error?: string, students?: Array, recordCount?: number, warnings?: Array, fileName?: string }>}
 */
export async function parseAndValidateExcel(file, datasetKey, schoolId, options = {}) {
  if (!file) {
    return { valid: false, error: "No file selected. Please choose an Excel file." };
  }

  // 1. Validate file extension
  const fileName = file.name || "";
  const ext = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
  if (ext !== ".xlsx" && ext !== ".xls") {
    return { valid: false, error: `Invalid file format (${ext || "unknown"}). Only Excel files (.xlsx, .xls) are supported.` };
  }

  if (file.size === 0) {
    return { valid: false, error: "The selected Excel file is empty (0 bytes)." };
  }

  const schema = DATASET_SCHEMAS[datasetKey];
  if (!schema) {
    return { valid: false, error: `Unknown dataset type: ${datasetKey}` };
  }

  let workbook;
  try {
    const arrayBuffer = await file.arrayBuffer();
    workbook = XLSX.read(arrayBuffer, { type: "array" });
  } catch (err) {
    console.error("Excel read error:", err);
    return { valid: false, error: `Failed to read Excel file. The file may be corrupted or password-protected (${err.message}).` };
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return { valid: false, error: "The Excel workbook contains no visible sheets." };
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    return { valid: false, error: "The first sheet in the Excel file could not be read." };
  }

  // Convert sheet to array of rows (first row is headers)
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
  if (!rows || rows.length === 0) {
    return { valid: false, error: "The Excel sheet has no data rows." };
  }

  // Find the header row (first non-empty row)
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const nonBlankCount = rows[i].filter(cell => String(cell).trim().length > 0).length;
    if (nonBlankCount >= 3) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    return { valid: false, error: "Could not find valid column headers in the first 10 rows of the sheet." };
  }

  const rawHeaders = rows[headerRowIndex].map(h => String(h || "").trim());
  const normalizedHeaders = rawHeaders.map(normalizeHeader);

  // 2. Validate required columns
  const columnMapping = {}; // schemaKey -> columnIndex
  const missingHeaders = [];

  schema.requiredHeaders.forEach(req => {
    let matchIdx = -1;
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const h = normalizedHeaders[i];
      if (req.aliases.some(alias => h === alias || h.includes(alias))) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx !== -1) {
      columnMapping[req.key] = matchIdx;
    } else {
      missingHeaders.push(req.label);
    }
  });

  // Map optional columns if present
  if (Array.isArray(schema.optionalHeaders)) {
    schema.optionalHeaders.forEach(opt => {
      let matchIdx = -1;
      for (let i = 0; i < normalizedHeaders.length; i++) {
        const h = normalizedHeaders[i];
        if (opt.aliases.some(alias => h === alias || h.includes(alias))) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx !== -1) {
        columnMapping[opt.key] = matchIdx;
      }
    });
  }

  // Map dynamic custom School Data columns if configured
  const customColumnMapping = {}; // columnId -> colIndex
  if (datasetKey === DATASET_KEYS.SCHOOL_DATA && options.school) {
    const configuredSchoolCols = getSchoolDataColumns(options.school);
    configuredSchoolCols.forEach(scCol => {
      const targetNorm = normalizeColumnLabel(scCol.label);
      for (let i = 0; i < normalizedHeaders.length; i++) {
        const h = normalizedHeaders[i];
        if (normalizeColumnLabel(h) === targetNorm || h === targetNorm) {
          customColumnMapping[scCol.columnId] = i;
          break;
        }
      }
    });
  }

  if (missingHeaders.length > 0) {
    return {
      valid: false,
      error: `Upload failed because the ${schema.label} Excel file is missing required column${missingHeaders.length > 1 ? 's' : ''}: ${missingHeaders.map(h => `'${h}'`).join(', ')}.`
    };
  }

  // 3. Process and sanitize data rows
  const students = [];
  const warnings = [];
  const seenUniqueIds = new Set();
  let duplicateCount = 0;
  let emptyRowCounter = 0;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) {
      emptyRowCounter++;
      continue;
    }

    // Check if the entire row is blank
    const hasAnyContent = row.some(c => String(c).trim().length > 0);
    if (!hasAnyContent) {
      emptyRowCounter++;
      continue;
    }

    // Extract mapped fields
    const getVal = (key) => {
      const colIdx = columnMapping[key];
      return colIdx !== undefined && row[colIdx] !== undefined ? String(row[colIdx]).trim() : "";
    };

    const studentName = normalizeStudentText(getVal("studentName"));
    const className = normalizeClassValue(getVal("className"));
    const fatherName = normalizeStudentText(getVal("fatherName"));
    const motherName = normalizeStudentText(getVal("motherName"));
    const address = normalizeStudentText(getVal("address"));
    const gender = normalizeGender(getVal("gender"));
    const category = normalizeCategory(getVal("category"));

    // Extract unique identifier
    const uniqueIdRaw = getVal(schema.uniqueIdField);
    const uniqueId = uniqueIdRaw ? String(uniqueIdRaw).trim() : "";

    // Skip row if it has no name and no unique ID (garbage row)
    if (!studentName && !uniqueId) {
      emptyRowCounter++;
      continue;
    }

    // If missing unique identifier, generate a fallback or flag
    if (!uniqueId) {
      warnings.push(`Row ${r + 1}: Missing ${schema.uniqueIdLabel} for student "${studentName || 'Unknown'}".`);
    }

    // Handle duplicates
    if (uniqueId && seenUniqueIds.has(uniqueId)) {
      duplicateCount++;
      warnings.push(`Row ${r + 1}: Duplicate ${schema.uniqueIdLabel} '${uniqueId}' detected. Existing entry was updated.`);
      const existingIdx = students.findIndex(s => (s[schema.uniqueIdField] || s.id) === uniqueId);
      if (existingIdx !== -1) {
        students.splice(existingIdx, 1);
      }
    }
    if (uniqueId) seenUniqueIds.add(uniqueId);

    // Build standardized student record compatible with School Portal analytics & filters
    const student = {
      id: `${datasetKey.substring(0, 2).toUpperCase()}-${schoolId}-${uniqueId || (r + 1)}`,
      schoolId,
      dataset: datasetKey,
      studentName: studentName || "UNNAMED STUDENT",
      className,
      fatherName: fatherName || "—",
      gender,
      category,
      rawRowIndex: r + 1
    };

    if (motherName) student.motherName = motherName;
    if (address) student.address = address;

    // Populate dataset-specific fields
    if (datasetKey === DATASET_KEYS.UDISE) {
      student.penNo = uniqueId;
      student.udiseId = uniqueId;
    } else if (datasetKey === DATASET_KEYS.THREE_POINT_ZERO) {
      student.samagraId = uniqueId;
      student.samagraMemberId = uniqueId;
    } else if (datasetKey === DATASET_KEYS.SCHOOL_DATA) {
      student.scholarNo = uniqueId;
      student.rollNo = String(students.length + 1).padStart(2, "0");
      student.status = "Active";

      // Dynamically populate custom fields based on school configuration
      if (options.school) {
        student.customFields = student.customFields || {};
        const configuredSchoolCols = getSchoolDataColumns(options.school);
        configuredSchoolCols.forEach(scCol => {
          const colIdx = customColumnMapping[scCol.columnId];
          if (colIdx !== undefined && row[colIdx] !== undefined) {
            const rawVal = String(row[colIdx]).trim();
            if (rawVal) {
              const cleanedVal = normalizeStudentText(rawVal);
              student.customFields[scCol.columnId] = cleanedVal;
              // Backwards-compatibility for standard legacy keys
              if (["fatherName", "motherName", "dob", "mobile", "address", "rollNo"].includes(scCol.columnId)) {
                student[scCol.columnId] = cleanedVal;
              }
            }
          }
        });
      }

      const rawSection = getVal("section");
      const section = normalizeSectionName(rawSection);

      if (section && options.school?.sectionsEnabled) {
        const configuredSections = getSectionsForClass(options.school, className);
        if (configuredSections.length > 0) {
          const isConfigured = configuredSections.some((s) => s.toUpperCase() === section.toUpperCase());
          if (!isConfigured) {
            warnings.push(`Row ${r + 1}: Section "${section}" is not configured for Class ${formatClassDisplay(className)}. Section was omitted.`);
          } else {
            student.section = section;
          }
        } else {
          warnings.push(`Row ${r + 1}: Class ${formatClassDisplay(className)} has no configured sections. Section "${section}" was omitted.`);
        }
      }
    }

    // Apply centralized record normalization to ensure uppercase text and clean whitespace
    students.push(normalizeStudentRecord(student));
  }

  if (students.length === 0) {
    return { valid: false, error: "The Excel file contained no valid student records after header parsing." };
  }

  if (duplicateCount > 0) {
    warnings.push(`Handled ${duplicateCount} duplicate records by preserving the latest row entry.`);
  }

  return {
    valid: true,
    datasetKey,
    datasetLabel: schema.label,
    recordCount: students.length,
    students,
    warnings: warnings.slice(0, 10),
    fileName
  };
}
