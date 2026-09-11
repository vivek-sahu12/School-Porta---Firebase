# School Data Portal - Permanent Project & Agent Invariants

This document establishes permanent architectural rules, deployment standards, and invariants for all future developers and coding agents.

---

## The 12 Permanent Invariants

1. **Installable Mobile Web App (PWA)**:
   - The portal must always satisfy PWA installability requirements across supported Android, mobile, and desktop browsers.
   - PWA installation must function properly on both **GitHub Pages** (repository subpaths like `/School-Porta---Firebase/`) and **Netlify** (root domain `/`).
   - `start_url` and `scope` in `manifest.json` and `admin/manifest.json` must be deployment-aware relative paths (`./index.html` and `./`), never hardcoded absolute root `/` which causes 404s on GitHub Pages.

2. **Approved Portal Icon**:
   - The portal's approved logo (`icon.svg`) is authoritative. Never use placeholder icons, hosting provider icons, or browser initials ("G"-style icon).
   - High-resolution raster PNG icons (`icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`) are required for Android WebAPK generation and must remain in `public/` and `dist/`.

3. **No Installed-App 404s**:
   - Installed PWAs must always open valid entry points (`index.html` for School User, `admin/index.html` for Admin). Never launch into missing routes or 404s.

4. **Mobile Student Profile Class Layout**:
   - The Student Profile header (`.student-profile-hero` and `.student-profile-meta`) must NEVER overflow horizontally on any mobile screen (including 320px, 360px, 375px, 390px, 412px Android viewports).
   - Class badges (`Nursery`, `KG1`, `KG2`, `Class - 1`, `Class 1 • Sec A`, `Class 10`) must remain readable without clipping or container distortion.
   - Use flexible CSS flex-wrap layouts and responsive padding. Never use negative-margin hacks, user-agent sniffing, or fixed-width grid squeezing.

5. **Dashboard Fresh / Default Dataset = School Data**:
   - Fresh Dashboard load, user login, page refresh on Dashboard, or clicking "Dashboard" in sidebar/navigation must ALWAYS default to **School Data** (`DATASET_KEYS.SCHOOL_DATA`).
   - Never default to UDISE. Never default to 3.0.

6. **Dashboard Navigation & Profile Back-Navigation Continuity**:
   - Returning from a Student Profile via the Back button (`#btn-back-to-student-list` or browser back) MUST restore the exact dataset, search query, and filter context from which the profile was opened:
     - School Data -> Profile -> Back = School Data
     - UDISE -> Profile -> Back = UDISE (with exact search/filters preserved)
     - 3.0 -> Profile -> Back = 3.0
   - Do NOT reset datasets on component remount or use timeouts/reloads. State lifecycle must be properly synchronized via `currentPortalState` and `history.replaceState`.

7. **Admin Panel is Strictly Online-First**:
   - Dynamic Admin data (schools, users, sessions, datasets) is authoritative from Firebase Firestore while online.
   - Never allow stale local cache to override live Admin state.

8. **School User Keeps Cache / Sync / Offline Architecture**:
   - The School User experience is built on an offline-first IndexedDB cache + background sync queue architecture.
   - Do NOT convert School User to online-only. Do NOT rewrite the offline store.

9. **Production Deployments (GitHub Pages & Netlify)**:
   - `node_modules` must NEVER be tracked in Git. Committing `node_modules` from Windows with `100644` file permissions breaks Netlify builds with `sh: 1: vite: Permission denied`.
   - Both GitHub Pages and Netlify production builds must remain valid (`npm run build` must succeed cleanly).
   - Do not commit generated `dist/` files as source fixes. Fix source and config files.

10. **Module and Path Safety**:
    - Avoid treating HTML filenames like `dashboard.html` as ES module specifiers. Use standard relative references (`./dashboard.html` or relative window navigation).

11. **School ID / Firebase UID Security & Data Integrity**:
    - School ID is globally unique. Duplicate School ID in Create must always be rejected.
    - Existing schools must never be overwritten by duplicate Create.
    - Creation remains atomic; School isolation remains strict.

12. **Preserve Existing Capabilities**:
    - Future changes must preserve existing PDF generation, Excel import/export with permissions, search, multi-field filtering, natural class sorting, and session security.

13. **Sections are an Optional School-Level Capability**:
    - Controlled by the master switch `sectionsEnabled: ON / OFF` stored on `schools/{schoolId}`.
    - When OFF: Section UI, filters, fields, and dashboard chips are completely hidden; legacy behavior and layout remain 100% intact. Artificial sections (such as "Sec A") must NEVER be created or shown.
    - When ON: Admin configures sections class-by-class; School Data supports section assignments, section filtering, and dashboard section strength chips.

14. **Section Scope & Validation**:
    - Section uniqueness is strictly scoped to `School + Class + Section` (case/whitespace normalized to uppercase).
    - Nursery A and KG1 A can coexist; duplicate sections within the same class are rejected. Empty or whitespace-only section names are prohibited.

15. **Section Does Not Define Student Identity**:
    - Section represents current class placement, not permanent student identity.
    - Changing a student's section must never alter their unique ID, create duplicate student records, or corrupt dataset relationships.

16. **Critical Data Safety on Section Deletion**:
    - Deleting a section that contains assigned students in School Data is strictly blocked in the Admin Panel to prevent orphaning records.
    - Disabling sections via master toggle preserves section configuration and student records in Firestore so they safely restore if re-enabled (no mass-deletions on toggle).

17. **Admin-Configured Sections are Authoritative in Excel Import**:
    - School Data Excel import must validate sections against Admin-configured sections for that class.
    - Unknown or unconfigured sections must NOT be silently created into the school configuration.

18. **Student Records are Source of Truth for Counts (No N+1 Reads)**:
    - Section strength counts are calculated in-memory from loaded student records.
    - Never introduce separate count collections, per-section Firebase reads, or N+1 listeners.

19. **Dashboard Class Card Layout & Alignment**:
    - Every class card must maintain identical outer height and visual alignment on both mobile and desktop regardless of section count (0, 1, 2, 3, 4, 5+ sections).
    - Progress bars are replaced with compact section tiles when Sections are ON for School Data.

20. **Student List Filter & Navigation Continuity**:
    - When Sections are ON, student filter follows strict 2-row layout: Row 1: `Class | Section | Gender`, Row 2: `Category | PDF | Excel`.
    - Profile back navigation restores exact dataset, class, section, and search query context.

21. **School Data Column Management is Admin-Only**:
    - Column management (add, edit/rename, type, reorder, delete) is strictly restricted to Admin Panel → Manage User → School Details → Tab 7 (`7. School Data Columns`).
    - School users have zero column-management controls and only consume the resulting configured schema.

22. **Permanent Core / System Field Protection**:
    - `scholarNo`, `studentName`, `className`, `gender`, and `category` (and `section` when enabled) are permanent core system fields.
    - Core fields must NEVER be deleted or stripped of their essential roles in search, filtering, and student identity.

23. **Stable Column IDs (Labels are Not Database Keys)**:
    - Every School Data column must use a stable internal `columnId` (e.g., `col_xxx`).
    - Renaming a column modifies only the human-readable display label against the same `columnId`.
    - Human-readable labels must NEVER be used as database field identifiers or require mass student data migration upon renaming.

24. **Trimmed, Case-Insensitive Column Duplicate Validation**:
    - Column labels must be unique within each school's School Data configuration.
    - Duplicate validation must be trimmed and case-insensitive (e.g., "Mother Name", " mother name ", "MOTHER NAME" are treated as duplicates).
    - Save must be blocked authoritatively with clear, friendly validation feedback.

25. **Data Safety on Column Deletion & Backward Compatibility**:
    - Deleting a column requires clear confirmation and warns the administrator if student records contain data for that field.
    - Deletion removes the column configuration and purges only that specific field's values from School Data records; never deleting student records, other columns, or core fields.
    - Legacy student records with top-level fields (`fatherName`, `motherName`, `dob`, `mobile`, `address`, `rollNo`) remain backward-compatible without destructive migrations.
