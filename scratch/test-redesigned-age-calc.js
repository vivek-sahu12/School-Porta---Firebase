import fs from "fs";
import assert from "assert";
import {
  calculateExactAge,
  evaluateClassEligibility,
  formatDateDMY,
  formatDateVerbose,
  getDaysInMonth,
  parseDateSafe
} from "../js/school/age-calculator.js";

console.log("\n=== Testing Redesigned Age Calculator & Date Picker Engine ===\n");

// 1. Test Date Logic & Leap Years
console.log("1. Leap Year & Days in Month Validation");
assert.strictEqual(getDaysInMonth(2024, 1), 29, "Feb 2024 (leap year) must have 29 days");
assert.strictEqual(getDaysInMonth(2025, 1), 28, "Feb 2025 must have 28 days");
assert.strictEqual(getDaysInMonth(2026, 1), 28, "Feb 2026 must have 28 days");
assert.strictEqual(getDaysInMonth(2028, 1), 29, "Feb 2028 (leap year) must have 29 days");
assert.strictEqual(getDaysInMonth(2026, 6), 31, "July 2026 must have 31 days");
assert.strictEqual(getDaysInMonth(2026, 8), 30, "September 2026 must have 30 days");
console.log("  ✓ PASS: Leap years and month lengths calculated accurately");

// 2. Test Default Calculation Date (31 July 2026)
console.log("\n2. Default Calculation Date (31 July 2026) & Exact Age");
const defaultAsof = parseDateSafe("2026-07-31");
assert.ok(defaultAsof, "Must parse 2026-07-31");
assert.strictEqual(formatDateVerbose(defaultAsof), "31 July 2026");

// Example A: Born 15-Mar-2021 as of default 31 July 2026
const dob1 = parseDateSafe("2021-03-15");
const age1 = calculateExactAge(dob1, defaultAsof);
console.log(`  DOB 15/03/2021 as of 31/07/2026: ${age1.years}Y ${age1.months}M ${age1.days}D`);
assert.strictEqual(age1.years, 5);
assert.strictEqual(age1.months, 4);
assert.strictEqual(age1.days, 16);
console.log("  ✓ PASS: Exact general age calculated as of 31 July 2026");

// 3. Test Class Eligibility with Priority & Fixed Internal Dates
console.log("\n3. Class Eligibility Priority & Rule Dates");
const elig1 = evaluateClassEligibility(dob1);
assert.ok(elig1.primary, "Must have a primary class");
assert.strictEqual(elig1.primary.className, "KG2", "Primary class for 5y 4m 16d must be KG2");
assert.strictEqual(elig1.primary.dateUsed, "31 July 2026", "KG2 must use 31 July 2026");
assert.ok(elig1.alsoEligible.some(c => c.className === "KG1"), "Must also be eligible for KG1");
assert.strictEqual(elig1.alsoEligible[0].dateUsed, "31 July 2026");
console.log(`  ✓ PASS: Primary: ${elig1.primary.className} (Student Age: ${elig1.primary.age.years}Y ${elig1.primary.age.months}M ${elig1.primary.age.days}D, Calculated: ${elig1.primary.dateUsed})`);
console.log(`  ✓ PASS: Also Eligible: ${elig1.alsoEligible[0].className} (Calculated: ${elig1.alsoEligible[0].dateUsed})`);

// Example B: Class 1 special internal rule (Born 15-Aug-2020)
const dobClass1 = parseDateSafe("2020-08-15");
// When user keeps default calculation date of 31 July 2026:
const ageClass1General = calculateExactAge(dobClass1, defaultAsof);
console.log(`  DOB 15/08/2020 general age as of 31/07/2026: ${ageClass1General.years}Y ${ageClass1General.months}M ${ageClass1General.days}D`);
assert.strictEqual(ageClass1General.years, 5);
assert.strictEqual(ageClass1General.months, 11);
assert.strictEqual(ageClass1General.days, 16);

// Class 1 eligibility calculation MUST STILL internally use 30 September 2026:
const eligClass1 = evaluateClassEligibility(dobClass1);
assert.strictEqual(eligClass1.primary.className, "Class 1", "Primary class must be Class 1");
assert.strictEqual(eligClass1.primary.dateUsed, "30 September 2026", "Class 1 rule must use 30 September 2026");
assert.strictEqual(eligClass1.primary.age.years, 6);
assert.strictEqual(eligClass1.primary.age.months, 1);
assert.strictEqual(eligClass1.primary.age.days, 15);
assert.ok(eligClass1.alsoEligible.some(c => c.className === "KG2"), "Must also be eligible for KG2");
assert.strictEqual(eligClass1.alsoEligible[0].dateUsed, "31 July 2026", "KG2 also-eligible must use 31 July 2026");
console.log(`  ✓ PASS: Class 1 internally evaluated as of 30 September 2026: ${eligClass1.primary.age.years}Y ${eligClass1.primary.age.months}M ${eligClass1.primary.age.days}D`);
console.log(`  ✓ PASS: KG2 also-eligible internally evaluated as of 31 July 2026: ${eligClass1.alsoEligible[0].age.years}Y ${eligClass1.alsoEligible[0].age.months}M ${eligClass1.alsoEligible[0].age.days}D`);

// 4. Test User Modifying "Calculate Age As Of" Date
console.log("\n4. Changing 'Calculate Age As Of' Date");
const customAsof = parseDateSafe("2026-12-31");
const ageCustom = calculateExactAge(dobClass1, customAsof);
assert.strictEqual(ageCustom.years, 6);
assert.strictEqual(ageCustom.months, 4);
assert.strictEqual(ageCustom.days, 16);
console.log(`  ✓ PASS: General student age updates to 6Y 4M 16D when as of date is 31/12/2026`);

// The eligibility must NOT change to 31/12/2026 - Class 1 still uses 30 Sept 2026 & KG2 uses 31 July 2026
const eligCustom = evaluateClassEligibility(dobClass1);
assert.strictEqual(eligCustom.primary.className, "Class 1");
assert.strictEqual(eligCustom.primary.dateUsed, "30 September 2026");
assert.strictEqual(eligCustom.alsoEligible[0].dateUsed, "31 July 2026");
console.log("  ✓ PASS: Eligibility reference dates strictly preserved regardless of custom calculation date");

// 5. Test dashboard.html Markup Redesign
console.log("\n5. HTML Markup & UI Structure in dashboard.html");
const html = fs.readFileSync("dashboard.html", "utf8");

// Verify triggers exist
assert.ok(html.includes('id="btn-trigger-dob"'), "Must have #btn-trigger-dob trigger card");
assert.ok(html.includes('id="btn-trigger-asof"'), "Must have #btn-trigger-asof trigger card");
assert.ok(html.includes('id="dob-display-val"'), "Must have #dob-display-val");
assert.ok(html.includes('id="asof-display-val"'), "Must have #asof-display-val");
assert.ok(html.includes('31 July 2026'), "Must default to 31 July 2026");
assert.ok(html.includes('value="2026-07-31"'), "Must have default value 2026-07-31 for asof");

// Verify preset buttons are REMOVED
assert.ok(!html.includes('preset-date-btn'), "Preset date buttons must be completely removed");
assert.ok(!html.includes('btn-preset-today'), "Today button must be completely removed");
assert.ok(!html.includes('30 Sept 2026 (Default)'), "30 Sept default preset button must be removed");

// Verify "Calculated as of..." subtext under student age is REMOVED
assert.ok(!html.includes('id="res-student-asof"'), "#res-student-asof subtitle must be removed");
assert.ok(html.includes('id="res-student-age"'), "Must have #res-student-age");

console.log("  ✓ PASS: Date triggers, default 31 July 2026, removed presets, and simplified student age confirmed");

console.log("\n=================================");
console.log("ALL REDESIGNED AGE CALCULATOR TESTS PASSED!");
console.log("=================================\n");
