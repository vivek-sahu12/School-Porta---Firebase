// Progressive Web App Service Worker for School Data Portal & Admin Panel
// Provides offline-first application shell caching, persistent asset storage, and PWA reliability

const CACHE_NAME = "school-data-portal-v7";

// Core application shell resources precached on installation (relative paths for GitHub Pages & root domains)
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./admin/index.html",
  "./admin/dashboard.html",
  "./manifest.json",
  "./admin/manifest.json",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./css/style.css",
  "./css/dashboard.css",
  "./css/school.css",
  "./css/admin-login.css",
  "./js/firebase.js",
  "./js/offline-store.js",
  "./js/session-manager.js",
  "./js/school-config.js",
  "./js/user/login.js",
  "./js/school/dashboard.js",
  "./js/school/school-ui.js",
  "./js/school/student-service.js",
  "./js/school/age-calculator.js",
  "./js/school/excel-service.js",
  "./js/school/pdf-service.js",
  "./js/admin/login.js",
  "./js/admin/dashboard.js",
  "./js/admin/superadmin-ui.js",
  "./js/admin/firestore-service.js",
  "./js/admin/excel-parser.js"
];

// Install Event: Precache core application shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_URLS.map((url) => {
          const resolvedUrl = new URL(url, self.location.href).href;
          return cache.add(resolvedUrl).catch((err) => {
            console.warn(`[SW] Precache item note for ${url}:`, err.message);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up stale/older caches and claim clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log(`[SW] Purging outdated cache: ${name}`);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Offline-first caching strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Strictly bypass Firebase backend APIs, Firestore realtime websockets/REST, CDN libraries, Google APIs, and extensions
  if (
    event.request.method !== "GET" ||
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com") ||
    url.hostname.includes("securetoken.googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("firebaseapp.com") ||
    url.hostname.includes("firebasestorage.app") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("google.com") ||
    url.hostname.includes("jsdelivr.net") ||
    url.hostname.includes("unpkg.com") ||
    url.protocol.startsWith("chrome-extension")
  ) {
    return;
  }

  // 2. Navigation requests (HTML Pages: index.html, dashboard.html, etc.)
  // Network-first with automatic cache fallback and dynamic cache updating
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);

          // A. Try exact match first
          const exactMatch = await cache.match(event.request, { ignoreSearch: true });
          if (exactMatch) return exactMatch;

          const reqUrl = new URL(event.request.url);
          const pathname = reqUrl.pathname;

          // B. Target-specific matches resolved against Service Worker location
          if (pathname.includes("admin/dashboard") || pathname.endsWith("/admin/dashboard")) {
            const adminDash = await cache.match(new URL("./admin/dashboard.html", self.location.href).href);
            if (adminDash) return adminDash;
          }
          if (pathname.includes("dashboard") || pathname.endsWith("/dashboard")) {
            const dash = await cache.match(new URL("./dashboard.html", self.location.href).href);
            if (dash) return dash;
          }
          if (pathname.includes("admin")) {
            const adminLogin = await cache.match(new URL("./admin/index.html", self.location.href).href);
            if (adminLogin) return adminLogin;
          }

          // C. General index / root fallback
          const indexMatch = (await cache.match(new URL("./index.html", self.location.href).href)) ||
                             (await cache.match(new URL("./", self.location.href).href));
          if (indexMatch) return indexMatch;

          // D. Fallback search across all cached keys
          const keys = await cache.keys();
          const targetIsAdmin = pathname.includes("admin");
          const fallbackKey = keys.find((k) => {
            const u = k.url;
            return targetIsAdmin ? u.includes("admin/index.html") : (u.includes("dashboard.html") || u.includes("index.html"));
          });
          if (fallbackKey) {
            return await cache.match(fallbackKey);
          }

          return new Response("<!DOCTYPE html><html><head><meta charset='utf-8'><title>Offline</title></head><body><p>App is offline. Please reconnect.</p></body></html>", {
            status: 200,
            headers: { "Content-Type": "text/html" }
          });
        })
    );
    return;
  }

  // 3. Static Assets (JS bundles, CSS, images, WebP, fonts, JSON)
  // Cache-First with network fallback & background cache update
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // A. Check cache first
      let cachedResponse = await cache.match(event.request);
      if (!cachedResponse) {
        cachedResponse = await cache.match(event.request, { ignoreSearch: true });
      }

      if (cachedResponse) {
        // When online, revalidate in background to keep cache up to date
        if (navigator.onLine) {
          fetch(event.request)
            .then((freshResponse) => {
              if (freshResponse && (freshResponse.status === 200 || freshResponse.type === "opaque")) {
                cache.put(event.request, freshResponse);
              }
            })
            .catch(() => {});
        }
        return cachedResponse;
      }

      // B. If not in cache, fetch from network and store in cache
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === "opaque")) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (networkErr) {
        // C. Network failed (offline / connection error): attempt fuzzy matching by file basename
        const reqUrl = new URL(event.request.url);
        const fileName = reqUrl.pathname.split("/").pop();

        if (fileName) {
          const keys = await cache.keys();
          const targetIsAdmin = reqUrl.pathname.includes("admin");
          const matchedKey = keys.find((k) => {
            const keyUrl = new URL(k.url);
            const keyIsAdmin = keyUrl.pathname.includes("admin");
            if (targetIsAdmin !== keyIsAdmin) return false;
            return keyUrl.pathname.endsWith("/" + fileName) || keyUrl.pathname === fileName;
          });
          if (matchedKey) {
            const fuzzyMatch = await cache.match(matchedKey);
            if (fuzzyMatch) return fuzzyMatch;
          }
        }

        // D. Fallback for image requests when offline
        if (event.request.destination === "image" || reqUrl.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico)$/i)) {
          const fallbackIcon = await cache.match(new URL("./icon.svg", self.location.href).href);
          if (fallbackIcon) return fallbackIcon;
        }

        // E. Return safe response rather than throwing unhandled fetch rejection
        return new Response("", { status: 408, statusText: "Offline" });
      }
    })()
  );
});
