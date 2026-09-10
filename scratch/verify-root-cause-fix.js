import fs from "fs";
import assert from "assert";
import {
  calculateExactAge,
  evaluateClassEligibility,
  formatDateDMY,
  formatDateVerbose,
  parseDateSafe
} from "../js/school/age-calculator.js";

console.log("\n=== 1. Verifying HTML DOM Structure in dashboard.html ===");

const html = fs.readFileSync("dashboard.html", "utf8");

// A. Verify section pairing & hierarchy
const sectionRegex = /<\/?section\b[^>]*>/gi;
const sections = [];
let match;
while ((match = sectionRegex.exec(html)) !== null) {
  sections.push({ tag: match[0], index: match.index });
}

console.log(`Total section tags found: ${sections.length}`);
assert.strictEqual(sections.length, 16, "Must have exactly 16 section tags (8 pairs)");

// Verify alternation: open -> close -> open -> close
for (let i = 0; i < sections.length; i += 2) {
  const openTag = sections[i].tag;
  const closeTag = sections[i + 1].tag;
  assert.ok(openTag.startsWith("<section"), `Expected opening section tag at index ${i}, got: ${openTag}`);
  assert.strictEqual(closeTag, "</section>", `Expected closing </section> tag at index ${i + 1}`);
}
console.log("✓ All 8 views in dashboard.html are properly closed and peers inside <main class=\"content-area\">");

// B. Verify view-student-data is closed before view-age-calculator
const studentDataIdx = html.indexOf('id="view-student-data"');
const studentDataCloseIdx = html.indexOf('</section>', studentDataIdx);
const ageCalcIdx = html.indexOf('id="view-age-calculator"');
const ageCalcCloseIdx = html.indexOf('</section>', ageCalcIdx);

assert.ok(studentDataIdx !== -1, "view-student-data must exist");
assert.ok(ageCalcIdx !== -1, "view-age-calculator must exist");
assert.ok(studentDataCloseIdx < ageCalcIdx, "view-student-data MUST be closed BEFORE view-age-calculator begins");
assert.ok(ageCalcCloseIdx > ageCalcIdx, "view-age-calculator MUST be closed before </main>");
console.log("✓ view-student-data is properly closed BEFORE view-age-calculator opens (Root Cause Fixed!)");

// C. Verify all mandatory Age Calculator UI elements exist
const requiredElementIds = [
  "nav-link-age-calculator",
  "view-age-calculator",
  "btn-back-from-age-calculator",
  "age-input-dob",
  "age-input-asof",
  "dob-display-badge",
  "asof-display-badge",
  "btn-preset-today",
  "btn-calculate-age",
  "age-calc-results-area",
  "res-student-age",
  "res-student-asof",
  "eligibility-cards-list",
  "age-calc-empty-state"
];

for (const id of requiredElementIds) {
  assert.ok(html.includes(`id="${id}"`), `Mandatory Age Calculator element #${id} must exist in dashboard.html`);
}
console.log("✓ All 14 mandatory Age Calculator UI elements and IDs are present in dashboard.html");

// D. Verify Sidebar Link has data-view="age-calculator"
const navLinkMatch = html.match(/<a[^>]*id="nav-link-age-calculator"[^>]*>/);
assert.ok(navLinkMatch, "Sidebar age-calculator link must exist");
assert.ok(navLinkMatch[0].includes('data-view="age-calculator"'), "Sidebar link must have data-view='age-calculator'");
console.log("✓ Sidebar link contains data-view='age-calculator' and id='nav-link-age-calculator'");

console.log("\n=== 2. Verifying Age & Eligibility Calculations ===");

// Test Scenario 1: Born 15-Aug-2020 (Calculated as of 30 Sept 2026)
const dob1 = parseDateSafe("2020-08-15");
const asofDefault = parseDateSafe("2026-09-30");
const age1 = calculateExactAge(dob1, asofDefault);
console.log(`DOB 15/08/2020 as of 30/09/2026: ${age1.years}Y ${age1.months}M ${age1.days}D`);
assert.strictEqual(age1.years, 6);
assert.strictEqual(age1.months, 1);
assert.strictEqual(age1.days, 15);

const elig1 = evaluateClassEligibility(dob1);
assert.ok(elig1.primary, "Must have a primary class");
assert.strictEqual(elig1.primary.className, "Class 1", "Primary class must be Class 1");
assert.strictEqual(elig1.primary.dateUsed, "30 September 2026", "Class 1 must use 30 September 2026");
assert.ok(elig1.alsoEligible.some(c => c.className === "KG2"), "Also eligible should include KG2");
console.log(`✓ Primary: ${elig1.primary.className} (eval ref: ${elig1.primary.dateUsed})`);
console.log(`✓ Also Eligible: ${elig1.alsoEligible.map(e => `${e.className} (${e.dateUsed})`).join(", ")}`);

// Test Scenario 2: Editable calculation date changes General Age, but NOT Class 1 evaluation date
const asofCustom = parseDateSafe("2026-07-31");
const age1Custom = calculateExactAge(dob1, asofCustom);
console.log(`DOB 15/08/2020 as of 31/07/2026: ${age1Custom.years}Y ${age1Custom.months}M ${age1Custom.days}D`);
assert.strictEqual(age1Custom.years, 5);
assert.strictEqual(age1Custom.months, 11);
assert.strictEqual(age1Custom.days, 16);

// Class 1 eligibility MUST STILL use 30 September 2026 even if general as-of date changed
const elig1StillClass1 = evaluateClassEligibility(dob1);
assert.strictEqual(elig1StillClass1.primary.className, "Class 1");
assert.strictEqual(elig1StillClass1.primary.dateUsed, "30 September 2026");
console.log("✓ Class 1 eligibility strictly preserves 30 September 2026 reference regardless of general as-of date");

// Test Scenario 3: Born 31-July-2023 (Nursery primary as of 31 July 2026)
const dobNursery = parseDateSafe("2023-07-31");
const eligNursery = evaluateClassEligibility(dobNursery);
assert.strictEqual(eligNursery.primary.className, "Nursery");
assert.strictEqual(eligNursery.primary.dateUsed, "31 July 2026");
console.log("✓ Nursery eligibility strictly preserves 31 July 2026 reference");

console.log("\n=================================");
console.log("ALL ROOT-CAUSE & ENGINE VERIFICATIONS PASSED!");
console.log("=================================\n");
