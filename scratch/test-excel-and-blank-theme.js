/**
 * Automated Test Suite for Excel Export, Confirmation Formatting & PDF Blank Theme
 */

import assert from "assert";
import * as XLSX from "xlsx";
import { 
  EXCEL_DATASET_SCHEMAS, 
  generateExcelFilename 
} from "../js/school/excel-service.js";
import { formatExportContext } from "../js/school/excel-confirm-modal.js";
import { DATASET_KEYS } from "../js/school/student-service.js";
import { formatClassDisplay } from "../js/school-config.js";

console.log("=== TEST 1: Excel Dataset Schemas & Column Order ===");
// Verify School Data
const sdCols = EXCEL_DATASET_SCHEMAS[DATASET_KEYS.SCHOOL_DATA];
assert.strictEqual(sdCols[0].key, "scholarNo");
assert.strictEqual(sdCols[1].key, "studentName");
assert.strictEqual(sdCols[2].key, "className");
assert.strictEqual(sdCols[3].key, "gender");
assert.strictEqual(sdCols[4].key, "category");
assert.strictEqual(sdCols[5].key, "fatherName");
console.log("✓ School Data schema verified: Scholar No -> Name -> Class -> Gender -> Category -> Father Name");

// Verify UDISE
const udiseCols = EXCEL_DATASET_SCHEMAS[DATASET_KEYS.UDISE];
assert.strictEqual(udiseCols[0].key, "className");
assert.strictEqual(udiseCols[1].key, "studentName");
assert.strictEqual(udiseCols[2].key, "gender");
assert.strictEqual(udiseCols[3].key, "penNo");
assert.strictEqual(udiseCols[4].key, "fatherName");
assert.strictEqual(udiseCols[5].key, "category");
console.log("✓ UDISE schema verified: Class -> Name -> Gender -> Student PEN -> Father Name -> Social Category");

// Verify 3.0
const tpzCols = EXCEL_DATASET_SCHEMAS[DATASET_KEYS.THREE_POINT_ZERO];
assert.strictEqual(tpzCols[0].key, "className");
assert.strictEqual(tpzCols[1].key, "samagraId");
assert.strictEqual(tpzCols[2].key, "studentName");
assert.strictEqual(tpzCols[3].key, "fatherName");
assert.strictEqual(tpzCols[4].key, "category");
assert.strictEqual(tpzCols[5].key, "gender");
console.log("✓ 3.0 schema verified: Class -> Samagra ID -> Name -> Father Name -> Category -> Gender");

console.log("\n=== TEST 2: Context Formatting for Confirmation Modal ===");
// Nursery
const ctx1 = formatExportContext({ className: "Nursery" }, 42);
assert.strictEqual(ctx1, "Nursery • 42 Students");
console.log("✓ Nursery context:", ctx1);

// Class 5 + Female
const ctx2 = formatExportContext({ className: "5", gender: "Girl" }, 18);
assert.strictEqual(ctx2, "Class 5 • Female • 18 Students");
console.log("✓ Class 5 + Female context:", ctx2);

// Search results
const ctx3 = formatExportContext({ search: "Vikram" }, 12);
assert.strictEqual(ctx3, "Search results • 12 Students");
console.log("✓ Search context:", ctx3);

// Search results + Class 5
const ctx4 = formatExportContext({ search: "Sharma", className: "Class 5" }, 7);
assert.strictEqual(ctx4, "Search results • Class 5 • 7 Students");
console.log("✓ Search + Class context:", ctx4);

// All Students
const ctx5 = formatExportContext({}, 1);
assert.strictEqual(ctx5, "All Students • 1 Student");
console.log("✓ All Students context:", ctx5);

console.log("\n=== TEST 3: Excel Filename Generation ===");
const fname = generateExcelFilename("SCH1025", new Date(2026, 8, 10, 15, 42, 8));
assert.strictEqual(fname, "SCH1025_10092026_154208.xlsx");
console.log("✓ Excel filename format matches exactly:", fname);

console.log("\n=== TEST 4: Real Excel Workbook Construction & Content ===");
const sampleStudents = [
  { scholarNo: "101", studentName: "Aarav Sharma", className: "5", gender: "Boy", category: "GEN", fatherName: "Rajesh Sharma" },
  { scholarNo: "102", studentName: "Diya Verma", className: "5", gender: "Girl", category: "OBC", fatherName: "Manoj Verma" }
];

const headerRow = ["S.No.", ...sdCols.map(col => col.label)];
const dataRows = sampleStudents.map((st, idx) => [
  idx + 1,
  ...sdCols.map(col => col.getValue(st))
]);

const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
ws["!cols"] = [{ wch: 8 }, ...sdCols.map(c => ({ wch: c.wch }))];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Students");

const outputPath = "scratch/test-generated.xlsx";
XLSX.writeFile(wb, outputPath);

import fs from "fs";
const fileBuf = fs.readFileSync(outputPath);
const readWb = XLSX.read(fileBuf, { type: "buffer" });
const readSheet = readWb.Sheets["Students"];
const parsedJson = XLSX.utils.sheet_to_json(readSheet);

assert.strictEqual(parsedJson.length, 2);
assert.strictEqual(parsedJson[0]["S.No."], 1);
assert.strictEqual(parsedJson[0]["Scholar No"], "101");
assert.strictEqual(parsedJson[0]["Student Name"], "Aarav Sharma");
assert.strictEqual(parsedJson[0]["Class"], "Class 5"); // verify formatClassDisplay applied
assert.strictEqual(parsedJson[1]["S.No."], 2);
assert.strictEqual(parsedJson[1]["Scholar No"], "102");
assert.strictEqual(parsedJson[1]["Student Name"], "Diya Verma");
assert.strictEqual(parsedJson[1]["Class"], "Class 5");
console.log("✓ Real Excel file created and validated with S.No. and Class 5 formatting!");

console.log("\nALL TESTS PASSED 100%!");
