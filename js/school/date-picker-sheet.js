/**
 * ============================================================================
 * MOBILE-FIRST REUSABLE DATE PICKER COMPONENT (Bottom Sheet / Dialog)
 * Plain Vanilla JS, Zero Dependencies
 *
 * Implements strict state-management:
 * - datePickerState: { committedDate, draftDate, viewYear, viewMonth, mode }
 * - draftDate is purely internal until "Done" is tapped
 * - "Cancel", scrim tap, swipe-down, or Escape discards draftDate completely
 * ============================================================================
 */

import { formatDateDMY, formatDateVerbose, getDaysInMonth, parseDateSafe } from "./age-calculator.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * Creates and binds a reusable date picker to an input and optional trigger/display elements.
 * @param {Object} options
 * @param {HTMLInputElement} options.inputEl - Bound input element (hidden or visible)
 * @param {HTMLElement} [options.triggerEl] - Element that opens the picker when clicked
 * @param {HTMLElement} [options.displayEl] - Element displaying the formatted committed date
 * @param {string} [options.title] - Dialog title (default: "Select Date")
 * @param {number} [options.minYear] - Minimum selectable year (default: 1950)
 * @param {number} [options.maxYear] - Maximum selectable year (default: currentYear + 1)
 * @param {Date} [options.defaultDate] - Default fallback date when input is empty
 * @param {Function} [options.onCommit] - Callback fired after Done commits: (Date) => {}
 * @returns {Object} Controller instance with .open(), .close(), and .getCommittedDate()
 */
export function createDatePicker({
  inputEl,
  triggerEl = null,
  displayEl = null,
  title = "Select Date",
  minYear = 1950,
  maxYear = new Date().getFullYear() + 1,
  defaultDate = new Date(),
  onCommit = () => {}
}) {
  if (!inputEl) {
    throw new Error("createDatePicker requires an inputEl");
  }

  // Parse initial committed value from input if present
  let initialCommitted = null;
  if (inputEl.value) {
    initialCommitted = parseDateSafe(inputEl.value);
  } else if (defaultDate) {
    initialCommitted = defaultDate instanceof Date ? new Date(defaultDate) : parseDateSafe(defaultDate);
  }

  // --- Strict State Model (Section 0) ---
  const state = {
    committedDate: initialCommitted && !isNaN(initialCommitted.getTime()) ? initialCommitted : null,
    draftDate: null,
    viewYear: (initialCommitted && !isNaN(initialCommitted.getTime()) ? initialCommitted : new Date()).getFullYear(),
    viewMonth: (initialCommitted && !isNaN(initialCommitted.getTime()) ? initialCommitted : new Date()).getMonth(),
    mode: "calendar" // "calendar" | "year-select"
  };

  // Sync initial display if provided
  if (displayEl && state.committedDate) {
    displayEl.textContent = formatDateVerbose(state.committedDate);
    displayEl.classList.remove("placeholder");
  }

  let overlayEl = null;
  let sheetEl = null;

  const checkReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /**
   * Opens the picker bottom sheet / dialog
   */
  function open() {
    // Rule 1: On open, draftDate = committedDate ?? defaultDate
    const baseDate = state.committedDate
      ? new Date(state.committedDate)
      : (defaultDate ? new Date(defaultDate) : new Date());

    state.draftDate = baseDate;
    state.viewYear = baseDate.getFullYear();
    state.viewMonth = baseDate.getMonth();
    state.mode = "calendar";

    buildDOM();
    render();

    document.body.style.overflow = "hidden";

    // Trigger animation
    requestAnimationFrame(() => {
      if (overlayEl) {
        overlayEl.removeAttribute("hidden");
        overlayEl.classList.add("active");
      }
    });

    // Attach global listeners
    document.addEventListener("keydown", handleKeydown);
  }

  /**
   * Closes the picker and cleans up DOM
   */
  function close() {
    if (!overlayEl) return;

    document.removeEventListener("keydown", handleKeydown);
    document.body.style.overflow = "";

    const isReduced = checkReducedMotion();
    if (isReduced) {
      cleanupDOM();
      return;
    }

    overlayEl.classList.remove("active");
    overlayEl.classList.add("closing");

    setTimeout(() => {
      cleanupDOM();
    }, 200);
  }

  function cleanupDOM() {
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
    }
    overlayEl = null;
    sheetEl = null;
  }

  /**
   * Commits the draftDate, writes to input, and fires event
   */
  function commit() {
    if (!state.draftDate) return;

    // Rule 3: committedDate = draftDate -> write to input -> fire change -> onCommit
    state.committedDate = new Date(state.draftDate);

    const y = state.committedDate.getFullYear();
    const m = String(state.committedDate.getMonth() + 1).padStart(2, "0");
    const d = String(state.committedDate.getDate()).padStart(2, "0");
    const ymdString = `${y}-${m}-${d}`;

    inputEl.value = ymdString;

    if (displayEl) {
      displayEl.textContent = formatDateVerbose(state.committedDate);
      displayEl.classList.remove("placeholder");
    }

    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));

    if (typeof onCommit === "function") {
      onCommit(new Date(state.committedDate));
    }

    close();
  }

  /**
   * Cancels and discards draftDate
   */
  function cancel() {
    // Rule 4: discard draftDate, committedDate untouched, input untouched
    state.draftDate = null;
    close();
  }

  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  /**
   * Builds the DOM skeleton for the picker
   */
  function buildDOM() {
    if (overlayEl) cleanupDOM();

    overlayEl = document.createElement("div");
    overlayEl.className = "dp-overlay";
    overlayEl.setAttribute("hidden", "true");

    sheetEl = document.createElement("div");
    sheetEl.className = "dp-sheet";
    sheetEl.setAttribute("role", "dialog");
    sheetEl.setAttribute("aria-modal", "true");
    sheetEl.setAttribute("aria-label", title);

    overlayEl.appendChild(sheetEl);
    document.body.appendChild(overlayEl);

    // Click outside dialog popup on blurred scrim = Cancel
    overlayEl.addEventListener("click", (e) => {
      if (e.target === overlayEl) {
        cancel();
      }
    });
  }

  /**
   * Renders the modal based strictly on state
   */
  function render() {
    if (!sheetEl || !state.draftDate) return;

    const draftYear = state.draftDate.getFullYear();
    const draftMonth = state.draftDate.getMonth();
    const draftDay = state.draftDate.getDate();

    // Clamp draftDay if month length changed
    const maxDaysInDraftMonth = getDaysInMonth(draftYear, draftMonth);
    if (draftDay > maxDaysInDraftMonth) {
      state.draftDate = new Date(draftYear, draftMonth, maxDaysInDraftMonth);
    }

    const formattedDisplay = formatDateVerbose(state.draftDate);

    sheetEl.innerHTML = `
      <div class="dp-header">
        <span class="dp-title">${title}</span>
        <button type="button" class="dp-close-btn" aria-label="Close date picker">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="dp-selected-display" aria-live="polite">
        ${formattedDisplay}
      </div>

      <!-- Unified Calendar View -->
      <div class="dp-calendar-view">
        <div class="dp-month-bar">
          <button type="button" class="dp-month-nav dp-month-prev" aria-label="Previous month">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>

          <div class="dp-selectors-inline">
            <div class="dp-select-wrap">
              <select class="dp-inline-select dp-select-month" aria-label="Select Month">
                ${MONTH_NAMES.map((m, idx) => `<option value="${idx}" ${idx === state.viewMonth ? 'selected' : ''}>${m}</option>`).join("")}
              </select>
              <svg class="dp-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
            <div class="dp-select-wrap">
              <select class="dp-inline-select dp-select-year" aria-label="Select Year">
                ${(() => {
                  let yrOpts = "";
                  for (let y = maxYear; y >= minYear; y--) {
                    yrOpts += `<option value="${y}" ${y === state.viewYear ? 'selected' : ''}>${y}</option>`;
                  }
                  return yrOpts;
                })()}
              </select>
              <svg class="dp-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
          </div>

          <button type="button" class="dp-month-nav dp-month-next" aria-label="Next month">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>

        <div class="dp-weekdays-row">
          ${DAY_HEADERS.map(d => `<span class="dp-weekday">${d}</span>`).join("")}
        </div>

        <div class="dp-days-grid">
          ${renderDaysGrid()}
        </div>
      </div>

      <div class="dp-actions">
        <button type="button" class="dp-btn dp-cancel">Cancel</button>
        <button type="button" class="dp-btn dp-done">Done</button>
      </div>
    `;

    bindDOMEvents();
  }

  function renderDaysGrid() {
    const firstDayIndex = new Date(state.viewYear, state.viewMonth, 1).getDay(); // 0 = Sun
    const totalDays = getDaysInMonth(state.viewYear, state.viewMonth);
    const draftYear = state.draftDate.getFullYear();
    const draftMonth = state.draftDate.getMonth();
    const draftDay = state.draftDate.getDate();

    let html = "";

    // Empty offset cells
    for (let i = 0; i < firstDayIndex; i++) {
      html += `<div class="dp-day-cell empty"></div>`;
    }

    // Days 1..totalDays
    for (let day = 1; day <= totalDays; day++) {
      const isSelected =
        state.viewYear === draftYear &&
        state.viewMonth === draftMonth &&
        day === draftDay;

      html += `
        <button type="button" class="dp-day-cell ${isSelected ? 'active' : ''}" data-day="${day}" aria-label="${day} ${MONTH_NAMES[state.viewMonth]} ${state.viewYear}">
          ${day}
        </button>
      `;
    }

    return html;
  }

  function bindDOMEvents() {
    // Close button
    const closeBtn = sheetEl.querySelector(".dp-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", cancel);
    }

    // Month Selector Change
    const monthSelect = sheetEl.querySelector(".dp-select-month");
    if (monthSelect) {
      monthSelect.addEventListener("change", (e) => {
        const newMonth = parseInt(e.target.value, 10);
        state.viewMonth = newMonth;
        const maxDays = getDaysInMonth(state.viewYear, newMonth);
        const clampedDay = Math.min(state.draftDate.getDate(), maxDays);
        state.draftDate = new Date(state.viewYear, newMonth, clampedDay);
        render();
      });
    }

    // Year Selector Change
    const yearSelect = sheetEl.querySelector(".dp-select-year");
    if (yearSelect) {
      yearSelect.addEventListener("change", (e) => {
        const newYear = parseInt(e.target.value, 10);
        state.viewYear = newYear;
        const maxDays = getDaysInMonth(newYear, state.viewMonth);
        const clampedDay = Math.min(state.draftDate.getDate(), maxDays);
        state.draftDate = new Date(newYear, state.viewMonth, clampedDay);
        render();
      });
    }

    // Month Navigation arrows (prev / next)
    const prevBtn = sheetEl.querySelector(".dp-month-prev");
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        if (state.viewMonth === 0) {
          state.viewMonth = 11;
          state.viewYear -= 1;
        } else {
          state.viewMonth -= 1;
        }
        const maxDays = getDaysInMonth(state.viewYear, state.viewMonth);
        const clampedDay = Math.min(state.draftDate.getDate(), maxDays);
        state.draftDate = new Date(state.viewYear, state.viewMonth, clampedDay);
        render();
      });
    }

    const nextBtn = sheetEl.querySelector(".dp-month-next");
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        if (state.viewMonth === 11) {
          state.viewMonth = 0;
          state.viewYear += 1;
        } else {
          state.viewMonth += 1;
        }
        const maxDays = getDaysInMonth(state.viewYear, state.viewMonth);
        const clampedDay = Math.min(state.draftDate.getDate(), maxDays);
        state.draftDate = new Date(state.viewYear, state.viewMonth, clampedDay);
        render();
      });
    }

    // Day Cells: Clicking day ONLY mutates draftDate and re-renders
    const dayCells = sheetEl.querySelectorAll(".dp-day-cell:not(.empty)");
    dayCells.forEach(btn => {
      btn.addEventListener("click", () => {
        const selectedDay = parseInt(btn.getAttribute("data-day"), 10);
        state.draftDate = new Date(state.viewYear, state.viewMonth, selectedDay);
        render();
      });
    });

    // Action buttons
    const cancelBtn = sheetEl.querySelector(".dp-cancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", cancel);
    }

    const doneBtn = sheetEl.querySelector(".dp-done");
    if (doneBtn) {
      doneBtn.addEventListener("click", commit);
    }
  }

  // Bind triggers to open modal
  if (triggerEl) {
    triggerEl.addEventListener("click", (e) => {
      e.preventDefault();
      open();
    });
  }

  inputEl.addEventListener("click", (e) => {
    e.preventDefault();
    open();
  });

  return {
    open,
    close,
    getCommittedDate: () => (state.committedDate ? new Date(state.committedDate) : null),
    setCommittedDate: (newDate) => {
      state.committedDate = newDate ? new Date(newDate) : null;
      if (state.committedDate) {
        const y = state.committedDate.getFullYear();
        const m = String(state.committedDate.getMonth() + 1).padStart(2, "0");
        const d = String(state.committedDate.getDate()).padStart(2, "0");
        inputEl.value = `${y}-${m}-${d}`;
        if (displayEl) {
          displayEl.textContent = formatDateVerbose(state.committedDate);
          displayEl.classList.remove("placeholder");
        }
      } else {
        inputEl.value = "";
        if (displayEl) {
          displayEl.textContent = "Select Date";
          displayEl.classList.add("placeholder");
        }
      }
    }
  };
}
