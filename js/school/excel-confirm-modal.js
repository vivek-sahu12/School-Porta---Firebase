/**
 * Excel Export Confirmation Modal (Centered Modal on Desktop & Mobile)
 * Displays active export context, student count, and confirmation before generation.
 * Mobile-first, centered viewport geometry (no bottom sheet), rapid tap safe.
 */

import { formatClassDisplay } from "../school-config.js";
import {
  pushModalHistory,
  cleanupModalHistory,
  registerModalCloseHandler
} from "./modal-history-manager.js";

let activeModalState = null;

// Register close handler with history manager
registerModalCloseHandler("excel", closeExcelConfirmModal);

/**
 * Format active filter context cleanly for confirmation display
 * Examples:
 * - "Nursery • 42 Students"
 * - "Class 5 • Female • 18 Students"
 * - "Search results • 12 Students"
 */
export function formatExportContext(filterContext = {}, count = 0) {
  const parts = [];

  if (filterContext.search && filterContext.search.trim()) {
    parts.push("Search results");
  }

  if (filterContext.className && filterContext.className.trim()) {
    parts.push(formatClassDisplay(filterContext.className));
  }

  if (filterContext.gender && filterContext.gender.trim()) {
    const g = filterContext.gender.trim();
    parts.push(g === "Girl" ? "Female" : g === "Boy" ? "Male" : g);
  }

  if (filterContext.category && filterContext.category.trim()) {
    parts.push(filterContext.category.trim());
  }

  if (parts.length === 0) {
    parts.push("All Students");
  }

  const countStr = `${count} Student${count === 1 ? "" : "s"}`;
  return `${parts.join(" • ")} • ${countStr}`;
}

/**
 * Open Excel Export Confirmation Modal
 *
 * @param {Object} options
 * @param {string} options.datasetKey
 * @param {Array} options.students
 * @param {Object} options.filterContext
 * @param {Function} options.onConfirm - Called when user taps "Export Excel"
 */
export function openExcelConfirmModal({ datasetKey, students = [], filterContext = {}, onConfirm }) {
  // If modal is already open, close it cleanly
  if (activeModalState) {
    closeExcelConfirmModal();
  }

  // Push modal history state on mobile so device back button closes this modal first
  pushModalHistory("excel");

  const count = students.length;
  const contextDescription = formatExportContext(filterContext, count);

  // 1. Create Modal Overlay
  const overlay = document.createElement("div");
  overlay.className = "excel-confirm-modal-overlay";
  overlay.id = "excel-confirm-modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "excel-modal-title");

  overlay.innerHTML = `
    <div class="excel-confirm-modal-card">
      <div class="excel-confirm-modal-header">
        <div class="excel-confirm-icon-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <path d="M8 13h8"></path>
            <path d="M8 17h8"></path>
            <path d="M12 10v10"></path>
          </svg>
        </div>
        <h3 id="excel-modal-title" class="excel-confirm-modal-title">Export to Excel?</h3>
      </div>
      <div class="excel-confirm-modal-body">
        <p class="excel-confirm-context">${contextDescription}</p>
        <p class="excel-confirm-subtext">All available columns will be included.</p>
      </div>
      <div class="excel-confirm-modal-actions">
        <button type="button" class="btn btn-secondary btn-excel-cancel" id="btn-excel-cancel">Cancel</button>
        <button type="button" class="btn btn-primary btn-excel-confirm" id="btn-excel-confirm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-spinner-icon" style="display: none;">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 2a10 10 0 0 1 10 10"></path>
          </svg>
          <span class="btn-text">Export Excel</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Prevent background scrolling
  document.body.classList.add("modal-open");

  // DOM Elements
  const cancelBtn = overlay.querySelector("#btn-excel-cancel");
  const confirmBtn = overlay.querySelector("#btn-excel-confirm");
  const spinnerIcon = confirmBtn.querySelector(".btn-spinner-icon");
  const btnText = confirmBtn.querySelector(".btn-text");

  let isExporting = false;

  const handleClose = () => {
    if (isExporting) return;
    closeExcelConfirmModal();
  };

  const handleConfirm = async () => {
    if (isExporting) return;
    isExporting = true;

    // Visual loading state
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    if (spinnerIcon) spinnerIcon.style.display = "inline-block";
    if (btnText) btnText.textContent = "Exporting...";

    try {
      if (typeof onConfirm === "function") {
        await onConfirm();
      }
    } catch (err) {
      console.error("Error executing Excel export:", err);
    } finally {
      closeExcelConfirmModal();
    }
  };

  cancelBtn.addEventListener("click", handleClose);
  confirmBtn.addEventListener("click", handleConfirm);

  // Click outside modal card to close
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      handleClose();
    }
  });

  // Keyboard Escape to close
  const keyHandler = (e) => {
    if (e.key === "Escape") {
      handleClose();
    }
  };
  window.addEventListener("keydown", keyHandler);

  activeModalState = {
    overlay,
    keyHandler
  };

  // Trigger animation next frame
  requestAnimationFrame(() => {
    overlay.classList.add("excel-confirm-modal-open");
  });
}

/**
 * Close and remove the Excel confirmation modal cleanly
 */
export function closeExcelConfirmModal({ fromBack = false } = {}) {
  if (!activeModalState) return;

  // If closed programmatically or via UI (not via back button), clean up history entry
  if (!fromBack) {
    cleanupModalHistory("excel");
  }

  const { overlay, keyHandler } = activeModalState;
  activeModalState = null;

  window.removeEventListener("keydown", keyHandler);
  document.body.classList.remove("modal-open");

  overlay.classList.remove("excel-confirm-modal-open");
  overlay.addEventListener("transitionend", () => {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }, { once: true });

  // Fallback cleanup if transition does not fire
  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }, 250);
}
