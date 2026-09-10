/**
 * Unit Test Script for Student Data Normalization
 * Validates database-level normalization during Excel upload/import for Student Data:
 * - School Data
 * - UDISE
 * - 3.0
 */

import * as XLSX from "xlsx";
import {
  normalizeStudentText,
  normalizeStudentRecord,
  normalizeStudentDataset,
  normalizeGender,
  normalizeCategory,
  PRESERVED_STUDENT_FIELDS,
  parseAndValidateExcel,
  DATASET_KEYS
} from "../js/admin/excel-parser.js";

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

async function runTests() {
  console.log("\n=== Testing Student Data Normalization Rules ===\n");

  // TEST 1: User prompt exact examples
  console.log("Test 1: User Specified Examples in normalizeStudentText");
  assert(normalizeStudentText("Rahul Kumar") === "RAHUL KUMAR", "'Rahul Kumar' -> 'RAHUL KUMAR'");
  assert(normalizeStudentText(" rahul   kumar ") === "RAHUL KUMAR", "' rahul   kumar ' -> 'RAHUL KUMAR'");
  assert(normalizeStudentText("RAMESH kumar") === "RAMESH KUMAR", "'RAMESH kumar' -> 'RAMESH KUMAR'");
  assert(normalizeStudentText("Sunita Devi") === "SUNITA DEVI", "'Sunita Devi' -> 'SUNITA DEVI'");
  assert(normalizeStudentText("Village ABC, Post XYZ") === "VILLAGE ABC, POST XYZ", "'Village ABC, Post XYZ' -> 'VILLAGE ABC, POST XYZ'");
  assert(normalizeGender("Boy") === "BOY", "'Boy' -> 'BOY'");
  assert(normalizeGender("girl") === "GIRL", "'girl' -> 'GIRL'");
  assert(normalizeCategory("  OBC  ") === "OBC", "'  OBC  ' -> 'OBC'");

  // TEST 2: Blank / Null / Undefined preservation
  console.log("\nTest 2: Blank, null, and undefined preservation");
  assert(normalizeStudentText(null) === null, "null preserved as null");
  assert(normalizeStudentText(undefined) === undefined, "undefined preserved as undefined");
  assert(normalizeStudentText("") === "", "empty string preserved as empty string");
  assert(normalizeStudentText("   ") === "", "whitespace-only string trimmed to empty string");
  assert(normalizeStudentText(null) !== "NULL", "null NOT converted to string 'NULL'");
  assert(normalizeStudentText(undefined) !== "UNDEFINED", "undefined NOT converted to string 'UNDEFINED'");

  // TEST 3: Non-string values preserved
  console.log("\nTest 3: Non-string types in normalizeStudentRecord");
  const mixedRecord = {
    studentName: " rohan  sharma ",
    fatherName: " suresh   sharma ",
    marks: 95,
    rank: 1,
    isActive: true,
    extra: null
  };
  const normMixed = normalizeStudentRecord(mixedRecord);
  assert(normMixed.studentName === "ROHAN SHARMA", "studentName normalized to uppercase");
  assert(normMixed.fatherName === "SURESH SHARMA", "fatherName normalized to uppercase");
  assert(normMixed.marks === 95, "Numeric marks preserved as number 95");
  assert(normMixed.rank === 1, "Numeric rank preserved as number 1");
  assert(normMixed.isActive === true, "Boolean isActive preserved as true");
  assert(normMixed.extra === null, "null extra preserved as null");

  // TEST 4: Preservation of IDs, system fields, and Class values
  console.log("\nTest 4: Preservation of IDs, Auth, System Metadata & Class");
  const fullRecord = {
    id: "UD-SCH001-PEN-12345",
    schoolId: "sch001",
    dataset: "udise",
    className: "10",
    penNo: "PEN-12345",
    udiseId: "UD-PEN-12345",
    samagraId: "sam-987654",
    samagraMemberId: "sam-987654",
    scholarNo: "sc-00123",
    rollNo: "05",
    dob: "2010-05-15",
    mobile: "9876543210",
    phone: "011-2345678",
    aadhaarNo: "1234-5678-9012",
    email: "admin@school.org",
    uid: "firebase_user_abc123",
    firebaseUid: "firebase_user_abc123",
    status: "Active",
    createdAt: "2026-01-01T00:00:00Z",
    uploadedBy: "superadmin@domain.com",
    // Fields that SHOULD be normalized:
    studentName: " aakash   gupta ",
    fatherName: " ramesh  chandra  gupta ",
    motherName: " sunita   devi ",
    address: " 123  main street,  delhi ",
    gender: "male",
    category: "obc"
  };

  const normRecord = normalizeStudentRecord(fullRecord);

  // Assert preserved fields remained untouched
  assert(normRecord.id === "UD-SCH001-PEN-12345", "Record ID preserved exactly");
  assert(normRecord.schoolId === "sch001", "schoolId preserved without forced casing");
  assert(normRecord.dataset === "udise", "dataset preserved");
  assert(normRecord.className === "10", "className preserved");
  assert(normRecord.penNo === "PEN-12345", "penNo preserved");
  assert(normRecord.udiseId === "UD-PEN-12345", "udiseId preserved");
  assert(normRecord.samagraId === "sam-987654", "samagraId preserved");
  assert(normRecord.scholarNo === "sc-00123", "scholarNo preserved");
  assert(normRecord.rollNo === "05", "rollNo preserved");
  assert(normRecord.dob === "2010-05-15", "dob preserved");
  assert(normRecord.mobile === "9876543210", "mobile preserved");
  assert(normRecord.phone === "011-2345678", "phone preserved");
  assert(normRecord.aadhaarNo === "1234-5678-9012", "aadhaarNo preserved");
  assert(normRecord.email === "admin@school.org", "email preserved");
  assert(normRecord.uid === "firebase_user_abc123", "uid preserved");
  assert(normRecord.firebaseUid === "firebase_user_abc123", "firebaseUid preserved");
  assert(normRecord.status === "Active", "status preserved");
  assert(normRecord.createdAt === "2026-01-01T00:00:00Z", "createdAt preserved");
  assert(normRecord.uploadedBy === "superadmin@domain.com", "uploadedBy preserved");

  // Assert human-readable fields normalized
  assert(normRecord.studentName === "AAKASH GUPTA", "studentName normalized to 'AAKASH GUPTA'");
  assert(normRecord.fatherName === "RAMESH CHANDRA GUPTA", "fatherName normalized to 'RAMESH CHANDRA GUPTA'");
  assert(normRecord.motherName === "SUNITA DEVI", "motherName normalized to 'SUNITA DEVI'");
  assert(normRecord.address === "123 MAIN STREET, DELHI", "address normalized to '123 MAIN STREET, DELHI'");

  // TEST 5: Excel Import Simulation for UDISE
  console.log("\nTest 5: Excel Import for UDISE with mixed-case and extra spaces");
  const udiseData = [
    ["Class", "Name", "Gender", "Student PEN", "Father Name", "Social Category", "Mother Name", "Address"],
    ["Class IV", "  rahul   kumar  ", "boy", "pen-udise-01", "  RAMESH kumar  ", "  obc  ", " sunita  devi ", " village abc,  post xyz "]
  ];
  const udiseFile = createMockExcelFile(udiseData, "udise_test.xlsx");
  const resUdise = await parseAndValidateExcel(udiseFile, DATASET_KEYS.UDISE, "SCH100");
  assert(resUdise.valid === true, "UDISE parsed successfully");
  const u1 = resUdise.students[0];
  assert(u1.studentName === "RAHUL KUMAR", "UDISE: studentName 'RAHUL KUMAR'");
  assert(u1.fatherName === "RAMESH KUMAR", "UDISE: fatherName 'RAMESH KUMAR'");
  assert(u1.motherName === "SUNITA DEVI", "UDISE: motherName 'SUNITA DEVI'");
  assert(u1.address === "VILLAGE ABC, POST XYZ", "UDISE: address 'VILLAGE ABC, POST XYZ'");
  assert(u1.gender === "BOY", "UDISE: gender 'BOY'");
  assert(u1.category === "OBC", "UDISE: category 'OBC'");
  assert(u1.className === "4", "UDISE: Class IV -> 4 normalized via Roman logic");
  assert(u1.penNo === "pen-udise-01", "UDISE: PEN preserved as pen-udise-01");

  // TEST 6: Excel Import Simulation for 3.0
  console.log("\nTest 6: Excel Import for 3.0 with mixed-case and extra spaces");
  const p3Data = [
    ["Class", "Samagra ID", "Student Name", "Father Name", "Category", "Gender", "Mother Name"],
    ["Class 8", "sam-30-001", " priya   verma ", " anil   verma ", "sc", "girl", "  rekha   verma "]
  ];
  const p3File = createMockExcelFile(p3Data, "3.0_test.xlsx");
  const resP3 = await parseAndValidateExcel(p3File, DATASET_KEYS.THREE_POINT_ZERO, "SCH100");
  assert(resP3.valid === true, "3.0 parsed successfully");
  const p1 = resP3.students[0];
  assert(p1.studentName === "PRIYA VERMA", "3.0: studentName 'PRIYA VERMA'");
  assert(p1.fatherName === "ANIL VERMA", "3.0: fatherName 'ANIL VERMA'");
  assert(p1.motherName === "REKHA VERMA", "3.0: motherName 'REKHA VERMA'");
  assert(p1.gender === "GIRL", "3.0: gender 'GIRL'");
  assert(p1.category === "SC", "3.0: category 'SC'");
  assert(p1.className === "8", "3.0: Class 8 -> 8");
  assert(p1.samagraId === "sam-30-001", "3.0: Samagra ID preserved as sam-30-001");

  // TEST 7: Excel Import Simulation for School Data
  console.log("\nTest 7: Excel Import for School Data with mixed-case and extra spaces");
  const sdData = [
    ["Class", "Student Name", "Father Name", "Gender", "Category", "Scholar No", "Address"],
    ["Nursery", "  mohit   joshi ", " kishore   joshi ", "Male", "General", "SCH-9988", "  flat 4B, green park "]
  ];
  const sdFile = createMockExcelFile(sdData, "schooldata.xlsx");
  const resSd = await parseAndValidateExcel(sdFile, DATASET_KEYS.SCHOOL_DATA, "SCH100");
  assert(resSd.valid === true, "School Data parsed successfully");
  const s1 = resSd.students[0];
  assert(s1.studentName === "MOHIT JOSHI", "School Data: studentName 'MOHIT JOSHI'");
  assert(s1.fatherName === "KISHORE JOSHI", "School Data: fatherName 'KISHORE JOSHI'");
  assert(s1.gender === "BOY", "School Data: gender 'BOY'");
  assert(s1.category === "GEN", "School Data: category 'GEN'");
  assert(s1.address === "FLAT 4B, GREEN PARK", "School Data: address 'FLAT 4B, GREEN PARK'");
  assert(s1.className === "Nursery", "School Data: non-Roman 'Nursery' preserved");
  assert(s1.scholarNo === "SCH-9988", "School Data: Scholar No preserved as SCH-9988");

  // TEST 8: Centralized normalizeStudentDataset array function
  console.log("\nTest 8: normalizeStudentDataset batch processing");
  const batchStudents = [
    { studentName: "  arjun  ", penNo: "pen-1" },
    { studentName: "  karan  ", penNo: "pen-2" }
  ];
  const normalizedBatch = normalizeStudentDataset(batchStudents);
  assert(normalizedBatch[0].studentName === "ARJUN", "Batch student 0 uppercase");
  assert(normalizedBatch[0].penNo === "pen-1", "Batch student 0 penNo preserved");
  assert(normalizedBatch[1].studentName === "KARAN", "Batch student 1 uppercase");
  assert(normalizedBatch[1].penNo === "pen-2", "Batch student 1 penNo preserved");

  console.log(`\n================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`================================\n`);

  if (failed > 0) process.exit(1);
}

runTests();
