/**
 * Unit Test Script for Alphabetical Sorting, Natural Class Ordering & Class Normalization
 */

import {
  normalizeClassLabel,
  getNaturalClassOrder
} from "../js/school-config.js";

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

console.log("\n=== Testing Class Normalization & Natural Ordering ===\n");

// 1. Class Normalization
console.log("1. Class Normalization Tests");
assert(normalizeClassLabel("KG 1") === "KG1", "KG 1 -> KG1");
assert(normalizeClassLabel("K G 1") === "KG1", "K G 1 -> KG1");
assert(normalizeClassLabel("KG-1") === "KG1", "KG-1 -> KG1");
assert(normalizeClassLabel("KG 2") === "KG2", "KG 2 -> KG2");
assert(normalizeClassLabel("K G 2") === "KG2", "K G 2 -> KG2");
assert(normalizeClassLabel("KG-2") === "KG2", "KG-2 -> KG2");
assert(normalizeClassLabel("Nursery") === "Nursery", "Nursery preserved");
assert(normalizeClassLabel("LKG") === "LKG", "LKG preserved");
assert(normalizeClassLabel("UKG") === "UKG", "UKG preserved");
assert(normalizeClassLabel("Class 5") === "5", "Class 5 -> 5");
assert(normalizeClassLabel("Class 10") === "10", "Class 10 -> 10");
assert(normalizeClassLabel("IV") === "4", "Roman IV -> 4");
assert(normalizeClassLabel("XII") === "12", "Roman XII -> 12");
assert(normalizeClassLabel("1") === "1", "Numeric 1 -> 1");
assert(normalizeClassLabel("12") === "12", "Numeric 12 -> 12");

// 2. Natural Class Ordering
console.log("\n2. Natural Class Ordering Tests");
const testClasses = ["10", "2", "KG1", "1", "12", "Nursery", "KG2", "3", "11"];
testClasses.sort((a, b) => {
  const rankA = getNaturalClassOrder(a);
  const rankB = getNaturalClassOrder(b);
  if (rankA !== rankB) return rankA - rankB;
  return a.localeCompare(b, undefined, { numeric: true });
});

const expectedOrder = ["Nursery", "KG1", "KG2", "1", "2", "3", "10", "11", "12"];
assert(
  JSON.stringify(testClasses) === JSON.stringify(expectedOrder),
  `Sorted natural class order: ${testClasses.join(" -> ")}`
);

// 3. Alphabetical Student Sorting
console.log("\n3. Alphabetical Student Sorting Tests");
const sampleNames = ["Rahul", "aman", "  aditi ", "priya", "Anjali", "Deepak", "Aarav", "Riya", "Kavya"];
const sortedNames = [...sampleNames].sort((a, b) => {
  const nameA = a.trim();
  const nameB = b.trim();
  return nameA.localeCompare(nameB, undefined, { sensitivity: "base", numeric: true });
});

const expectedSortedNames = ["Aarav", "aditi", "aman", "Anjali", "Deepak", "Kavya", "priya", "Rahul", "Riya"];
assert(
  JSON.stringify(sortedNames.map(n => n.trim().toLowerCase())) === JSON.stringify(expectedSortedNames.map(n => n.toLowerCase())),
  `Names sorted alphabetically: ${sortedNames.map(n => n.trim()).join(", ")}`
);

// 4. Universal Student Sorting: Class Order First -> Name A-Z Second
console.log("\n4. Universal Student Sorting (Class -> Name A-Z) Tests");
import { compareStudentsByClassAndName } from "../js/school-config.js";

const mixedStudents = [
  { className: "Class 5", studentName: "Vivek Verma" },
  { className: "KG 1", studentName: "Rahul" },
  { className: "Class 3", studentName: "Vivek Patel" },
  { className: "Nursery", studentName: "Aman" },
  { className: "Class 2", studentName: "Vivek Sharma" },
  { className: "1", studentName: "Amit" },
  { className: "Class 3", studentName: "Vivek Chauhan" },
  { className: "KG 1", studentName: "Arjun" },
  { className: "1", studentName: "Vivek" },
  { className: "10", studentName: "Aditya" }
];

const sortedStudents = [...mixedStudents].sort(compareStudentsByClassAndName);

// Verify exact expected order:
// Nursery -> Aman
// KG 1 -> Arjun, Rahul
// 1 -> Amit, Vivek
// Class 2 -> Vivek Sharma
// Class 3 -> Vivek Chauhan, Vivek Patel
// Class 5 -> Vivek Verma
// 10 -> Aditya
const expectedClassNames = [
  "Nursery: Aman",
  "KG 1: Arjun",
  "KG 1: Rahul",
  "1: Amit",
  "1: Vivek",
  "Class 2: Vivek Sharma",
  "Class 3: Vivek Chauhan",
  "Class 3: Vivek Patel",
  "Class 5: Vivek Verma",
  "10: Aditya"
];

const actualClassNames = sortedStudents.map(s => `${s.className}: ${s.studentName}`);
assert(
  JSON.stringify(actualClassNames) === JSON.stringify(expectedClassNames),
  `Multi-class search/list sorted by Natural Class then Name A-Z`
);

// 5. Single Class Student Sorting: Collapses to Pure Name A-Z
console.log("\n5. Single Class Student Sorting Tests");
const singleClassStudents = [
  { className: "Class 5", studentName: "Vivek" },
  { className: "Class 5", studentName: "Aman" },
  { className: "5", studentName: "Aarav" },
  { className: "Class 5", studentName: "Rahul" },
  { className: "Class 5", studentName: "Aditi" },
  { className: "Class 5", studentName: "Deepak" }
];
const sortedSingleClass = [...singleClassStudents].sort(compareStudentsByClassAndName);
const expectedSingleOrder = ["Aarav", "Aditi", "Aman", "Deepak", "Rahul", "Vivek"];
const actualSingleOrder = sortedSingleClass.map(s => s.studentName);
assert(
  JSON.stringify(actualSingleOrder) === JSON.stringify(expectedSingleOrder),
  `Single class roster sorts purely alphabetically A-Z: ${actualSingleOrder.join(", ")}`
);

// 6. Search Match Highlighting Tests
console.log("\n6. Search Match Highlighting Tests");
import { highlightSearchMatches } from "../js/school-config.js";

// Example 1: Partial match in Name ("rm" in "Vikram Sharma")
const ex1 = highlightSearchMatches("Vikram Sharma", "rm");
assert(
  ex1 === 'Vikram Sha<mark class="search-highlight">rm</mark>a',
  `Example 1 exact substring match correctly wrapped: ${ex1}`
);

// Example 2: Match in Father Name ("ram" in "Ram Kumar")
const ex2 = highlightSearchMatches("Ram Kumar", "ram");
assert(
  ex2 === '<mark class="search-highlight">Ram</mark> Kumar',
  `Example 2 preserves original casing: ${ex2}`
);

// Example 3: Multiple occurrences ("an" in "Anand Anjali")
const ex3 = highlightSearchMatches("Anand Anjali", "an");
assert(
  ex3 === '<mark class="search-highlight">An</mark><mark class="search-highlight">and</mark> <mark class="search-highlight">An</mark>jali' || ex3 === '<mark class="search-highlight">An</mark><mark class="search-highlight">an</mark>d <mark class="search-highlight">An</mark>jali' || ex3 === '<mark class="search-highlight">An</mark>and <mark class="search-highlight">An</mark>jali',
  `Example 3 highlights all occurrences of 'an': ${ex3}`
);

// Example 4: Case-insensitivity ("RAM", "ram", "rAm")
const ex4A = highlightSearchMatches("Vikram Sharma", "RAM");
const ex4B = highlightSearchMatches("Vikram Sharma", "ram");
assert(
  ex4A === ex4B && ex4A.includes('<mark class="search-highlight">ram</mark>'),
  `Case-insensitivity produces identical highlight tag wrapping while preserving text: ${ex4A}`
);

// Example 5: Special characters / regex safety ("test (1+2)* [id]")
const specialText = "Math (1+2)* [id]";
const ex5 = highlightSearchMatches(specialText, "(1+2)*");
assert(
  ex5 === 'Math <mark class="search-highlight">(1+2)*</mark> [id]',
  `Safely escapes regex special characters: ${ex5}`
);

// Example 6: XSS Injection prevention ("<script>alert(1)</script>")
const unsafeText = '<script>alert("xss")</script>';
const ex6 = highlightSearchMatches(unsafeText, "alert");
assert(
  !ex6.includes("<script>") && ex6.includes("&lt;script&gt;") && ex6.includes('<mark class="search-highlight">alert</mark>'),
  `Escapes HTML and prevents XSS: ${ex6}`
);

// Example 7: Empty or whitespace query
const ex7 = highlightSearchMatches("Normal Text", "  ");
assert(
  ex7 === "Normal Text",
  `Empty/whitespace query returns original escaped text without mark tags`
);

console.log(`\n================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`================================\n`);

if (failed > 0) process.exit(1);


