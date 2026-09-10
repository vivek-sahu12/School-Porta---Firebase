/**
 * Exact Calendar Age & School Class Eligibility Engine
 * Provides accurate calculation of years, months, and days between two dates
 * and evaluates class eligibility according to state/board admission norms.
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Returns the number of days in a specific month of a specific year.
 * Handles leap years automatically.
 * @param {number} year 
 * @param {number} monthIndex 0-indexed (0 = Jan, 11 = Dec)
 * @returns {number}
 */
export function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Calculates exact age in completed years, months, and days from birthDate to targetDate.
 * Follows standard Gregorian calendar accounting:
 * - If target day < birth day, borrows days from the preceding month of targetDate.
 * - If target month < birth month, borrows 12 months from target year.
 * 
 * @param {Date} birthDate 
 * @param {Date} targetDate 
 * @returns {{ years: number, months: number, days: number, totalDays: number } | null}
 */
export function calculateExactAge(birthDate, targetDate) {
  if (!birthDate || !targetDate || isNaN(birthDate.getTime()) || isNaN(targetDate.getTime())) {
    return null;
  }

  // Normalize to date-only at midnight to avoid timezone / daylight-saving quirks
  const bYear = birthDate.getFullYear();
  const bMonth = birthDate.getMonth();
  const bDay = birthDate.getDate();

  const tYear = targetDate.getFullYear();
  const tMonth = targetDate.getMonth();
  const tDay = targetDate.getDate();

  // Validate that birthDate is not in the future relative to targetDate
  if (targetDate < birthDate) {
    return {
      years: 0,
      months: 0,
      days: 0,
      isFuture: true
    };
  }

  let years = tYear - bYear;
  let months = tMonth - bMonth;
  let days = tDay - bDay;

  if (days < 0) {
    // Borrow days from the previous month
    // Month index to borrow from is previous month of targetDate:
    // (tMonth - 1 + 12) % 12, taking year into account if January
    const prevMonthIndex = tMonth === 0 ? 11 : tMonth - 1;
    const prevMonthYear = tMonth === 0 ? tYear - 1 : tYear;
    const daysInPrevMonth = getDaysInMonth(prevMonthYear, prevMonthIndex);
    
    days += daysInPrevMonth;
    months -= 1;
  }

  if (months < 0) {
    months += 12;
    years -= 1;
  }

  return {
    years,
    months,
    days,
    isFuture: false
  };
}

/**
 * Formats a Date object or YYYY-MM-DD string into "DD/MM/YYYY" presentation.
 * @param {Date|string} dateInput 
 * @returns {string}
 */
export function formatDateDMY(dateInput) {
  if (!dateInput) return "";
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formats a Date object into human-readable text, e.g. "30 September 2026"
 * @param {Date|string} dateInput 
 * @returns {string}
 */
export function formatDateVerbose(dateInput) {
  if (!dateInput) return "";
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  const day = d.getDate();
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Parses a "YYYY-MM-DD" or "DD/MM/YYYY" string safely into a local midnight Date.
 * @param {string} dateStr 
 * @returns {Date|null}
 */
export function parseDateSafe(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const s = dateStr.trim();

  // Handle YYYY-MM-DD (standard HTML5 date input value)
  const ymdMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10) - 1;
    const d = parseInt(ymdMatch[3], 10);
    const date = new Date(y, m, d);
    if (date.getFullYear() === y && date.getMonth() === m && date.getDate() === d) {
      return date;
    }
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10) - 1;
    const y = parseInt(dmyMatch[3], 10);
    const date = new Date(y, m, d);
    if (date.getFullYear() === y && date.getMonth() === m && date.getDate() === d) {
      return date;
    }
  }

  return null;
}

/**
 * Checks if age (years, months, days) falls within [minYears, minMonths] and [maxYears, maxMonths].
 * Upper bound is inclusive (e.g. through 4 years 6 months: <= 4y 6m 0d or through that month).
 * 
 * Boundary interpretation:
 * - Min: age >= minYears years + minMonths months
 * - Max: age <= maxYears years + maxMonths months (e.g. 4 years 6 months 0 days)
 *   If day > 0 at exactly maxYears + maxMonths, it has exceeded the range.
 */
function isAgeInRange(age, minYears, minMonths, maxYears, maxMonths) {
  if (!age || age.isFuture) return false;
  const totalDays = age.years * 365.25 + age.months * 30.44 + age.days;
  const minDays = minYears * 365.25 + minMonths * 30.44;
  const maxDays = maxYears * 365.25 + maxMonths * 30.44;

  // Exact calendar comparison:
  // Check >= lower bound
  if (age.years < minYears) return false;
  if (age.years === minYears && age.months < minMonths) return false;

  // Check <= upper bound
  if (age.years > maxYears) return false;
  if (age.years === maxYears) {
    if (age.months > maxMonths) return false;
    if (age.months === maxMonths && age.days > 0) return false;
  }

  return true;
}

/**
 * Evaluates School Class Eligibility according to state/board norms:
 * 
 * Calculation Dates:
 * - Nursery / KG1 / KG2 -> Strictly 31 July 2026
 * - Class 1             -> Strictly 30 September 2026
 * 
 * Eligibility Age Ranges:
 * - Nursery: 3 Years through 4 Years 6 Months (as of 31 July 2026)
 * - KG1:     4 Years through 5 Years 6 Months (as of 31 July 2026)
 * - KG2:     5 Years through 6 Years 6 Months (as of 31 July 2026)
 * - Class 1: 6 Years through 7 Years 6 Months (as of 30 September 2026)
 * 
 * Primary Class + Also Eligible logic:
 * Natural progression rank: Nursery (1) < KG1 (2) < KG2 (3) < Class 1 (4).
 * The highest eligible class matching the student's age is the Primary Class.
 * Any other eligible class(es) become "Also Eligible".
 * 
 * @param {Date} birthDate 
 * @returns {{
 *   primary: { className: string, age: object, dateUsed: string, explanation: string } | null,
 *   alsoEligible: Array<{ className: string, age: object, dateUsed: string, explanation: string }>,
 *   allEligible: Array<{ className: string, age: object, dateUsed: string, isPrimary: boolean, explanation: string }>
 * }}
 */
export function evaluateClassEligibility(birthDate) {
  if (!birthDate) {
    return { primary: null, alsoEligible: [], allEligible: [] };
  }

  const DATE_PRE_PRIMARY = new Date(2026, 6, 31); // 31 July 2026
  const DATE_CLASS_1 = new Date(2026, 8, 30);     // 30 September 2026

  const agePrePrimary = calculateExactAge(birthDate, DATE_PRE_PRIMARY);
  const ageClass1 = calculateExactAge(birthDate, DATE_CLASS_1);

  const eligibleClasses = [];

  // 1. Nursery (3y 0m through 4y 6m as of 31 July 2026)
  if (agePrePrimary && !agePrePrimary.isFuture && isAgeInRange(agePrePrimary, 3, 0, 4, 6)) {
    eligibleClasses.push({
      className: "Nursery",
      rank: 1,
      age: agePrePrimary,
      dateUsed: "31 July 2026",
      explanation: `Student is ${agePrePrimary.years} Years ${agePrePrimary.months} Months ${agePrePrimary.days} Days old as of 31 July 2026.`
    });
  }

  // 2. KG1 (4y 0m through 5y 6m as of 31 July 2026)
  if (agePrePrimary && !agePrePrimary.isFuture && isAgeInRange(agePrePrimary, 4, 0, 5, 6)) {
    eligibleClasses.push({
      className: "KG1",
      rank: 2,
      age: agePrePrimary,
      dateUsed: "31 July 2026",
      explanation: `Student is ${agePrePrimary.years} Years ${agePrePrimary.months} Months ${agePrePrimary.days} Days old as of 31 July 2026.`
    });
  }

  // 3. KG2 (5y 0m through 6y 6m as of 31 July 2026)
  if (agePrePrimary && !agePrePrimary.isFuture && isAgeInRange(agePrePrimary, 5, 0, 6, 6)) {
    eligibleClasses.push({
      className: "KG2",
      rank: 3,
      age: agePrePrimary,
      dateUsed: "31 July 2026",
      explanation: `Student is ${agePrePrimary.years} Years ${agePrePrimary.months} Months ${agePrePrimary.days} Days old as of 31 July 2026.`
    });
  }

  // 4. Class 1 (6y 0m through 7y 6m as of 30 September 2026)
  if (ageClass1 && !ageClass1.isFuture && isAgeInRange(ageClass1, 6, 0, 7, 6)) {
    eligibleClasses.push({
      className: "Class 1",
      rank: 4,
      age: ageClass1,
      dateUsed: "30 September 2026",
      isClass1Special: true,
      explanation: `Student is ${ageClass1.years} Years ${ageClass1.months} Months ${ageClass1.days} Days old as of 30 September 2026.`
    });
  }

  if (eligibleClasses.length === 0) {
    return {
      primary: null,
      alsoEligible: [],
      allEligible: []
    };
  }

  // Primary class is the highest ranked class eligible
  eligibleClasses.sort((a, b) => b.rank - a.rank);

  const primary = {
    ...eligibleClasses[0],
    isPrimary: true
  };

  const alsoEligible = eligibleClasses.slice(1).map(c => ({
    ...c,
    isPrimary: false
  }));

  return {
    primary,
    alsoEligible,
    allEligible: [primary, ...alsoEligible]
  };
}
