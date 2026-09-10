/**
 * Automated test suite for PDF Column Selection Popup and Dynamic Column PDF Generator
 */
import assert from "node:assert";
import {
  DATASET_COLUMN_DEFS,
  MAX_USER_COLUMNS,
  loadSavedColumnConfig,
  saveColumnConfig
} from "../js/school/pdf-column-modal.js";
import { DATASET_KEYS } from "../js/school/student-service.js";
import {
  generateStudentListPdf,
  determineTableOrientation,
  generatePdfFilename
} from "../js/school/pdf-service.js";

// Mock localStorage for Node test environment
const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => { mockStorage[key] = String(val); },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { for (const k in mockStorage) delete mockStorage[k]; }
};

console.log("=== TEST 1: Dataset Column Definitions ===");
{
  assert.strictEqual(MAX_USER_COLUMNS, 7, "Max user columns must be 7");

  const udiseDefs = DATASET_COLUMN_DEFS[DATASET_KEYS.UDISE];
  const p3Defs = DATASET_COLUMN_DEFS[DATASET_KEYS.THREE_POINT_ZERO];
  const sdDefs = DATASET_COLUMN_DEFS[DATASET_KEYS.SCHOOL_DATA];

  assert(udiseDefs.some(d => d.key === "penNo" && d.label === "Student PEN"), "UDISE contains Student PEN");
  assert(p3Defs.some(d => d.key === "samagraId" && d.label === "Samagra ID"), "3.0 contains Samagra ID");
  assert(sdDefs.some(d => d.key === "scholarNo" && d.label === "Scholar No"), "School Data contains Scholar No");

  console.log("✓ Dataset column definitions are verified!");
}

console.log("\n=== TEST 2: Local Persistence & Default Config ===");
{
  // Default config when nothing saved
  const defaultUdise = loadSavedColumnConfig(DATASET_KEYS.UDISE);
  console.log("Default UDISE config:", defaultUdise.map(c => c.key));
  assert.strictEqual(defaultUdise.length, 6, "UDISE has 6 default columns");

  // Save custom configuration with a blank column
  const customConfig = [
    { type: "field", key: "className" },
    { type: "field", key: "studentName" },
    { type: "blank", id: "b_test_1" },
    { type: "field", key: "gender" }
  ];
  saveColumnConfig(DATASET_KEYS.UDISE, customConfig);

  const restored = loadSavedColumnConfig(DATASET_KEYS.UDISE);
  console.log("Restored UDISE config:", restored);
  assert.strictEqual(restored.length, 4, "Restored config should have 4 items");
  assert.strictEqual(restored[2].type, "blank", "Position 3 should be blank column");
  assert.strictEqual(restored[3].key, "gender", "Position 4 should be gender");

  // Verify dataset isolation: 3.0 should not be affected by UDISE saved config
  const p3Config = loadSavedColumnConfig(DATASET_KEYS.THREE_POINT_ZERO);
  assert.strictEqual(p3Config.length, 6, "3.0 retains its own 6 default columns");
  console.log("✓ Local persistence and dataset isolation verified!");
}

console.log("\n=== TEST 3: Dynamic Orientation Decision ===");
{
  // 1. Compact selection (e.g. Class, Name, Gender) -> should be portrait
  const compactCols = [
    { type: "field", key: "className" },
    { type: "field", key: "studentName" },
    { type: "field", key: "gender" }
  ];
  const orientCompact = determineTableOrientation(DATASET_KEYS.SCHOOL_DATA, compactCols);
  console.log("Compact columns orientation:", orientCompact);
  assert.strictEqual(orientCompact, "portrait", "Compact columns fit portrait");

  // 2. Wide selection (7 columns including PEN, Samagra, Names) -> should be landscape
  const wideCols = [
    { type: "field", key: "className" },
    { type: "field", key: "samagraId" },
    { type: "field", key: "studentName" },
    { type: "field", key: "fatherName" },
    { type: "field", key: "category" },
    { type: "field", key: "gender" },
    { type: "blank" }
  ];
  const orientWide = determineTableOrientation(DATASET_KEYS.THREE_POINT_ZERO, wideCols);
  console.log("Wide columns orientation:", orientWide);
  assert.strictEqual(orientWide, "landscape", "Wide columns trigger landscape");
  console.log("✓ Dynamic orientation decision verified!");
}

console.log("\n=== TEST 4: Real PDF Generation with Custom Columns & Blank Column ===");
{
  const mockSchool = { schoolId: "SCH9988", schoolName: "Springfield Academy" };
  const mockStudents = [
    { id: "1", studentName: "Aarav Sharma", fatherName: "Rajesh Sharma", className: "5", gender: "Boy", category: "GEN", penNo: "PEN12345678" },
    { id: "2", studentName: "Bhavna Patel", fatherName: "Suresh Patel", className: "5", gender: "Girl", category: "OBC", penNo: "PEN87654321" }
  ];

  // User selects: 1. Gender, 2. Student Name, 3. Blank Column, 4. Class
  const customSequence = [
    { type: "field", key: "gender" },
    { type: "field", key: "studentName" },
    { type: "blank" },
    { type: "field", key: "className" }
  ];

  const result = await generateStudentListPdf({
    school: mockSchool,
    datasetKey: DATASET_KEYS.UDISE,
    students: mockStudents,
    columnConfig: customSequence
  });

  console.log("PDF generation result:", result);
  assert(result.success, "PDF generation must succeed");
  assert(result.filename.startsWith("SCH9988_"), "Filename starts with schoolId");
  assert(result.filename.endsWith(".pdf"), "Filename ends with .pdf");
  console.log("✓ PDF generation with custom sequence & blank column succeeded!");
}

console.log("\n=== TEST 5: Maximum 7 Columns Test (6 fields + 1 blank) ===");
{
  const mockSchool = { schoolId: "SCH1025", schoolName: "Delhi Public School" };
  const mockStudents = [
    { id: "1", scholarNo: "SCH-001", studentName: "Ananya Gupta", className: "1", gender: "Girl", category: "GEN", fatherName: "Manoj Gupta" }
  ];

  // Exactly 7 user columns: 6 data fields + 1 blank
  const sevenCols = [
    { type: "field", key: "className" },
    { type: "field", key: "studentName" },
    { type: "field", key: "fatherName" },
    { type: "field", key: "gender" },
    { type: "field", key: "scholarNo" },
    { type: "field", key: "category" },
    { type: "blank" }
  ];

  const result7 = await generateStudentListPdf({
    school: mockSchool,
    datasetKey: DATASET_KEYS.SCHOOL_DATA,
    students: mockStudents,
    columnConfig: sevenCols
  });

  assert(result7.success, "7-column PDF generation must succeed");
  console.log("Generated 7-column PDF:", result7.filename);
  console.log("✓ 7 user columns + automatic S.No test passed!");
}

console.log("\nALL TESTS PASSED 100%!");
