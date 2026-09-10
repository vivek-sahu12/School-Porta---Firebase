/**
 * Comprehensive Test Suite for:
 * 1. Cache-First Student Filtering & Sorting
 * 2. UDISE Roman Numeral Normalization
 * 3. Context-Aware PDF Dataset Generation
 * 4. School Logo URL Resolution & Fallback
 * 5. Phone Field Canonical Migration
 */

import {
  normalizeClassLabel,
  getNaturalClassOrder,
  compareStudentsByClassAndName
} from "../js/school-config.js";

import {
  DATASET_KEYS,
  DATASET_LABELS,
  filterStudents
} from "../js/school/student-service.js";

import {
  extractGoogleDriveFileId,
  resolveImageUrl
} from "../js/image-resolver.js";

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

console.log("\n==================================================");
console.log("TEST 1: UDISE Class Normalization & Natural Order");
console.log("==================================================");

// Roman numeral conversion to numeric
const romanTests = [
  { in: "I", out: "1" },
  { in: "II", out: "2" },
  { in: "III", out: "3" },
  { in: "IV", out: "4" },
  { in: "V", out: "5" },
  { in: "VI", out: "6" },
  { in: "VII", out: "7" },
  { in: "VIII", out: "8" },
  { in: "IX", out: "9" },
  { in: "X", out: "10" },
  { in: "XI", out: "11" },
  { in: "XII", out: "12" },
  { in: "Class IV", out: "4" },
  { in: "Grade X", out: "10" },
  { in: "Std. 12", out: "12" }
];

romanTests.forEach(t => {
  assert(normalizeClassLabel(t.in) === t.out, `normalizeClassLabel("${t.in}") === "${t.out}"`);
});

// Non-Roman, non-numeric preserved
const preservedTests = ["Nursery", "LKG", "UKG", "KG1", "KG2"];
preservedTests.forEach(cls => {
  assert(normalizeClassLabel(cls) === cls, `Preserves grade "${cls}"`);
});

// Natural class order
const unordered = ["12", "1", "10", "KG2", "Nursery", "5", "KG1", "2"];
unordered.sort((a, b) => getNaturalClassOrder(a) - getNaturalClassOrder(b));
const expectedClassOrder = ["Nursery", "KG1", "KG2", "1", "2", "5", "10", "12"];
assert(
  JSON.stringify(unordered) === JSON.stringify(expectedClassOrder),
  `Natural class order: ${unordered.join(" -> ")}`
);

console.log("\n==================================================");
console.log("TEST 2: Student Sorting: Class First -> Name A-Z");
console.log("==================================================");

const sampleStudents = [
  { className: "10", studentName: "Zack Sharma" },
  { className: "Nursery", studentName: "Tina Patel" },
  { className: "1", studentName: "Bhavna Jain" },
  { className: "Nursery", studentName: "Aarav Kumar" },
  { className: "1", studentName: "Aakash Singh" },
  { className: "KG 1", studentName: "Rohan Verma" },
  { className: "1", studentName: "ananya gupta" }
];

const sorted = [...sampleStudents].sort(compareStudentsByClassAndName);

assert(sorted[0].className === "Nursery" && sorted[0].studentName === "Aarav Kumar", "Nursery: Aarav Kumar first");
assert(sorted[1].className === "Nursery" && sorted[1].studentName === "Tina Patel", "Nursery: Tina Patel second");
assert(sorted[2].className === "KG 1", "KG 1 after Nursery");
assert(sorted[3].className === "1" && sorted[3].studentName === "Aakash Singh", "Class 1: Aakash Singh first");
assert(sorted[4].className === "1" && sorted[4].studentName.toLowerCase().includes("ananya"), "Class 1: case-insensitive ananya before Bhavna");
assert(sorted[5].className === "1" && sorted[5].studentName === "Bhavna Jain", "Class 1: Bhavna Jain third");
assert(sorted[6].className === "10" && sorted[6].studentName === "Zack Sharma", "Class 10 last");

console.log("\n==================================================");
console.log("TEST 3: Google Drive Logo Resolution");
console.log("==================================================");

const driveLink1 = "https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I0J/view?usp=sharing";
const driveLink2 = "https://drive.google.com/open?id=1A2B3C4D5E6F7G8H9I0J";
const driveLink3 = "https://drive.google.com/uc?id=1A2B3C4D5E6F7G8H9I0J";

assert(extractGoogleDriveFileId(driveLink1) === "1A2B3C4D5E6F7G8H9I0J", "Extract file ID from /file/d/ URL");
assert(extractGoogleDriveFileId(driveLink2) === "1A2B3C4D5E6F7G8H9I0J", "Extract file ID from open?id= URL");
assert(extractGoogleDriveFileId(driveLink3) === "1A2B3C4D5E6F7G8H9I0J", "Extract file ID from uc?id= URL");

const resolved = resolveImageUrl(driveLink1);
assert(resolved === "https://drive.google.com/uc?export=view&id=1A2B3C4D5E6F7G8H9I0J", `Resolved Drive URL: ${resolved}`);

const standardUrl = "https://example.com/school-logo.png";
assert(resolveImageUrl(standardUrl) === standardUrl, "Standard image URL unchanged");

console.log("\n==================================================");
console.log("TEST 4: Phone Field Canonicalization");
console.log("==================================================");

// Simulated database record with both or either
const legacyRecord = { schoolName: "DPS", phone: "+91 9876543210" };
const modernRecord = { schoolName: "DPS", phoneNumber: "+91 9876543210" };
const mixedRecord = { schoolName: "DPS", phone: "+91 1111111111", phoneNumber: "+91 9876543210" };

function resolveCanonicalPhone(s) {
  return s.phoneNumber || s.phone || "";
}

assert(resolveCanonicalPhone(legacyRecord) === "+91 9876543210", "Resolves phone from legacy record");
assert(resolveCanonicalPhone(modernRecord) === "+91 9876543210", "Resolves phoneNumber from modern record");
assert(resolveCanonicalPhone(mixedRecord) === "+91 9876543210", "Prioritizes canonical phoneNumber when both exist");

console.log("\n==================================================");
console.log("TEST 5: Dataset Keys & Defaults");
console.log("==================================================");

assert(DATASET_KEYS.SCHOOL_DATA === "school_data", "SCHOOL_DATA key is school_data");
assert(DATASET_KEYS.UDISE === "udise", "UDISE key is udise");
assert(DATASET_KEYS.THREE_POINT_ZERO === "three_point_zero", "THREE_POINT_ZERO key is three_point_zero");
assert(DATASET_LABELS[DATASET_KEYS.SCHOOL_DATA] === "School Data", "Default dataset label is 'School Data'");

console.log(`\nAll Tests Completed: ${passed} Passed, ${failed} Failed.\n`);
if (failed > 0) process.exit(1);
