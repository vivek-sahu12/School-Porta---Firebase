/**
 * Reusable Universal Image & Google Drive URL Resolver for School Data Portal
 * Supports:
 * - Google Drive Sharing URLs (e.g. drive.google.com/file/d/ID/view?usp=sharing)
 * - Google Drive Open / UC URLs (e.g. drive.google.com/open?id=ID, drive.google.com/uc?id=ID)
 * - Direct CDN URLs (e.g. lh3.googleusercontent.com/d/ID)
 * - Standard HTTP/HTTPS image URLs (unchanged)
 *
 * Logo Caching: Uses existing IndexedDB via offline-store.js ("_logos" pseudo-collection)
 * Fallback: icon.svg (app logo) when school logo is unavailable
 */

import {
  saveDocToCache,
  getDocFromCache,
  saveLogoToCache,
  getLogoFromCache
} from "./offline-store.js";

// App icon fallback path (relative — works from root or admin/)
const APP_ICON_FALLBACK = "./icon.svg";
const ADMIN_APP_ICON_FALLBACK = "../icon.svg";

/**
 * Convert an image URL to Base64 data URL using canvas or fetch blob
 */
async function convertUrlToBase64DataUrl(imageUrl) {
  // Strategy 1: Try fetch + blob + FileReader (cleanest, works for CORS-enabled image responses)
  try {
    const res = await fetch(imageUrl, { mode: "cors", credentials: "omit" });
    if (res.ok) {
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch (e) {
    // CORS or network failure on fetch, fall through to Image + Canvas
  }

  // Strategy 2: Image object with crossOrigin anonymous + Canvas
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width || 120;
        canvas.height = img.naturalHeight || img.height || 120;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        resolve(dataUrl);
      } catch (err) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/**
 * Background non-blocking revalidation of school logo (daily refresh)
 */
async function refreshLogoInBackground(schoolId, rawUrl, fallbackDataUrl) {
  if (!navigator.onLine || !rawUrl) return;
  try {
    const driveId = extractGoogleDriveFileId(rawUrl);
    const candidateUrls = driveId
      ? [
          `https://drive.google.com/thumbnail?id=${driveId}&sz=w800`,
          `https://lh3.googleusercontent.com/d/${driveId}`,
          `https://drive.google.com/uc?export=view&id=${driveId}`,
          rawUrl
        ]
      : [rawUrl];

    for (const url of candidateUrls) {
      const dataUrl = await convertUrlToBase64DataUrl(url);
      if (dataUrl && dataUrl.startsWith("data:image/")) {
        await saveLogoToCache(schoolId, {
          sourceUrl: rawUrl,
          dataUrl,
          mimeType: dataUrl.split(";")[0].replace("data:", "") || "image/png"
        });
        return;
      }
    }
  } catch (e) {
    // On failure retain previous valid logo
  }
}

/**
 * Fetch and persistently cache school logo as a Base64 data URL for offline PDF and UI
 * @param {string} schoolId
 * @param {string} logoUrl - Google Drive sharing URL or direct image URL
 * @returns {Promise<string|null>} Base64 Data URL or null
 */
export async function getOrFetchSchoolLogoDataUrl(schoolId, logoUrl) {
  if (!schoolId) return null;
  const cleanId = String(schoolId).trim().toUpperCase();
  const rawUrl = (logoUrl || "").trim();

  // 1. Check local persistent cache in IndexedDB
  const cached = await getLogoFromCache(cleanId);
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  if (cached && cached.dataUrl) {
    // If URL matches
    if (cached.sourceUrl === rawUrl) {
      if (now - (cached.savedAt || 0) < ONE_DAY_MS || !navigator.onLine) {
        return cached.dataUrl;
      }
      // Revalidate in background when online and > 24 hours old
      refreshLogoInBackground(cleanId, rawUrl, cached.dataUrl).catch(() => {});
      return cached.dataUrl;
    }
  }

  if (!rawUrl) return null;

  // 2. Fetch fresh logo if online
  if (navigator.onLine) {
    const driveId = extractGoogleDriveFileId(rawUrl);
    const candidateUrls = driveId
      ? [
          `https://drive.google.com/thumbnail?id=${driveId}&sz=w800`,
          `https://lh3.googleusercontent.com/d/${driveId}`,
          `https://drive.google.com/uc?export=view&id=${driveId}`,
          rawUrl
        ]
      : [rawUrl];

    for (const url of candidateUrls) {
      try {
        const dataUrl = await convertUrlToBase64DataUrl(url);
        if (dataUrl && dataUrl.startsWith("data:image/")) {
          await saveLogoToCache(cleanId, {
            sourceUrl: rawUrl,
            dataUrl,
            mimeType: dataUrl.split(";")[0].replace("data:", "") || "image/png"
          });
          return dataUrl;
        }
      } catch (err) {
        // try next candidate
      }
    }
  }

  // 3. Fallback to existing cached logo if available
  if (cached && cached.dataUrl) {
    return cached.dataUrl;
  }

  return null;
}

/**
 * Cache a school logo URL in IndexedDB for offline use
 * Backward-compatible helper
 */
export async function cacheSchoolLogo(schoolId, resolvedUrl) {
  if (!schoolId || !resolvedUrl) return;
  try {
    await saveDocToCache("_logos", schoolId, {
      url: resolvedUrl,
      cachedAt: Date.now()
    });
  } catch (e) {
    // Silent fail
  }
}

/**
 * Get cached school logo URL from IndexedDB
 * Backward-compatible helper
 */
export async function getCachedSchoolLogo(schoolId) {
  if (!schoolId) return null;
  try {
    const cachedLogoObj = await getLogoFromCache(schoolId);
    if (cachedLogoObj && cachedLogoObj.dataUrl) {
      return cachedLogoObj.dataUrl;
    }
    const cached = await getDocFromCache("_logos", schoolId);
    if (cached && cached.url) {
      return cached.url;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Get the correct app icon path based on current page context
 */
function getAppIconPath() {
  // If we're in admin/ subfolder
  if (window.location.pathname.includes("/admin/")) {
    return ADMIN_APP_ICON_FALLBACK;
  }
  return APP_ICON_FALLBACK;
}

/**
 * Extracts Google Drive File ID from any standard Google Drive URL format
 * @param {string} url
 * @returns {string|null} File ID or null if not a Google Drive URL
 */
export function extractGoogleDriveFileId(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (
    trimmed.includes("drive.google.com") ||
    trimmed.includes("docs.google.com") ||
    trimmed.includes("googleusercontent.com")
  ) {
    // 1. /file/d/FILE_ID
    const matchD = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (matchD && matchD[1]) return matchD[1];

    // 2. /d/FILE_ID
    const matchD2 = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (matchD2 && matchD2[1]) return matchD2[1];

    // 3. [?&]id=FILE_ID
    const matchId = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchId && matchId[1]) return matchId[1];
  }

  return null;
}

/**
 * Converts a given URL into a browser-renderable image URL
 * Primary strategy: https://drive.google.com/uc?export=view&id=FILE_ID
 * @param {string} url
 * @returns {string} Browser-renderable image URL
 */
export function resolveImageUrl(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  const driveId = extractGoogleDriveFileId(trimmed);
  if (driveId) {
    // Primary strategy: drive.google.com/uc?export=view&id=FILE_ID
    return `https://drive.google.com/uc?export=view&id=${driveId}`;
  }

  // Non-Drive URLs remain unchanged
  return trimmed;
}

/**
 * Get fallback URLs for Google Drive files if primary URL encounters issues
 * @param {string} driveId
 * @returns {string[]} Ordered list of fallback URLs
 */
export function getDriveImageFallbacks(driveId) {
  if (!driveId) return [];
  return [
    `https://lh3.googleusercontent.com/d/${driveId}`,
    `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`
  ];
}

/**
 * Generates robust, flicker-free School Logo HTML with aspect ratio preservation
 * and multi-stage fallback handling for Google Drive images.
 * Final fallback: app icon (icon.svg) then letter initials.
 *
 * @param {string} logoUrl - Stored logo URL (Drive link or standard image URL)
 * @param {string} schoolName - School name used for initial fallback & alt text
 * @param {string} sizeClass - CSS size class (e.g. 'school-avatar-md', 'school-avatar-lg')
 * @returns {string} HTML string
 */
export function getSchoolLogoHtml(logoUrl, schoolName = "School", sizeClass = "school-avatar-md") {
  const cleanName = schoolName || "School";
  const initial = cleanName.substring(0, 2).toUpperCase() || "SC";
  const rawUrl = logoUrl ? logoUrl.trim() : "";
  const appIcon = getAppIconPath();

  if (!rawUrl) {
    // No logo configured — show app icon as fallback, then initials
    return `
      <div class="school-avatar ${sizeClass}">
        <img src="${appIcon}" alt="${cleanName}" loading="lazy"
             onload="this.classList.add('loaded')"
             onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';">
        <span class="avatar-fallback" style="display:none;">${initial}</span>
      </div>
    `;
  }

  const driveId = extractGoogleDriveFileId(rawUrl);
  const resolvedUrl = resolveImageUrl(rawUrl);

  // Build multi-tier fallback with final icon.svg fallback
  let fallbackAttrs = "";
  if (driveId) {
    fallbackAttrs = `
      data-drive-id="${driveId}"
      data-fallback-stage="0"
      data-school-id="${cleanName.replace(/"/g, '&quot;')}"
      onerror="
        var stage = parseInt(this.getAttribute('data-fallback-stage') || '0', 10);
        var did = this.getAttribute('data-drive-id');
        if (stage === 0) {
          this.setAttribute('data-fallback-stage', '1');
          this.src = 'https://lh3.googleusercontent.com/d/' + did;
        } else if (stage === 1) {
          this.setAttribute('data-fallback-stage', '2');
          this.src = 'https://drive.google.com/thumbnail?id=' + did + '&sz=w1000';
        } else if (stage === 2) {
          this.setAttribute('data-fallback-stage', '3');
          this.src = '${appIcon}';
        } else {
          this.style.display = 'none';
          if (this.nextElementSibling) this.nextElementSibling.style.display = 'flex';
        }
      "
    `;
  } else {
    fallbackAttrs = `
      onerror="
        if (!this.dataset.triedFallback) {
          this.dataset.triedFallback = '1';
          this.src = '${appIcon}';
        } else {
          this.style.display = 'none';
          if (this.nextElementSibling) this.nextElementSibling.style.display = 'flex';
        }
      "
    `;
  }

  return `
    <div class="school-avatar ${sizeClass}">
      <img src="${resolvedUrl}" alt="${cleanName}" loading="lazy" referrerpolicy="no-referrer"
           onload="this.classList.add('loaded')"
           ${fallbackAttrs}>
      <span class="avatar-fallback" style="display:none;">${initial}</span>
    </div>
  `;
}

