/**
 * Modal History Manager for Mobile Back Button Handling
 * Ensures that pressing mobile Back closes open popups (PDF Column Selection, Excel Confirmation)
 * without navigating the underlying page backward.
 */

let isModalHistoryPushed = false;
let activeModalType = null;
let isPoppingProgrammatically = false;

const closeHandlers = {
  pdf: null,
  excel: null
};

/**
 * Register a modal's close function
 * @param {'pdf' | 'excel'} type
 * @param {Function} closeFn - Receives { fromBack: boolean }
 */
export function registerModalCloseHandler(type, closeFn) {
  closeHandlers[type] = closeFn;
}

/**
 * Check if currently in mobile view (<= 768px)
 */
export function isMobileView() {
  return Boolean(
    (typeof window !== "undefined" && window.innerWidth <= 768) ||
    (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 768px)").matches)
  );
}

/**
 * Push a history state entry when a modal opens on mobile
 * @param {'pdf' | 'excel'} type
 */
export function pushModalHistory(type) {
  if (!isMobileView()) return;

  if (!isModalHistoryPushed) {
    try {
      history.pushState({ modalOpen: true, modalType: type }, "", window.location.href);
      isModalHistoryPushed = true;
      activeModalType = type;
    } catch (e) {
      console.warn("Could not push modal history state:", e);
    }
  } else {
    activeModalType = type;
  }
}

/**
 * Clean up the pushed history entry when a modal is closed via close button / Cancel / action
 * @param {'pdf' | 'excel'} type
 */
export function cleanupModalHistory(type) {
  if (!isMobileView()) return;

  if (isModalHistoryPushed && (!type || activeModalType === type)) {
    isModalHistoryPushed = false;
    activeModalType = null;
    isPoppingProgrammatically = true;
    try {
      history.back();
    } catch (e) {
      isPoppingProgrammatically = false;
    }
  }
}

/**
 * Intercepts popstate event on mobile.
 * If a modal is open, closes the modal and consumes the back event (returns true).
 * If no modal was open, returns false so standard page navigation can proceed.
 *
 * @param {PopStateEvent} [e]
 * @returns {boolean} True if the back event was consumed by a modal
 */
export function handleModalBackEvent(e) {
  // 1. If this popstate was triggered by our own history.back() during programmatic close
  if (isPoppingProgrammatically) {
    isPoppingProgrammatically = false;
    return true; // Consumed programmatic pop, do not navigate page
  }

  // 2. If a modal history state was actively pushed
  if (isModalHistoryPushed) {
    const typeToClose = activeModalType;
    isModalHistoryPushed = false;
    activeModalType = null;

    if (typeToClose && closeHandlers[typeToClose]) {
      closeHandlers[typeToClose]({ fromBack: true });
      return true;
    }
  }

  // 3. Fallback check: check if any modal overlay is in DOM and active
  const pdfOverlay = document.getElementById("pdf-col-modal-overlay");
  if (pdfOverlay && pdfOverlay.classList.contains("active")) {
    isModalHistoryPushed = false;
    activeModalType = null;
    if (closeHandlers.pdf) {
      closeHandlers.pdf({ fromBack: true });
    }
    return true;
  }

  const excelOverlay = document.getElementById("excel-confirm-modal-overlay");
  if (excelOverlay && excelOverlay.classList.contains("excel-confirm-modal-open")) {
    isModalHistoryPushed = false;
    activeModalType = null;
    if (closeHandlers.excel) {
      closeHandlers.excel({ fromBack: true });
    }
    return true;
  }

  return false;
}

/**
 * Helper to get currently active modal type (for testing/diagnostics)
 */
export function getActiveModalType() {
  return activeModalType;
}

/**
 * Reset modal history tracking state (for testing/cleanup)
 */
export function resetModalHistoryState() {
  isModalHistoryPushed = false;
  activeModalType = null;
  isPoppingProgrammatically = false;
}
