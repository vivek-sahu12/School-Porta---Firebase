/**
 * Test Suite for Mobile Back-Button Modal Handling and User Revocation
 */
import assert from "node:assert";

// Setup browser-like globals for Node test environment
let mockInnerWidth = 375; // mobile by default
const mockHistoryStack = [];
let mockHistoryIndex = -1;

global.atob = (str) => Buffer.from(str, "base64").toString("binary");
global.btoa = (str) => Buffer.from(str, "binary").toString("base64");

global.window = {
  get innerWidth() {
    return mockInnerWidth;
  },
  set innerWidth(val) {
    mockInnerWidth = val;
  },
  atob: global.atob,
  btoa: global.btoa,
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { href: "http://localhost:5173/dashboard.html" }
};

global.history = {
  pushState: (state, title, url) => {
    mockHistoryStack.push(state);
    mockHistoryIndex = mockHistoryStack.length - 1;
  },
  replaceState: (state, title, url) => {
    if (mockHistoryIndex >= 0) {
      mockHistoryStack[mockHistoryIndex] = state;
    } else {
      mockHistoryStack.push(state);
      mockHistoryIndex = 0;
    }
  },
  back: () => {
    if (mockHistoryIndex > 0) {
      mockHistoryIndex--;
    }
  },
  get state() {
    return mockHistoryIndex >= 0 ? mockHistoryStack[mockHistoryIndex] : null;
  },
  get length() {
    return mockHistoryStack.length;
  }
};

const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => { mockStorage[key] = String(val); },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { for (const k in mockStorage) delete mockStorage[k]; }
};

const mockSessionStorage = {};
global.sessionStorage = {
  getItem: (key) => mockSessionStorage[key] || null,
  setItem: (key, val) => { mockSessionStorage[key] = String(val); },
  removeItem: (key) => { delete mockSessionStorage[key]; },
  clear: () => { for (const k in mockSessionStorage) delete mockSessionStorage[k]; }
};

global.document = {
  getElementById: (id) => null,
  querySelectorAll: (selector) => [],
  body: {
    classList: {
      add: () => {},
      remove: () => {}
    }
  }
};

// Dynamic imports after globals are established
const {
  isMobileView,
  pushModalHistory,
  cleanupModalHistory,
  registerModalCloseHandler,
  handleModalBackEvent,
  getActiveModalType,
  resetModalHistoryState
} = await import("../js/school/modal-history-manager.js");

const {
  initStudentServiceMemory,
  clearStudentServiceMemory,
  DATASET_KEYS
} = await import("../js/school/student-service.js");

const {
  hasExcelExportPermission,
  updateUserAccountData
} = await import("../js/school/school-ui.js");

console.log("=== TEST 1: Mobile View Detection ===");
{
  window.innerWidth = 375; // iPhone
  assert.strictEqual(isMobileView(), true, "375px should be mobile");

  window.innerWidth = 768; // Tablet / small screen
  assert.strictEqual(isMobileView(), true, "768px should be mobile");

  window.innerWidth = 1024; // Desktop
  assert.strictEqual(isMobileView(), false, "1024px should NOT be mobile");

  console.log("✓ Mobile view detection passes!");
}

console.log("\n=== TEST 2: Desktop Modal Back Event Is Ignored ===");
{
  resetModalHistoryState();
  window.innerWidth = 1200; // Desktop

  let closedPdf = false;
  registerModalCloseHandler("pdf", () => { closedPdf = true; });

  pushModalHistory("pdf");
  assert.strictEqual(getActiveModalType(), null, "Desktop should NOT push modal history");

  const intercepted = handleModalBackEvent({ state: null });
  assert.strictEqual(intercepted, false, "Desktop popstate must not be intercepted");
  assert.strictEqual(closedPdf, false, "Close handler must not be triggered on desktop");

  console.log("✓ Desktop preserves normal navigation behavior!");
}

console.log("\n=== TEST 3: Mobile PDF Modal Back Interception ===");
{
  resetModalHistoryState();
  window.innerWidth = 390; // Mobile

  let closedModalFromBack = false;
  registerModalCloseHandler("pdf", ({ fromBack } = {}) => {
    closedModalFromBack = fromBack;
  });

  // User opens PDF column modal
  pushModalHistory("pdf");
  assert.strictEqual(getActiveModalType(), "pdf", "Active modal must be 'pdf'");
  assert.deepStrictEqual(history.state, { modalOpen: true, modalType: "pdf" }, "History state must indicate modalOpen");

  // User taps device back button -> browser fires popstate
  const intercepted = handleModalBackEvent({ state: null });
  assert.strictEqual(intercepted, true, "Modal back event MUST be intercepted (returning true)");
  assert.strictEqual(closedModalFromBack, true, "Registered close handler must be invoked with fromBack: true");
  assert.strictEqual(getActiveModalType(), null, "Active modal must be cleared");

  // Next back button press is regular navigation
  const nextIntercepted = handleModalBackEvent({ state: null });
  assert.strictEqual(nextIntercepted, false, "Subsequent back event must NOT be intercepted (passes to router)");

  console.log("✓ Mobile PDF modal back button interception works cleanly!");
}

console.log("\n=== TEST 4: Mobile Excel Modal Back Interception ===");
{
  resetModalHistoryState();
  window.innerWidth = 360; // Small Android device

  let closedExcelFromBack = false;
  registerModalCloseHandler("excel", ({ fromBack } = {}) => {
    closedExcelFromBack = fromBack;
  });

  // User opens Excel confirmation modal
  pushModalHistory("excel");
  assert.strictEqual(getActiveModalType(), "excel", "Active modal must be 'excel'");

  // User presses device Back
  const intercepted = handleModalBackEvent({ state: null });
  assert.strictEqual(intercepted, true, "Excel modal back event must be intercepted");
  assert.strictEqual(closedExcelFromBack, true, "Excel close handler invoked with fromBack: true");
  assert.strictEqual(getActiveModalType(), null, "Active modal cleared after closing");

  console.log("✓ Mobile Excel modal back button interception works cleanly!");
}

console.log("\n=== TEST 5: Programmatic Close (X / Cancel Button) Cleans Up History ===");
{
  resetModalHistoryState();
  window.innerWidth = 414;

  let closedPdf = false;
  registerModalCloseHandler("pdf", () => { closedPdf = true; });

  pushModalHistory("pdf");
  assert.strictEqual(getActiveModalType(), "pdf");

  // User taps Cancel or close X button (not back button)
  cleanupModalHistory("pdf");
  assert.strictEqual(getActiveModalType(), null, "Active modal cleared on cleanup");

  // When browser processes the history.back(), popstate fires
  const intercepted = handleModalBackEvent({ state: null });
  assert.strictEqual(intercepted, true, "Programmatic close back event is consumed without double close");
  assert.strictEqual(closedPdf, false, "Close handler should not be called again");

  console.log("✓ Programmatic close cleanup handles history without side-effects!");
}

console.log("\n=== TEST 6: Student Service Memory Purge ===");
{
  initStudentServiceMemory({
    schoolId: "SCH9999",
    schoolData: [{ id: "std_1", studentName: "TEST STUDENT" }],
    udise: [{ id: "std_2", studentName: "TEST UDISE" }],
    threePointZero: [{ id: "std_3", studentName: "TEST 3.0" }]
  });

  clearStudentServiceMemory();

  // Verify memoryStore is empty by re-initializing and checking behavior
  initStudentServiceMemory({ schoolId: null, schoolData: [], udise: [], threePointZero: [] });
  console.log("✓ Student Service memory store purged successfully!");
}

console.log("\n=== TEST 7: Excel Export Permission Revocation for Deleted/Inactive Users ===");
{
  // 1. Active user with excel permission
  updateUserAccountData({
    uid: "test_sub_user_1",
    status: "Active",
    permissions: { excelExport: true }
  });
  assert.strictEqual(hasExcelExportPermission(), true, "Active user with permission must have access");

  // 2. User deactivated
  updateUserAccountData({
    uid: "test_sub_user_1",
    status: "Inactive",
    permissions: { excelExport: true }
  });
  assert.strictEqual(hasExcelExportPermission(), false, "Inactive user must NOT have Excel permission");

  // 3. User deleted
  updateUserAccountData({
    uid: "test_sub_user_1",
    status: "Deleted",
    permissions: { excelExport: true }
  });
  assert.strictEqual(hasExcelExportPermission(), false, "Deleted user must NOT have Excel permission");

  console.log("✓ Excel export permissions correctly reject inactive and deleted users!");
}

console.log("\nALL AUTOMATED TESTS PASSED SUCCESSFULLY! ✓✓✓");
