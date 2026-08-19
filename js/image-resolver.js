/**
 * Reusable Universal Image & Google Drive URL Resolver for School Data Portal
 * Supports:
 * - Google Drive Sharing URLs (e.g. drive.google.com/file/d/ID/view?usp=sharing)
 * - Google Drive Open / UC URLs (e.g. drive.google.com/open?id=ID, drive.google.com/uc?id=ID)
 * - Direct CDN URLs (e.g. lh3.googleusercontent.com/d/ID)
 * - Standard HTTP/HTTPS image URLs (unchanged)
 */

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

  if (!rawUrl) {
    return `<div class="school-avatar ${sizeClass}"><span class="avatar-fallback">${initial}</span></div>`;
  }

  const driveId = extractGoogleDriveFileId(rawUrl);
  const resolvedUrl = resolveImageUrl(rawUrl);

  // Define multi-tier fallback script for Google Drive URLs
  let fallbackAttrs = "";
  if (driveId) {
    fallbackAttrs = `
      data-drive-id="${driveId}"
      data-fallback-stage="0"
      onerror="
        const stage = parseInt(this.getAttribute('data-fallback-stage') || '0', 10);
        const did = this.getAttribute('data-drive-id');
        if (stage === 0) {
          this.setAttribute('data-fallback-stage', '1');
          this.src = 'https://lh3.googleusercontent.com/d/' + did;
        } else if (stage === 1) {
          this.setAttribute('data-fallback-stage', '2');
          this.src = 'https://drive.google.com/thumbnail?id=' + did + '&sz=w1000';
        } else {
          this.style.display = 'none';
          if (this.nextElementSibling) this.nextElementSibling.style.display = 'flex';
        }
      "
    `;
  } else {
    fallbackAttrs = `
      onerror="
        this.style.display = 'none';
        if (this.nextElementSibling) this.nextElementSibling.style.display = 'flex';
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
