/**
 * Verification of DOM Integration, Button Placement & Client-Side PDF Creation
 */

import fs from "fs";
import { generateStudentListPdf } from "../js/school/pdf-service.js";
import { DATASET_KEYS } from "../js/school/student-service.js";

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

console.log("\n=== Checking dashboard.html DOM Structure ===");

const html = fs.readFileSync("dashboard.html", "utf8");

assert(html.includes('id="btn-export-pdf"'), "dashboard.html contains #btn-export-pdf");
assert(html.includes('btn-pdf-export'), "dashboard.html has .btn-pdf-export class");
assert(html.includes('id="manual-sync-btn"'), "dashboard.html contains #manual-sync-btn");
assert(html.includes('id="portal-network-status-badge"'), "dashboard.html contains #portal-network-status-badge");
assert(html.includes('id="filter-class-select"'), "dashboard.html contains #filter-class-select");
assert(html.includes('id="filter-gender-select"'), "dashboard.html contains #filter-gender-select");
assert(html.includes('id="filter-category-select"'), "dashboard.html contains #filter-category-select");

const css = fs.readFileSync("css/school.css", "utf8");
assert(css.includes(".btn-pdf-export"), "css/school.css contains .btn-pdf-export styling");
assert(css.includes(".pdf-btn-icon"), "css/school.css contains .pdf-btn-icon styling");

console.log("\n=== Testing Real PDF Generation for All 3 Datasets ===");

const mockSchool = {
  schoolId: "SCH23490",
  schoolName: "St. Xavier Senior Secondary School",
  logoUrl: "https://drive.google.com/file/d/123456789/view?usp=sharing"
};

// 1. School Data PDF Generation
const schoolDataStudents = [
  { scholarNo: "SC001", studentName: "Aarav Sharma", className: "Nursery", gender: "Boy", category: "GEN", fatherName: "Rajesh Sharma" },
  { scholarNo: "SC002", studentName: "Bhavna Patel", className: "1", gender: "Girl", category: "OBC", fatherName: "Dinesh Patel" },
  { scholarNo: "SC003", studentName: "Chetan Verma", className: "Class 10", gender: "Boy", category: "SC", fatherName: "Ramesh Verma" }
];

console.log("Generating School Data PDF...");
const res1 = await generateStudentListPdf({
  school: mockSchool,
  datasetKey: DATASET_KEYS.SCHOOL_DATA,
  students: schoolDataStudents,
  filterContext: { className: "" }
});

assert(res1.success === true, `School Data PDF generated successfully: ${res1.filename}`);

// 2. UDISE PDF Generation
const udiseStudents = [
  { penNo: "PEN9901", studentName: "Divya Singh", className: "IV", gender: "Girl", category: "ST", fatherName: "Manoj Singh" },
  { penNo: "PEN9902", studentName: "Eshan Kumar", className: "XII", gender: "Boy", category: "GEN", fatherName: "Sunil Kumar" }
];

console.log("Generating UDISE PDF...");
const res2 = await generateStudentListPdf({
  school: mockSchool,
  datasetKey: DATASET_KEYS.UDISE,
  students: udiseStudents,
  filterContext: { className: "IV" }
});

assert(res2.success === true, `UDISE PDF generated successfully: ${res2.filename}`);

// 3. 3.0 PDF Generation (Landscape)
const p3Students = [
  { samagraId: "SM110022", studentName: "Gaurav Joshi", className: "Class 5", gender: "Boy", category: "OBC", fatherName: "Kamal Joshi" }
];

console.log("Generating 3.0 PDF...");
const res3 = await generateStudentListPdf({
  school: mockSchool,
  datasetKey: DATASET_KEYS.THREE_POINT_ZERO,
  students: p3Students,
  filterContext: { search: "Gaurav" }
});

assert(res3.success === true, `3.0 PDF generated successfully: ${res3.filename}`);

console.log(`\nDOM & PDF Generation Tests: ${passed} Passed, ${failed} Failed.\n`);
if (failed > 0) process.exit(1);
