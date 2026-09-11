import { resolve } from "path";
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { defineConfig } from "vite";

function pwaAssetPrecachePlugin() {
  return {
    name: "pwa-sw-asset-injector",
    closeBundle() {
      const distDir = resolve(__dirname, "dist");
      const assetsDir = resolve(distDir, "assets");
      let assetFiles = [];
      try {
        assetFiles = readdirSync(assetsDir).map((f) => `./assets/${f}`);
      } catch (e) {
        console.warn("[PWA Plugin] No dist/assets directory found:", e.message);
      }

      const coreUrls = [
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
        "./icon-maskable-512.png"
      ];

      const allPrecacheUrls = Array.from(new Set([...coreUrls, ...assetFiles]));

      const distSwPath = resolve(distDir, "sw.js");
      try {
        let swContent = readFileSync(distSwPath, "utf-8");
        const precacheRegex = /const PRECACHE_URLS = \[[^\]]*\];/s;
        const newPrecache = `const PRECACHE_URLS = ${JSON.stringify(allPrecacheUrls, null, 2)};`;
        if (precacheRegex.test(swContent)) {
          swContent = swContent.replace(precacheRegex, newPrecache);
          writeFileSync(distSwPath, swContent, "utf-8");
          console.log(`[PWA Plugin] Injected ${allPrecacheUrls.length} precache assets into dist/sw.js`);
        }
      } catch (err) {
        console.warn("[PWA Plugin] Could not update dist/sw.js:", err.message);
      }
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [pwaAssetPrecachePlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        schoolDashboard: resolve(__dirname, "dashboard.html"),
        adminLogin: resolve(__dirname, "admin/index.html"),
        adminDashboard: resolve(__dirname, "admin/dashboard.html"),
      },
    },
    // Copy admin/manifest.json to dist
    copyPublicDir: true,
  },
});

