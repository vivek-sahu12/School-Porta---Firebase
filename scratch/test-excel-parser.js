/**
 * Unit Test Script for Excel Parser & Validation Engine
 */

import * as XLSX from "xlsx";
import {
  parseAndValidateExcel,
  DATASET_KEYS,
  DATASET_LABELS,
  DATASET_SCHEMAS
} from "../js/admin/excel-parser.js";

// Helper to create an in-memory File-like object from XLSX workbook
function createMockExcelFile(sheetData, fileName = "test.xlsx") {
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return {
    name: fileName,
    size: buffer.length,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n=== Testing Excel Parser & Dataset Validation ===\n");

  // TEST 1: Valid UDISE File (6 columns)
  console.log("Test 1: Valid UDISE Excel (all 6 columns)");
  const udiseData = [
    ["Class", "Name", "Gender", "Student PEN", "Father Name", "Social Category"],
    ["Class 5", "Aarav Sharma", "Boy", "PEN-1001", "Ramesh Sharma", "GEN"],
    ["Class 5", "Ananya Patel", "Girl", "PEN-1002", "Mahesh Patel", "OBC"]
  ];
  const udiseFile = createMockExcelFile(udiseData, "udise_test.xlsx");
  const res1 = await parseAndValidateExcel(udiseFile, DATASET_KEYS.UDISE, "SCH001");
  assert(res1.valid === true, "UDISE parsed successfully");
  assert(res1.recordCount === 2, "Record count is 2");
  assert(res1.students[0].penNo === "PEN-1001", "Student PEN mapped correctly");
  assert(res1.students[0].studentName === "AARAV SHARMA", "Student name normalized to uppercase");
  assert(res1.students[1].gender === "GIRL", "Gender normalized to GIRL");

  // TEST 2: UDISE File Missing "Student PEN"
  console.log("\nTest 2: UDISE File Missing 'Student PEN'");
  const udiseMissingPen = [
    ["Class", "Name", "Gender", "Father Name", "Social Category"],
    ["Class 5", "Aarav Sharma", "Boy", "Ramesh Sharma", "GEN"]
  ];
  const fileMissingPen = createMockExcelFile(udiseMissingPen, "udise_no_pen.xlsx");
  const res2 = await parseAndValidateExcel(fileMissingPen, DATASET_KEYS.UDISE, "SCH001");
  assert(res2.valid === false, "Rejected file missing Student PEN");
  assert(res2.error.includes("Student PEN"), `Error mentions Student PEN: ${res2.error}`);

  // TEST 3: Valid 3.0 File (6 columns)
  console.log("\nTest 3: Valid 3.0 Excel (all 6 columns)");
  const p3Data = [
    ["Class", "Samagra ID", "Student Name", "Father Name", "Category", "Gender"],
    ["Class 1", "912345678", "Vihaan Verma", "Rajesh Verma", "SC", "Male"],
    ["Class 2", "912345679", "Isha Gupta", "Alok Gupta", "GEN", "Female"]
  ];
  const p3File = createMockExcelFile(p3Data, "3.0_test.xlsx");
  const res3 = await parseAndValidateExcel(p3File, DATASET_KEYS.THREE_POINT_ZERO, "SCH001");
  assert(res3.valid === true, "3.0 parsed successfully");
  assert(res3.recordCount === 2, "Record count is 2");
  assert(res3.students[0].samagraId === "912345678", "Samagra ID mapped correctly");
  assert(res3.students[0].gender === "BOY", "Gender 'Male' normalized to 'BOY'");
  assert(res3.students[1].gender === "GIRL", "Gender 'Female' normalized to 'GIRL'");

  // TEST 4: 3.0 File Missing "Samagra ID"
  console.log("\nTest 4: 3.0 File Missing 'Samagra ID'");
  const p3MissingSamagra = [
    ["Class", "Student Name", "Father Name", "Category", "Gender"],
    ["Class 1", "Vihaan Verma", "Rajesh Verma", "SC", "Male"]
  ];
  const fileMissingSamagra = createMockExcelFile(p3MissingSamagra, "3.0_no_samagra.xlsx");
  const res4 = await parseAndValidateExcel(fileMissingSamagra, DATASET_KEYS.THREE_POINT_ZERO, "SCH001");
  assert(res4.valid === false, "Rejected 3.0 file missing Samagra ID");
  assert(res4.error.includes("Samagra ID"), `Error mentions Samagra ID: ${res4.error}`);

  // TEST 5: Valid School Data File (Master Student Data)
  console.log("\nTest 5: Valid School Data File");
  const sdData = [
    ["Class", "Student Name", "Father Name", "Gender", "Category", "Scholar No"],
    ["Class 10", "Reyansh Singh", "Dharmendra Singh", "Boy", "OBC", "SCH-101"],
    ["Class 10", "Myra Rajput", "Suraj Rajput", "Girl", "GEN", "SCH-102"]
  ];
  const sdFile = createMockExcelFile(sdData, "schooldata.xlsx");
  const res5 = await parseAndValidateExcel(sdFile, DATASET_KEYS.SCHOOL_DATA, "SCH001");
  assert(res5.valid === true, "School Data parsed successfully");
  assert(res5.recordCount === 2, "Record count is 2");
  assert(res5.students[0].scholarNo === "SCH-101", "Scholar No mapped correctly");

  // TEST 6: Non-Excel File Extension
  console.log("\nTest 6: Reject Non-Excel File Extension");
  const textFile = { name: "students.csv", size: 50, arrayBuffer: async () => new ArrayBuffer(50) };
  const res6 = await parseAndValidateExcel(textFile, DATASET_KEYS.UDISE, "SCH001");
  assert(res6.valid === false, "Rejected .csv file");
  assert(res6.error.includes(".xlsx"), "Error mentions .xlsx requirement");

  // TEST 7: Duplicate Unique ID Handling
  console.log("\nTest 7: Duplicate Unique ID in File");
  const duplicatePenData = [
    ["Class", "Name", "Gender", "Student PEN", "Father Name", "Social Category"],
    ["Class 5", "Student First", "Boy", "PEN-9999", "Father One", "GEN"],
    ["Class 5", "Student Updated", "Boy", "PEN-9999", "Father One", "GEN"]
  ];
  const dupFile = createMockExcelFile(duplicatePenData, "udise_dup.xlsx");
  const res7 = await parseAndValidateExcel(dupFile, DATASET_KEYS.UDISE, "SCH001");
  assert(res7.valid === true, "Duplicate file accepted");
  assert(res7.recordCount === 1, "Duplicate consolidated to 1 record");
  assert(res7.students[0].studentName === "STUDENT UPDATED", "Preserved updated row with uppercase name");
  assert(res7.warnings.length > 0, "Warning generated for duplicate");

  // TEST 8: Trailing Empty Rows Handling
  console.log("\nTest 8: Trailing Empty Rows");
  const trailingEmptyData = [
    ["Class", "Name", "Gender", "Student PEN", "Father Name", "Social Category"],
    ["Class 1", "Valid Student", "Boy", "PEN-001", "Father Name", "GEN"],
    ["", "", "", "", "", ""],
    ["", "", "", "", "", ""]
  ];
  const trailingFile = createMockExcelFile(trailingEmptyData, "udise_trailing.xlsx");
  const res8 = await parseAndValidateExcel(trailingFile, DATASET_KEYS.UDISE, "SCH001");
  assert(res8.valid === true, "Parsed despite trailing empty rows");
  assert(res8.recordCount === 1, "Clean count of 1 valid student");

  // TEST 9: Class Value Normalization (Roman numerals, numeric, and non-Roman)
  console.log("\nTest 9: Roman numeral & Numeric Class Normalization");
  const romanTestData = [
    ["Class", "Name", "Gender", "Student PEN", "Father Name", "Social Category"],
    ["I", "Student 1", "Boy", "PEN-01", "Father 1", "GEN"],
    ["II", "Student 2", "Girl", "PEN-02", "Father 2", "GEN"],
    ["III", "Student 3", "Boy", "PEN-03", "Father 3", "GEN"],
    ["IV", "Student 4", "Girl", "PEN-04", "Father 4", "GEN"],
    ["V", "Student 5", "Boy", "PEN-05", "Father 5", "GEN"],
    ["VI", "Student 6", "Girl", "PEN-06", "Father 6", "GEN"],
    ["VII", "Student 7", "Boy", "PEN-07", "Father 7", "GEN"],
    ["VIII", "Student 8", "Girl", "PEN-08", "Father 8", "GEN"],
    ["IX", "Student 9", "Boy", "PEN-09", "Father 9", "GEN"],
    ["X", "Student 10", "Girl", "PEN-10", "Father 10", "GEN"],
    ["XI", "Student 11", "Boy", "PEN-11", "Father 11", "GEN"],
    ["XII", "Student 12", "Girl", "PEN-12", "Father 12", "GEN"],
    ["1", "Student Num1", "Boy", "PEN-13", "Father 13", "GEN"],
    ["10", "Student Num10", "Girl", "PEN-14", "Father 14", "GEN"],
    ["Nursery", "Student Nur", "Boy", "PEN-15", "Father 15", "GEN"],
    ["LKG", "Student LKG", "Girl", "PEN-16", "Father 16", "GEN"],
    ["UKG", "Student UKG", "Boy", "PEN-17", "Father 17", "GEN"],
    ["Class IV", "Student Prefix", "Girl", "PEN-18", "Father 18", "GEN"]
  ];
  const romanFile = createMockExcelFile(romanTestData, "udise_roman.xlsx");
  const res9 = await parseAndValidateExcel(romanFile, DATASET_KEYS.UDISE, "SCH001");
  assert(res9.valid === true, "Roman test file parsed successfully");
  assert(res9.recordCount === 18, "Record count is 18");
  assert(res9.students[0].className === "1", "I -> 1");
  assert(res9.students[1].className === "2", "II -> 2");
  assert(res9.students[2].className === "3", "III -> 3");
  assert(res9.students[3].className === "4", "IV -> 4");
  assert(res9.students[4].className === "5", "V -> 5");
  assert(res9.students[5].className === "6", "VI -> 6");
  assert(res9.students[6].className === "7", "VII -> 7");
  assert(res9.students[7].className === "8", "VIII -> 8");
  assert(res9.students[8].className === "9", "IX -> 9");
  assert(res9.students[9].className === "10", "X -> 10");
  assert(res9.students[10].className === "11", "XI -> 11");
  assert(res9.students[11].className === "12", "XII -> 12");
  assert(res9.students[12].className === "1", "Numeric 1 -> 1");
  assert(res9.students[13].className === "10", "Numeric 10 -> 10");
  assert(res9.students[14].className === "Nursery", "Nursery -> Nursery preserved");
  assert(res9.students[15].className === "LKG", "LKG -> LKG preserved");
  assert(res9.students[16].className === "UKG", "UKG -> UKG preserved");
  assert(res9.students[17].className === "4", "Class IV -> 4");

  console.log(`\n================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`================================\n`);

  if (failed > 0) process.exit(1);
}

runTests();
