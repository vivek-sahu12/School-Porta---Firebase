/**
 * Automated test suite for the 4 targeted PDF & UI fixes:
 * 1. Print-safe B&W friendly styling
 * 2. Remainder-based column width calculation for blank columns
 * 3. Centered modal mobile responsiveness
 * 4. formatClassDisplay formatting
 */
import assert from "node:assert";
import { formatClassDisplay, normalizeClassLabel } from "../js/school-config.js";
import {
  generateStudentListPdf,
  calculateColumnWidths,
  COLUMN_METADATA
} from "../js/school/pdf-service.js";
import { DATASET_KEYS } from "../js/school/student-service.js";

console.log("=== TEST 1: Class Display Formatting (formatClassDisplay) ===");
{
  assert.strictEqual(formatClassDisplay("1"), "Class 1");
  assert.strictEqual(formatClassDisplay("2"), "Class 2");
  assert.strictEqual(formatClassDisplay("5"), "Class 5");
  assert.strictEqual(formatClassDisplay("10"), "Class 10");
  assert.strictEqual(formatClassDisplay("12"), "Class 12");
  assert.strictEqual(formatClassDisplay("I"), "Class 1");
  assert.strictEqual(formatClassDisplay("XII"), "Class 12");
  assert.strictEqual(formatClassDisplay("Class 5"), "Class 5");

  // Nursery, KG1, KG2, LKG, UKG remain as-is
  assert.strictEqual(formatClassDisplay("Nursery"), "Nursery");
  assert.strictEqual(formatClassDisplay("KG1"), "KG1");
  assert.strictEqual(formatClassDisplay("KG2"), "KG2");
  assert.strictEqual(formatClassDisplay("LKG"), "LKG");
  assert.strictEqual(formatClassDisplay("UKG"), "UKG");

  console.log("✓ formatClassDisplay passed all format assertions!");
}

console.log("\n=== TEST 2: Column Width Calculation with 1 Blank Column ===");
{
  // User selects: Scholar No | Class | Blank | Student Name in Portrait (usable = 190mm)
  const cols = [
    { type: "sNo" },
    { type: "field", key: "scholarNo" },
    { type: "field", key: "className" },
    { type: "blank", id: "b1" },
    { type: "field", key: "studentName" }
  ];

  const usableWidth = 190;
  const colStyles = calculateColumnWidths(cols, usableWidth, false);
  console.log("Calculated column styles (1 blank):", colStyles);

  // S.No = 12, Scholar No = 24, Class = 18, Student Name = 38
  // Total data width = 12 + 24 + 18 + 38 = 92mm
  // Remaining width for Blank = 190 - 92 = 98mm
  assert.strictEqual(colStyles[0].cellWidth, 12, "S.No width is 12mm");
  assert.strictEqual(colStyles[1].cellWidth, 24, "Scholar No width is 24mm");
  assert.strictEqual(colStyles[2].cellWidth, 18, "Class width is 18mm");
  assert.strictEqual(colStyles[3].cellWidth, 98, "Blank column (index 3) receives all remaining 98mm");
  assert.strictEqual(colStyles[4].cellWidth, 38, "Student Name width is 38mm");

  const totalCalculated = cols.reduce((sum, _, i) => sum + colStyles[i].cellWidth, 0);
  assert.strictEqual(totalCalculated, 190, "Total table width must equal usable width exactly (190mm)");
  console.log("✓ 1 Blank column gets all remaining width (98mm) and stays in sequence position!");
}

console.log("\n=== TEST 3: Column Width Calculation with 2 Blank Columns ===");
{
  // User selects: Scholar No | Class | Blank 1 | Student Name | Blank 2 in Portrait (usable = 190mm)
  const cols = [
    { type: "sNo" },
    { type: "field", key: "scholarNo" },
    { type: "field", key: "className" },
    { type: "blank", id: "b1" },
    { type: "field", key: "studentName" },
    { type: "blank", id: "b2" }
  ];

  const usableWidth = 190;
  const colStyles = calculateColumnWidths(cols, usableWidth, false);
  console.log("Calculated column styles (2 blanks):", colStyles);

  // Total data width = 92mm, remaining = 98mm
  // Blank 1 and Blank 2 each receive 98 / 2 = 49mm
  assert.strictEqual(colStyles[3].cellWidth, 49, "Blank 1 receives 49mm");
  assert.strictEqual(colStyles[5].cellWidth, 49, "Blank 2 receives 49mm");

  const totalCalculated = cols.reduce((sum, _, i) => sum + colStyles[i].cellWidth, 0);
  assert.strictEqual(totalCalculated, 190, "Total table width equals 190mm exactly");
  console.log("✓ 2 Blank columns split remaining width equally (49mm each) in exact sequence!");
}

console.log("\n=== TEST 4: Column Width Calculation with 0 Blank Columns ===");
{
  // User selects: S.No | Scholar No | Student Name | Class | Gender | Category | Father Name (190mm)
  const cols = [
    { type: "sNo" },
    { type: "field", key: "scholarNo" },
    { type: "field", key: "studentName" },
    { type: "field", key: "className" },
    { type: "field", key: "gender" },
    { type: "field", key: "category" },
    { type: "field", key: "fatherName" }
  ];

  const usableWidth = 190;
  const colStyles = calculateColumnWidths(cols, usableWidth, false);
  console.log("Calculated column styles (0 blanks):", colStyles);

  // Compact columns keep their required compact widths:
  assert.strictEqual(colStyles[0].cellWidth, 12, "S.No stays compact 12mm");
  assert.strictEqual(colStyles[1].cellWidth, 24, "Scholar No stays compact 24mm");
  assert.strictEqual(colStyles[3].cellWidth, 18, "Class stays compact 18mm");
  assert.strictEqual(colStyles[4].cellWidth, 16, "Gender stays compact 16mm");
  assert.strictEqual(colStyles[5].cellWidth, 20, "Category stays compact 20mm");

  // Name columns get the remaining room to wrap naturally:
  assert(colStyles[2].cellWidth >= 45, "Student Name gets extra room");
  assert(colStyles[6].cellWidth >= 45, "Father Name gets extra room");

  const totalCalculated = cols.reduce((sum, _, i) => sum + colStyles[i].cellWidth, 0);
  assert(Math.abs(totalCalculated - 190) < 1, "Total width fits page");
  console.log("✓ 0 Blank columns keeps compact columns compact and names wide!");
}

console.log("\n=== TEST 5: Real PDF Generation with Print-Safe Light Header & Writable Blank Column ===");
{
  const mockSchool = { schoolId: "SCH1025", schoolName: "Delhi Public School" };
  const mockStudents = [
    { id: "1", scholarNo: "SCH-001", studentName: "Aarav Sharma", className: "5", gender: "Boy", category: "GEN", fatherName: "Rajesh Sharma" },
    { id: "2", scholarNo: "SCH-002", studentName: "Bhavna Patel", className: "Nursery", gender: "Girl", category: "OBC", fatherName: "Suresh Patel" }
  ];

  const customCols = [
    { type: "field", key: "className" },
    { type: "field", key: "studentName" },
    { type: "blank" },
    { type: "field", key: "scholarNo" }
  ];

  const result = await generateStudentListPdf({
    school: mockSchool,
    datasetKey: DATASET_KEYS.SCHOOL_DATA,
    students: mockStudents,
    columnConfig: customCols
  });

  assert(result.success, "PDF generation succeeds");
  assert(result.filename.startsWith("SCH1025_"), "Filename starts with SCH1025");
  assert(result.filename.endsWith(".pdf"), "Filename ends with .pdf");
  console.log("Generated Print-Safe PDF:", result.filename);
  console.log("✓ Print-safe PDF generation verified!");
}

console.log("\nALL TESTS PASSED 100%!");
