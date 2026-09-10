/**
 * Verification test for incremental PDF, Search Ranking, and Mobile Button enhancements
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { generatePdfFilename, determineTableOrientation } from "../js/school/pdf-service.js";
import { filterStudents, initStudentServiceMemory, DATASET_KEYS } from "../js/school/student-service.js";

console.log("--- TEST 1: PDF Filename Format ---");
{
  const fixedDate = new Date(2026, 8, 10, 15, 42, 8); // 10 Sep 2026, 15:42:08
  const filename = generatePdfFilename("SCH1025", fixedDate);
  console.log("Generated filename:", filename);
  assert.strictEqual(filename, "SCH1025_10092026_154208.pdf", "Filename must match SCH1025_10092026_154208.pdf");

  // Test special characters in schoolId are cleaned
  const unsafeFilename = generatePdfFilename("SCH/1025:A B", fixedDate);
  console.log("Unsafe cleaned filename:", unsafeFilename);
  assert.strictEqual(unsafeFilename, "SCH1025AB_10092026_154208.pdf", "Unsafe characters must be stripped");
  console.log("✓ PDF Filename test passed!");
}

console.log("\n--- TEST 2: Content-Aware Orientation Decision ---");
{
  const orientSD = determineTableOrientation(DATASET_KEYS.SCHOOL_DATA);
  const orientUD = determineTableOrientation(DATASET_KEYS.UDISE);
  const orientP3 = determineTableOrientation(DATASET_KEYS.THREE_POINT_ZERO);

  console.log("School Data orientation:", orientSD);
  console.log("UDISE orientation:", orientUD);
  console.log("3.0 orientation:", orientP3);

  assert.strictEqual(orientSD, "portrait", "School Data should use portrait");
  assert.strictEqual(orientUD, "portrait", "UDISE should use portrait");
  assert.strictEqual(orientP3, "landscape", "3.0 should use landscape");
  console.log("✓ Orientation decision test passed!");
}

console.log("\n--- TEST 3: Search Relevance Ranking (Student Name First) ---");
{
  const mockStudents = [
    // Student where "RAM" is in father's name, class 1
    { id: "s1", studentName: "Aarav Gupta", fatherName: "Ram Prakash Gupta", className: "1", gender: "Boy", category: "GEN" },
    // Student where "RAM" is in student's name, class 5
    { id: "s2", studentName: "Ram Kumar", fatherName: "Sohan Lal", className: "5", gender: "Boy", category: "OBC" },
    // Student where "RAM" is in student's name, class 2
    { id: "s3", studentName: "Abhi Ram", fatherName: "Devi Dayal", className: "2", gender: "Boy", category: "GEN" },
    // Student where "RAM" is in scholar no, class 1
    { id: "s4", studentName: "Bhavya Singh", fatherName: "Vipin Singh", scholarNo: "RAM-99", className: "1", gender: "Girl", category: "SC" },
    // Student where "RAM" is in student's name, class 1
    { id: "s5", studentName: "Ram Charan", fatherName: "Anand Charan", className: "1", gender: "Boy", category: "GEN" },
    // Unrelated student
    { id: "s6", studentName: "Zoya Khan", fatherName: "Tariq Khan", className: "1", gender: "Girl", category: "GEN" }
  ];

  initStudentServiceMemory({
    schoolId: "SCH1025",
    schoolData: mockStudents,
    udise: [],
    threePointZero: []
  });

  const results = filterStudents(DATASET_KEYS.SCHOOL_DATA, { search: "RAM" });
  console.log("Search query 'RAM' results count:", results.length);
  results.forEach((st, idx) => {
    console.log(` ${idx + 1}. [Class ${st.className}] Name: "${st.studentName}" | Father: "${st.fatherName}" | Scholar: "${st.scholarNo || ''}"`);
  });

  // Expected order:
  // Priority 1 (Student Name matches):
  // 1. Ram Charan (Class 1)
  // 2. Abhi Ram (Class 2)
  // 3. Ram Kumar (Class 5)
  // Priority 2 (Other field matches):
  // 4. Aarav Gupta (Class 1, father "Ram Prakash Gupta")
  // 5. Bhavya Singh (Class 1, scholar "RAM-99")
  assert.strictEqual(results.length, 5, "Should match 5 students");
  assert.strictEqual(results[0].studentName, "Ram Charan", "Priority 1 class 1 student name first");
  assert.strictEqual(results[1].studentName, "Abhi Ram", "Priority 1 class 2 student name second");
  assert.strictEqual(results[2].studentName, "Ram Kumar", "Priority 1 class 5 student name third");
  assert.strictEqual(results[3].studentName, "Aarav Gupta", "Priority 2 class 1 name A-Z first");
  assert.strictEqual(results[4].studentName, "Bhavya Singh", "Priority 2 class 1 name A-Z second");

  console.log("✓ Search relevance ranking test passed!");
}

console.log("\n--- TEST 4: DOM and CSS mobile button verification ---");
{
  const html = fs.readFileSync(path.resolve("dashboard.html"), "utf8");
  const css = fs.readFileSync(path.resolve("css/school.css"), "utf8");

  assert(html.includes('id="btn-export-pdf"'), "dashboard.html has desktop PDF button");
  assert(html.includes('id="btn-export-pdf-mobile"'), "dashboard.html has mobile PDF button");
  assert(html.includes('student-mobile-pdf-bar'), "dashboard.html has student-mobile-pdf-bar container");

  assert(css.includes(".student-mobile-pdf-bar"), "CSS defines .student-mobile-pdf-bar");
  assert(css.includes(".desktop-pdf-btn"), "CSS defines .desktop-pdf-btn");
  assert(css.includes(".mobile-pdf-btn"), "CSS defines .mobile-pdf-btn");

  console.log("✓ DOM and CSS layout checks passed!");
}

console.log("\nALL ENHANCEMENT TESTS PASSED 100%!");
