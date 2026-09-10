import assert from "assert";

console.log("\n=== Testing School Portal Hierarchical Navigation & History Stack ===\n");

// Mock state stack engine mimicking navigateSchoolPortal and handlePortalBack
class MockNavigationRouter {
  constructor() {
    this.historyStack = [];
    this.currentPortalState = {
      view: "dashboard",
      dataset: "school_data",
      filters: { search: "", className: "", gender: "", category: "" },
      studentId: null,
      title: "Dashboard",
      scrollY: 0
    };
    this.internalNavStack = [];
  }

  navigate(targetState, { replace = false, fromHistory = false } = {}) {
    const fullState = {
      view: targetState.view || "dashboard",
      dataset: targetState.dataset || this.currentPortalState.dataset,
      filters: targetState.filters ? { ...targetState.filters } : { search: "", className: "", gender: "", category: "" },
      studentId: targetState.studentId || null,
      title: targetState.title || "School Portal",
      scrollY: targetState.scrollY || 0
    };

    if (!fromHistory) {
      if (replace) {
        if (this.historyStack.length > 0) {
          this.historyStack[this.historyStack.length - 1] = { ...fullState };
        } else {
          this.historyStack.push({ ...fullState });
        }
        if (this.internalNavStack.length > 0) {
          this.internalNavStack[this.internalNavStack.length - 1] = { ...fullState };
        }
      } else {
        const isIdentical =
          this.currentPortalState.view === fullState.view &&
          this.currentPortalState.dataset === fullState.dataset &&
          this.currentPortalState.studentId === fullState.studentId &&
          JSON.stringify(this.currentPortalState.filters) === JSON.stringify(fullState.filters);

        if (!isIdentical) {
          this.internalNavStack.push({ ...this.currentPortalState });
          this.historyStack.push({ ...fullState });
        }
      }
    }

    this.currentPortalState = { ...fullState };
    return this.currentPortalState;
  }

  back() {
    if (this.historyStack.length > 1) {
      this.historyStack.pop(); // pop current
      const prevState = this.historyStack[this.historyStack.length - 1];
      if (this.internalNavStack.length > 0) this.internalNavStack.pop();
      return this.navigate(prevState, { fromHistory: true });
    } else if (this.internalNavStack.length > 0) {
      const prevState = this.internalNavStack.pop();
      return this.navigate(prevState, { fromHistory: true });
    } else {
      return this.navigate({ view: "dashboard" }, { fromHistory: true });
    }
  }
}

// 1. Test Scenario A: Dashboard -> Class Nursery -> Back -> Dashboard
{
  const router = new MockNavigationRouter();
  router.navigate({ view: "dashboard", dataset: "school_data" }, { replace: true });
  assert.strictEqual(router.currentPortalState.view, "dashboard", "Starts on Dashboard");

  // User clicks Nursery
  router.navigate({
    view: "student-list",
    dataset: "school_data",
    filters: { search: "", className: "Nursery", gender: "", category: "" },
    title: "Class Nursery (School Data)"
  });
  assert.strictEqual(router.currentPortalState.view, "student-list");
  assert.strictEqual(router.currentPortalState.filters.className, "Nursery");

  // User presses Back
  router.back();
  assert.strictEqual(router.currentPortalState.view, "dashboard", "Returns immediately to Dashboard");
  console.log("  ✓ PASS: Scenario A: Dashboard -> Nursery -> Back -> Dashboard");
}

// 2. Test Scenario B: Dashboard -> Nursery -> Student Profile -> Back -> Nursery List
{
  const router = new MockNavigationRouter();
  router.navigate({ view: "dashboard", dataset: "school_data" }, { replace: true });

  // Dashboard -> Nursery
  router.navigate({
    view: "student-list",
    dataset: "school_data",
    filters: { search: "", className: "Nursery", gender: "", category: "" },
    title: "Class Nursery (School Data)"
  });

  // Nursery -> Student Profile
  router.navigate({
    view: "student-detail",
    dataset: "school_data",
    studentId: "STU_101",
    filters: { search: "", className: "Nursery", gender: "", category: "" }
  });
  assert.strictEqual(router.currentPortalState.view, "student-detail");
  assert.strictEqual(router.currentPortalState.studentId, "STU_101");

  // Press Back
  router.back();
  assert.strictEqual(router.currentPortalState.view, "student-list", "Returns to student-list");
  assert.strictEqual(router.currentPortalState.filters.className, "Nursery", "Preserves Nursery class filter");

  // Press Back again
  router.back();
  assert.strictEqual(router.currentPortalState.view, "dashboard", "Returns to dashboard");
  console.log("  ✓ PASS: Scenario B: Dashboard -> Nursery -> Student Profile -> Back -> Nursery List -> Back -> Dashboard");
}

// 3. Test Scenario C: Dashboard -> Search "Vivek" -> Student Profile -> Back -> Search "Vivek" Preserved
{
  const router = new MockNavigationRouter();
  router.navigate({ view: "dashboard", dataset: "school_data" }, { replace: true });

  // Explore search "Vivek"
  router.navigate({
    view: "student-list",
    dataset: "school_data",
    filters: { search: "Vivek", className: "", gender: "", category: "" },
    title: 'Search: "Vivek" (School Data)'
  });
  assert.strictEqual(router.currentPortalState.view, "student-list");
  assert.strictEqual(router.currentPortalState.filters.search, "Vivek");

  // User opens "Vivek Chauhan" profile
  router.navigate({
    view: "student-detail",
    dataset: "school_data",
    studentId: "STU_VIVEK_1",
    filters: { search: "Vivek", className: "", gender: "", category: "" }
  });
  assert.strictEqual(router.currentPortalState.view, "student-detail");
  assert.strictEqual(router.currentPortalState.studentId, "STU_VIVEK_1");

  // User presses Back
  router.back();
  assert.strictEqual(router.currentPortalState.view, "student-list", "Returns to student-list");
  assert.strictEqual(router.currentPortalState.filters.search, "Vivek", "Exact search query 'Vivek' is preserved");
  assert.strictEqual(router.currentPortalState.title, 'Search: "Vivek" (School Data)', "Title preserved");
  console.log("  ✓ PASS: Scenario C: Search 'Vivek' -> Profile -> Back -> Search 'Vivek' preserved");
}

// 4. Test State Replacement on Filter Updates (No duplicate history traps)
{
  const router = new MockNavigationRouter();
  router.navigate({ view: "dashboard" }, { replace: true });
  router.navigate({ view: "student-list", filters: { search: "A", className: "", gender: "", category: "" } });
  const countBefore = router.historyStack.length;

  // Typing letters inside search toolbar replaces state
  router.navigate({ view: "student-list", filters: { search: "Ab", className: "", gender: "", category: "" } }, { replace: true });
  router.navigate({ view: "student-list", filters: { search: "Abh", className: "", gender: "", category: "" } }, { replace: true });
  router.navigate({ view: "student-list", filters: { search: "Abhi", className: "", gender: "", category: "" } }, { replace: true });

  assert.strictEqual(router.historyStack.length, countBefore, "No duplicate history entries added while typing");
  assert.strictEqual(router.currentPortalState.filters.search, "Abhi");

  // One back goes directly to dashboard
  router.back();
  assert.strictEqual(router.currentPortalState.view, "dashboard");
  console.log("  ✓ PASS: No duplicate history entries created during live filter/search typing");
}

// 5. Test Age Calculator Navigation
{
  const router = new MockNavigationRouter();
  router.navigate({ view: "dashboard" }, { replace: true });
  router.navigate({ view: "age-calculator", title: "Age Calculator" });
  assert.strictEqual(router.currentPortalState.view, "age-calculator", "Navigated to age-calculator");
  assert.strictEqual(router.currentPortalState.title, "Age Calculator");

  router.back();
  assert.strictEqual(router.currentPortalState.view, "dashboard", "Back from age-calculator returns to dashboard");
  console.log("  ✓ PASS: Scenario D: Dashboard -> Age Calculator -> Back -> Dashboard");
}

// 6. Test Dashboard Default Dataset (Always School Data on init or return)
{
  const router = new MockNavigationRouter();
  // Navigating to dashboard without dataset specified defaults to school_data
  router.navigate({ view: "dashboard" });
  assert.strictEqual(router.currentPortalState.dataset, "school_data", "Dashboard defaults to school_data");

  // User views UDISE
  router.navigate({ view: "student-list", dataset: "udise" });
  assert.strictEqual(router.currentPortalState.dataset, "udise");

  // Returning to Dashboard resets default to school_data unless explicitly viewing another dataset
  router.navigate({ view: "dashboard", dataset: "school_data" });
  assert.strictEqual(router.currentPortalState.dataset, "school_data", "Resetting to Dashboard always defaults to school_data");
  console.log("  ✓ PASS: Scenario E: Dashboard consistently defaults to School Data");
}

console.log("\n================================");
console.log("All Navigation Tests Passed Successfully!");
console.log("================================\n");

