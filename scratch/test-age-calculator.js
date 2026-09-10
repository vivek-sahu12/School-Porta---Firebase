/**
 * Unit Test Script for Age Calculator & Class Eligibility Engine
 */

import {
  calculateExactAge,
  evaluateClassEligibility,
  parseDateSafe,
  formatDateDMY,
  formatDateVerbose
} from "../js/school/age-calculator.js";

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

console.log("\n=== Testing Age Calculator & Class Eligibility Engine ===\n");

// 1. Basic Age Calculations
console.log("1. Exact Age Calculations");
const dob1 = new Date(2020, 6, 16); // 16 July 2020
const asOf1 = new Date(2026, 8, 30); // 30 September 2026
const age1 = calculateExactAge(dob1, asOf1);
assert(age1.years === 6 && age1.months === 2 && age1.days === 14, `6Y 2M 14D (got ${age1.years}Y ${age1.months}M ${age1.days}D)`);

// 2. Leap Year & End-of-month handling
console.log("\n2. Leap Year & Month-End Handling");
const dobLeap = new Date(2020, 1, 29); // 29 Feb 2020
const asOfLeap = new Date(2026, 1, 28); // 28 Feb 2026
const ageLeap = calculateExactAge(dobLeap, asOfLeap);
assert(ageLeap.years === 5 && ageLeap.months === 11 && ageLeap.days === 30, `Leap year borrow test (got ${ageLeap.years}Y ${ageLeap.months}M ${ageLeap.days}D)`);

// 3. Class Eligibility Scenarios
console.log("\n3. Class Eligibility Scenarios");

// A. Exactly 3 Years as of 31 July 2026 -> DOB: 31 July 2023
const dobNurseryExact = new Date(2023, 6, 31);
const eligNursery = evaluateClassEligibility(dobNurseryExact);
assert(eligNursery.primary && eligNursery.primary.className === "Nursery", "DOB 31/07/2023 is Primary Nursery");
assert(eligNursery.alsoEligible.length === 0, "No other class eligible");

// B. Overlapping Nursery & KG1: DOB 15 March 2022
// As of 31 July 2026: 4 Years 4 Months 16 Days
// Nursery is 3y through 4y 6m (Eligible!)
// KG1 is 4y through 5y 6m (Eligible!)
// Primary must be KG1, Also Eligible must include Nursery
const dobOverlap1 = new Date(2022, 2, 15);
const eligOverlap1 = evaluateClassEligibility(dobOverlap1);
assert(eligOverlap1.primary && eligOverlap1.primary.className === "KG1", `DOB 15/03/2022 Primary is KG1 (got ${eligOverlap1.primary?.className})`);
assert(eligOverlap1.alsoEligible.some(c => c.className === "Nursery"), "Also eligible includes Nursery");

// C. Overlapping KG1 & KG2: DOB 15 March 2021
// As of 31 July 2026: 5 Years 4 Months 16 Days
// KG1 is 4y through 5y 6m (Eligible!)
// KG2 is 5y through 6y 6m (Eligible!)
// Primary must be KG2, Also Eligible must include KG1
const dobOverlap2 = new Date(2021, 2, 15);
const eligOverlap2 = evaluateClassEligibility(dobOverlap2);
assert(eligOverlap2.primary && eligOverlap2.primary.className === "KG2", `DOB 15/03/2021 Primary is KG2 (got ${eligOverlap2.primary?.className})`);
assert(eligOverlap2.alsoEligible.some(c => c.className === "KG1"), "Also eligible includes KG1");

// D. Class 1 Eligibility with dedicated date 30 September 2026:
// DOB: 15 August 2020
// As of 31 July 2026: 5 Years 11 Months 16 Days -> KG2 eligible (5y through 6y 6m)
// As of 30 Sept 2026: 6 Years 1 Month 15 Days -> Class 1 eligible (6y through 7y 6m)
// Primary must be Class 1, Also Eligible must include KG2!
const dobClass1 = new Date(2020, 7, 15);
const eligClass1 = evaluateClassEligibility(dobClass1);
assert(eligClass1.primary && eligClass1.primary.className === "Class 1", `DOB 15/08/2020 Primary is Class 1 (got ${eligClass1.primary?.className})`);
assert(eligClass1.alsoEligible.some(c => c.className === "KG2"), "Also eligible includes KG2");
assert(eligClass1.primary.dateUsed === "30 September 2026", "Class 1 strictly used 30 September 2026");

// E. Student too young: DOB 1 January 2024 -> Age on 31 July 2026 is 2y 6m 30d (< 3y)
const dobYoung = new Date(2024, 0, 1);
const eligYoung = evaluateClassEligibility(dobYoung);
assert(eligYoung.primary === null && eligYoung.allEligible.length === 0, "Under 3 years is not eligible for Nursery");

// F. Student too old: DOB 1 January 2018 -> Age on 30 Sept 2026 is 8y 8m 29d (> 7y 6m)
const dobOld = new Date(2018, 0, 1);
const eligOld = evaluateClassEligibility(dobOld);
assert(eligOld.primary === null && eligOld.allEligible.length === 0, "Over 7y 6m is not eligible for Class 1");

// 4. Date Parsers & Formatting
console.log("\n4. Date Parsing & Formatting Tests");
const parsedYmd = parseDateSafe("2026-09-30");
assert(parsedYmd && parsedYmd.getDate() === 30 && parsedYmd.getMonth() === 8 && parsedYmd.getFullYear() === 2026, "Parse YYYY-MM-DD");

const parsedDmy = parseDateSafe("15/08/2020");
assert(parsedDmy && parsedDmy.getDate() === 15 && parsedDmy.getMonth() === 7 && parsedDmy.getFullYear() === 2020, "Parse DD/MM/YYYY");

assert(formatDateDMY(new Date(2026, 8, 30)) === "30/09/2026", "Format DD/MM/YYYY");
assert(formatDateVerbose(new Date(2026, 8, 30)) === "30 September 2026", "Format Verbose");

console.log(`\n================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`================================\n`);

if (failed > 0) process.exit(1);
