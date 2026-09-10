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
