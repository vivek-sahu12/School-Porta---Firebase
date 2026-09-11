/**
 * Excel Export Service for School Data Portal
 * Exports current view / result set into clean, formatted .xlsx spreadsheet
 * with zero Firebase requests, automatic S.No generation, dataset schema preservation,
 * and professional column sizing.
 */

import * as XLSX from "xlsx";
import {
  formatClassDisplay,
  getSchoolDataColumns,
  getStudentFieldValue
} from "../school-config.js";
import { DATASET_KEYS } from "./student-service.js";

/**
 * Canonical dataset schemas for Excel export (First column is always S.No)
 */
export const EXCEL_DATASET_SCHEMAS = {
  [DATASET_KEYS.SCHOOL_DATA]: [
    { key: "scholarNo", label: "Scholar No", wch: 16, getValue: (st) => st.scholarNo || "" },
    { key: "studentName", label: "Student Name", wch: 28, getValue: (st) => st.studentName || "" },
    { key: "className", label: "Class", wch: 12, getValue: (st) => formatClassDisplay(st.className) },
    { key: "gender", label: "Gender", wch: 12, getValue: (st) => st.gender || "" },
    { key: "category", label: "Category", wch: 14, getValue: (st) => st.category || "" },
    { key: "fatherName", label: "Father Name", wch: 28, getValue: (st) => st.fatherName || "" }
  ],
  [DATASET_KEYS.UDISE]: [
    { key: "className", label: "Class", wch: 12, getValue: (st) => formatClassDisplay(st.className) },
    { key: "studentName", label: "Name", wch: 28, getValue: (st) => st.studentName || "" },
    { key: "gender", label: "Gender", wch: 12, getValue: (st) => st.gender || "" },
    { key: "penNo", label: "Student PEN", wch: 20, getValue: (st) => st.penNo || st.udiseId || "" },
    { key: "fatherName", label: "Father Name", wch: 28, getValue: (st) => st.fatherName || "" },
    { key: "category", label: "Social Category", wch: 16, getValue: (st) => st.category || "" }
  ],
  [DATASET_KEYS.THREE_POINT_ZERO]: [
    { key: "className", label: "Class", wch: 12, getValue: (st) => formatClassDisplay(st.className) },
    { key: "samagraId", label: "Samagra ID", wch: 18, getValue: (st) => st.samagraId || st.samagraMemberId || "" },
    { key: "studentName", label: "Student Name", wch: 28, getValue: (st) => st.studentName || "" },
    { key: "fatherName", label: "Father Name", wch: 28, getValue: (st) => st.fatherName || "" },
    { key: "category", label: "Category", wch: 14, getValue: (st) => st.category || "" },
    { key: "gender", label: "Gender", wch: 12, getValue: (st) => st.gender || "" }
  ]
};

/**
 * Generate Excel filename in format: SCHOOLID_DDMMYYYY_HHMMSS.xlsx
 * Uses 24-hour format and no filesystem-unsafe characters.
 */
export function generateExcelFilename(schoolId = "SCH", date = new Date()) {
  const cleanId = String(schoolId || "SCH").trim().replace(/[^a-zA-Z0-9_-]/g, "") || "SCH";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${cleanId}_${dd}${mm}${yyyy}_${hh}${min}${ss}.xlsx`;
}

/**
 * Generate and download an Excel workbook from the current student result set
 *
 * @param {Object} options
 * @param {Object} options.school - School entity { schoolId, schoolName }
 * @param {string} options.datasetKey - Dataset identifier (school_data, udise, three_point_zero)
 * @param {Array} options.students - Array of students in current view/filter
 * @param {boolean} [options.isAuthorized=true] - Authorization guard flag
 * @returns {Promise<{ success: boolean, filename?: string, error?: string }>}
 */
export async function generateStudentListExcel({ school = {}, datasetKey, students = [], isAuthorized = true } = {}) {
  try {
    if (isAuthorized === false) {
      return { success: false, error: "Unauthorized: Excel export permission is required." };
    }

    if (!students || students.length === 0) {
      return { success: false, error: "No students available to export." };
    }

    const schoolId = school.schoolId || "SCH";
    let schemaColumns = [];

    if (datasetKey === DATASET_KEYS.SCHOOL_DATA) {
      const schoolCols = getSchoolDataColumns(school);
      schemaColumns = schoolCols.map(col => ({
        key: col.columnId,
        label: col.label,
        wch: col.type === "text" ? 24 : 14,
        getValue: (st) => {
          if (col.columnId === "className") {
            return formatClassDisplay(st.className);
          }
          return getStudentFieldValue(st, col);
        }
      }));
    } else {
      schemaColumns = [...(EXCEL_DATASET_SCHEMAS[datasetKey] || EXCEL_DATASET_SCHEMAS[DATASET_KEYS.SCHOOL_DATA])];
    }

    // 1. Build Header Row: S.No first, followed by all canonical dataset columns
    const headerRow = ["S.No.", ...schemaColumns.map(col => col.label)];

    // 2. Build Data Rows: S.No (1-based), followed by mapped field values
    const dataRows = students.map((st, idx) => {
      const sNo = idx + 1;
      const values = schemaColumns.map(col => {
        const val = col.getValue(st);
        if (val === null || val === undefined) return "";
        // Strip HTML if any search highlights exist
        return String(val).replace(/<[^>]*>/g, "").trim();
      });
      return [sNo, ...values];
    });

    const sheetData = [headerRow, ...dataRows];

    // 3. Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // 4. Set sensible column widths (!cols)
    const colWidths = [
      { wch: 8 }, // S.No
      ...schemaColumns.map(col => ({ wch: col.wch || 16 }))
    ];
    ws["!cols"] = colWidths;

    // 5. Create workbook and append sheet
    const wb = XLSX.utils.book_new();
    const sheetName = "Students";
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // 6. Generate filename and trigger browser download
    const filename = generateExcelFilename(schoolId);
    XLSX.writeFile(wb, filename);

    return { success: true, filename };
  } catch (err) {
    console.error("Excel generation error:", err);
    return { success: false, error: err.message || "Failed to generate Excel." };
  }
}
