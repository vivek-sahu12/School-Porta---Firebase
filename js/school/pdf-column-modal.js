/**
 * PDF Column Selection Popup (Mobile-First Bottom Sheet & Desktop Modal)
 * Provides dynamic sequence ordering, 2-column selection grid, blank column insertion,
 * 7-column limit, localStorage persistence, and instant visual feedback.
 */

import { DATASET_KEYS } from "./student-service.js";
import {
  pushModalHistory,
  cleanupModalHistory,
  registerModalCloseHandler
} from "./modal-history-manager.js";
import { getSchoolDataColumns } from "../school-config.js";

export const MAX_USER_COLUMNS = 7;

/**
 * Dataset-specific available selectable columns
 */
export const DATASET_COLUMN_DEFS = {
  [DATASET_KEYS.UDISE]: [
    { key: "className", label: "Class", defaultOrder: 1 },
    { key: "studentName", label: "Name", defaultOrder: 2 },
    { key: "gender", label: "Gender", defaultOrder: 3 },
    { key: "penNo", label: "Student PEN", defaultOrder: 4 },
    { key: "fatherName", label: "Father Name", defaultOrder: 5 },
    { key: "category", label: "Social Category", defaultOrder: 6 }
  ],
  [DATASET_KEYS.THREE_POINT_ZERO]: [
    { key: "className", label: "Class", defaultOrder: 1 },
    { key: "samagraId", label: "Samagra ID", defaultOrder: 2 },
    { key: "studentName", label: "Student Name", defaultOrder: 3 },
    { key: "fatherName", label: "Father Name", defaultOrder: 4 },
    { key: "category", label: "Category", defaultOrder: 5 },
    { key: "gender", label: "Gender", defaultOrder: 6 }
  ],
  [DATASET_KEYS.SCHOOL_DATA]: [
    { key: "scholarNo", label: "Scholar No", defaultOrder: 1 },
    { key: "studentName", label: "Student Name", defaultOrder: 2 },
    { key: "className", label: "Class", defaultOrder: 3 },
    { key: "section", label: "Section", defaultOrder: 4 },
    { key: "gender", label: "Gender", defaultOrder: 5 },
    { key: "category", label: "Category", defaultOrder: 6 },
    { key: "fatherName", label: "Father Name", defaultOrder: 7 }
  ]
};

/**
 * Storage key for persisting column preferences per dataset
 */
function getStorageKey(datasetKey) {
  return `school_portal_pdf_cols_${datasetKey || "default"}`;
}

/**
 * Resolve effective selectable columns considering school features
 */
export function getEffectiveColumnDefs(datasetKey, school) {
  if (datasetKey === DATASET_KEYS.SCHOOL_DATA) {
    const schoolCols = getSchoolDataColumns(school);
    return schoolCols.map((c, idx) => ({
      key: c.columnId,
      label: c.label,
      defaultOrder: idx + 1
    }));
  }
  let defs = DATASET_COLUMN_DEFS[datasetKey] || DATASET_COLUMN_DEFS[DATASET_KEYS.SCHOOL_DATA];
  return defs;
}

/**
 * Load saved column configuration or return sensible default
 */
export function loadSavedColumnConfig(datasetKey, school) {
  const defs = getEffectiveColumnDefs(datasetKey, school);
  const validKeys = new Set(defs.map(d => d.key));

  try {
    const raw = localStorage.getItem(getStorageKey(datasetKey));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Validate each item
        const validItems = [];
        let count = 0;
        for (const item of parsed) {
          if (count >= MAX_USER_COLUMNS) break;
          if (item.type === "field" && validKeys.has(item.key)) {
            validItems.push({ type: "field", key: item.key });
            count++;
          } else if (item.type === "blank") {
            validItems.push({ type: "blank", id: item.id || `b_${Math.random()}` });
            count++;
          }
        }
        if (validItems.length > 0) {
          return validItems;
        }
      }
    }
  } catch (e) {
    console.warn("Could not load saved PDF columns config:", e);
  }

  // Sensible default: all defined columns in default order (capped at MAX_USER_COLUMNS)
  return defs.slice(0, MAX_USER_COLUMNS).map(d => ({ type: "field", key: d.key }));
}

/**
 * Save chosen column configuration to localStorage
 */
export function saveColumnConfig(datasetKey, selectedItems) {
  try {
    localStorage.setItem(getStorageKey(datasetKey), JSON.stringify(selectedItems));
  } catch (e) {
    console.warn("Could not save PDF columns config:", e);
  }
}

/**
 * State of current open modal
 */
let currentModalState = null;

/**
 * Opens the PDF Column Selection Modal
 *
 * @param {Object} options
 * @param {string} options.datasetKey
 * @param {Object} [options.school]
 * @param {Function} options.onGenerate - Callback receiving final column config
 * @param {Function} [options.onToast] - Optional toast notifier
 */
export function openPdfColumnModal({ datasetKey, school, onGenerate, onToast }) {
  // Ensure existing modal is cleaned up
  closePdfColumnModal();

  const defs = getEffectiveColumnDefs(datasetKey, school);
  const savedItems = loadSavedColumnConfig(datasetKey, school);

  currentModalState = {
    datasetKey,
    school,
    defs,
    selectedItems: [...savedItems], // Array of { type: 'field', key } | { type: 'blank', id }
    onGenerate,
    onToast
  };

  renderModalDom();
  pushModalHistory("pdf");
}

/**
 * Closes the modal with smooth transition
 * @param {Object} [options]
 * @param {boolean} [options.fromBack=false] - If true, triggered by history back event (do not call history.back)
 */
export function closePdfColumnModal({ fromBack = false } = {}) {
  const overlay = document.getElementById("pdf-col-modal-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 200);
  }
  document.body.classList.remove("modal-open-scroll-lock");
  currentModalState = null;

  if (!fromBack) {
    cleanupModalHistory("pdf");
  }
}

// Register close handler for back button interception
registerModalCloseHandler("pdf", closePdfColumnModal);

/**
 * Renders the modal overlay & inner controls
 */
function renderModalDom() {
  if (!currentModalState) return;

  let overlay = document.getElementById("pdf-col-modal-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "pdf-col-modal-overlay";
    overlay.className = "pdf-col-modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "pdf-modal-heading");
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="pdf-col-modal-backdrop" id="pdf-col-backdrop"></div>
    <div class="pdf-col-modal-sheet" id="pdf-col-sheet">
      <!-- Header -->
      <div class="pdf-col-modal-header">
        <div>
          <h3 id="pdf-modal-heading" class="pdf-col-modal-title">Select PDF Columns</h3>
          <p class="pdf-col-modal-subtitle">Tap columns in desired order (Max ${MAX_USER_COLUMNS})</p>
        </div>
        <button type="button" id="pdf-col-close-btn" class="pdf-col-close-btn" aria-label="Close column selection dialog">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <!-- Scrollable Content Body -->
      <div class="pdf-col-modal-body" id="pdf-col-modal-body">
        <!-- Quick Actions (Select All / Clear All) -->
        <div class="pdf-col-quick-bar">
          <button type="button" id="pdf-col-btn-select-all" class="pdf-col-quick-btn">Select All</button>
          <span class="pdf-col-quick-sep" aria-hidden="true">•</span>
          <button type="button" id="pdf-col-btn-clear-all" class="pdf-col-quick-btn">Clear All</button>
          <div class="pdf-col-count-badge" id="pdf-col-count-badge">0/${MAX_USER_COLUMNS}</div>
        </div>

        <!-- Two-Column Grid of Dataset Fields -->
        <div class="pdf-col-grid" id="pdf-col-grid">
          <!-- Dynamically rendered field buttons -->
        </div>

        <!-- Blank Columns Section -->
        <div class="pdf-col-blank-section">
          <button type="button" id="pdf-col-btn-add-blank" class="pdf-col-add-blank-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span>Add Blank Column</span>
          </button>

          <div class="pdf-col-blank-chips" id="pdf-col-blank-chips">
            <!-- Dynamically rendered blank column chips -->
          </div>
        </div>
      </div>

      <!-- Footer Action -->
      <div class="pdf-col-footer">
        <button type="button" id="pdf-col-btn-generate" class="btn btn-primary pdf-col-generate-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          <span id="pdf-col-generate-label">Generate PDF</span>
        </button>
      </div>
    </div>
  `;

  // Attach event listeners
  document.getElementById("pdf-col-backdrop").addEventListener("click", closePdfColumnModal);
  document.getElementById("pdf-col-close-btn").addEventListener("click", closePdfColumnModal);

  document.getElementById("pdf-col-btn-select-all").addEventListener("click", handleSelectAll);
  document.getElementById("pdf-col-btn-clear-all").addEventListener("click", handleClearAll);
  document.getElementById("pdf-col-btn-add-blank").addEventListener("click", handleAddBlankColumn);
  document.getElementById("pdf-col-btn-generate").addEventListener("click", handleGenerateClick);

  // Keyboard accessibility (Escape key closes)
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePdfColumnModal();
  });

  document.body.classList.add("modal-open-scroll-lock");

  // Animate in
  requestAnimationFrame(() => {
    overlay.classList.add("active");
  });

  // Render reactive button states
  updateUi();
}

/**
 * Updates button active states, numbers, count badge, and disabled states
 */
function updateUi() {
  if (!currentModalState) return;
  const { defs, selectedItems } = currentModalState;
  const totalSelected = selectedItems.length;
  const isLimitReached = totalSelected >= MAX_USER_COLUMNS;

  // 1. Update Count Badge
  const countBadge = document.getElementById("pdf-col-count-badge");
  if (countBadge) {
    countBadge.textContent = `${totalSelected}/${MAX_USER_COLUMNS}`;
    if (isLimitReached) {
      countBadge.classList.add("limit-reached");
    } else {
      countBadge.classList.remove("limit-reached");
    }
  }

  // 2. Map of fieldKey -> 1-based sequence index
  const fieldSequenceMap = new Map();
  selectedItems.forEach((item, index) => {
    if (item.type === "field") {
      fieldSequenceMap.set(item.key, index + 1);
    }
  });

  // 3. Render / Update 2-Column Grid
  const grid = document.getElementById("pdf-col-grid");
  if (grid) {
    grid.innerHTML = "";
    defs.forEach(def => {
      const isSelected = fieldSequenceMap.has(def.key);
      const seqIndex = fieldSequenceMap.get(def.key);
      const isDisabled = !isSelected && isLimitReached;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `pdf-col-item ${isSelected ? "selected" : ""}`;
      btn.disabled = isDisabled;
      btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
      btn.setAttribute("title", isSelected ? `Position ${seqIndex}: Click to deselect` : (isDisabled ? "Maximum 7 columns selected" : "Click to select"));

      btn.innerHTML = `
        <span class="pdf-col-seq-circle ${isSelected ? "active" : ""}">
          ${isSelected ? seqIndex : ""}
        </span>
        <span class="pdf-col-label">${escapeText(def.label)}</span>
      `;

      btn.addEventListener("click", () => {
        handleToggleField(def.key);
      });

      grid.appendChild(btn);
    });
  }

  // 4. Update 'Add Blank Column' Button state
  const addBlankBtn = document.getElementById("pdf-col-btn-add-blank");
  if (addBlankBtn) {
    addBlankBtn.disabled = isLimitReached;
    if (isLimitReached) {
      addBlankBtn.setAttribute("title", "Maximum 7 columns reached");
    } else {
      addBlankBtn.removeAttribute("title");
    }
  }

  // 5. Render Blank Column Chips
  const blankChips = document.getElementById("pdf-col-blank-chips");
  if (blankChips) {
    blankChips.innerHTML = "";
    selectedItems.forEach((item, index) => {
      if (item.type === "blank") {
        const seqIndex = index + 1;
        const chip = document.createElement("div");
        chip.className = "pdf-blank-chip";
        chip.innerHTML = `
          <span class="pdf-col-seq-circle active">${seqIndex}</span>
          <span class="pdf-blank-chip-label">Blank Column</span>
          <button type="button" class="pdf-blank-chip-del" title="Remove blank column #${seqIndex}" aria-label="Remove blank column #${seqIndex}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        `;

        chip.querySelector(".pdf-blank-chip-del").addEventListener("click", (e) => {
          e.stopPropagation();
          handleRemoveBlank(item.id);
        });

        blankChips.appendChild(chip);
      }
    });
  }
}

/**
 * Handle clicking a field in the grid
 */
function handleToggleField(fieldKey) {
  if (!currentModalState) return;
  const { selectedItems } = currentModalState;

  const existingIdx = selectedItems.findIndex(i => i.type === "field" && i.key === fieldKey);

  if (existingIdx !== -1) {
    // Deselect and renumber
    selectedItems.splice(existingIdx, 1);
  } else {
    // Check 7-column limit
    if (selectedItems.length >= MAX_USER_COLUMNS) return;
    // Insert at current end of selection sequence
    selectedItems.push({ type: "field", key: fieldKey });
  }

  updateUi();
}

/**
 * Handle 'Add Blank Column'
 */
function handleAddBlankColumn() {
  if (!currentModalState) return;
  const { selectedItems } = currentModalState;

  if (selectedItems.length >= MAX_USER_COLUMNS) return;

  // Insert exactly at current sequence position
  selectedItems.push({
    type: "blank",
    id: `blank_${Date.now()}_${Math.floor(Math.random() * 1000)}`
  });

  updateUi();
}

/**
 * Handle removing a specific blank column
 */
function handleRemoveBlank(blankId) {
  if (!currentModalState) return;
  const { selectedItems } = currentModalState;

  const idx = selectedItems.findIndex(i => i.type === "blank" && i.id === blankId);
  if (idx !== -1) {
    selectedItems.splice(idx, 1);
    updateUi();
  }
}

/**
 * Handle 'Select All'
 */
function handleSelectAll() {
  if (!currentModalState) return;
  const { defs } = currentModalState;

  // Select all defined fields in their default order up to MAX_USER_COLUMNS
  currentModalState.selectedItems = defs.slice(0, MAX_USER_COLUMNS).map(d => ({
    type: "field",
    key: d.key
  }));

  updateUi();
}

/**
 * Handle 'Clear All'
 */
function handleClearAll() {
  if (!currentModalState) return;
  currentModalState.selectedItems = [];
  updateUi();
}

/**
 * Handle 'Generate PDF' click
 */
async function handleGenerateClick() {
  if (!currentModalState) return;
  const { datasetKey, selectedItems, onGenerate, onToast } = currentModalState;

  if (!selectedItems || selectedItems.length === 0) {
    const msg = "Select at least one column to generate the PDF.";
    if (typeof onToast === "function") {
      onToast(msg, "info");
    } else {
      alert(msg);
    }
    return;
  }

  // Persist chosen configuration to localStorage
  saveColumnConfig(datasetKey, selectedItems);

  // Disable button & show spinner
  const genBtn = document.getElementById("pdf-col-btn-generate");
  const genLabel = document.getElementById("pdf-col-generate-label");
  const origHtml = genBtn ? genBtn.innerHTML : "";

  if (genBtn && genLabel) {
    genBtn.disabled = true;
    genBtn.innerHTML = `
      <span class="sync-spinner" style="width: 13px; height: 13px; border-width: 2px;"></span>
      <span>Generating PDF...</span>
    `;
  }

  try {
    if (typeof onGenerate === "function") {
      await onGenerate(selectedItems);
    }
    closePdfColumnModal();
  } catch (err) {
    console.error("PDF generation error from column modal:", err);
    if (typeof onToast === "function") {
      onToast(err.message || "Failed to generate PDF.", "error");
    }
    if (genBtn) {
      genBtn.disabled = false;
      genBtn.innerHTML = origHtml;
    }
  }
}

function escapeText(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
