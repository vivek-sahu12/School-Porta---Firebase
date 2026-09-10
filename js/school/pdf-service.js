/**
 * Context-Aware Offline PDF Generator for School Data Portal
 * Generates official school documents from the currently viewed student list
 * with zero Firebase requests, dynamic column selection, print-safe B&W styling,
 * flexible remainder blank column width calculation, and 100% offline support.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getOrFetchSchoolLogoDataUrl } from "../image-resolver.js";
import { normalizeClassLabel, formatClassDisplay } from "../school-config.js";
import { DATASET_KEYS } from "./student-service.js";

/**
 * Format current date cleanly (e.g. 10 Sep 2026)
 */
function formatGeneratedDate(d = new Date()) {
  const day = String(d.getDate()).padStart(2, "0");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Generate PDF filename strictly in format: SCHOOLID_DDMMYYYY_HHMMSS.pdf
 * (e.g. SCH1025_10092026_154208.pdf)
 * Uses 24-hour format and no filesystem-unsafe characters.
 */
export function generatePdfFilename(schoolId = "SCH", date = new Date()) {
  const cleanId = String(schoolId || "SCH").trim().replace(/[^a-zA-Z0-9_-]/g, "") || "SCH";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${cleanId}_${dd}${mm}${yyyy}_${hh}${min}${ss}.pdf`;
}

/**
 * Strips HTML tags or search highlight markup from strings safely
 */
function cleanText(val) {
  if (val === null || val === undefined) return "—";
  const str = String(val).trim();
  if (!str) return "—";
  return str.replace(/<[^>]*>/g, "").trim() || "—";
}

/**
 * Converts any image Data URL into a high-quality circular cropped PNG Data URL
 * Preserves aspect ratio with centered cover crop and anti-aliased circular mask.
 */
export async function createCircularLogoDataUrl(sourceDataUrl, targetSize = 128) {
  if (typeof document === "undefined" || !sourceDataUrl || !sourceDataUrl.startsWith("data:image/")) {
    return sourceDataUrl;
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(sourceDataUrl);
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          // Circular clip path
          ctx.beginPath();
          const r = targetSize / 2;
          ctx.arc(r, r, r, 0, Math.PI * 2, true);
          ctx.closePath();
          ctx.clip();

          // Centered cover crop preserving aspect ratio
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          const minDim = Math.min(w, h);
          const sx = (w - minDim) / 2;
          const sy = (h - minDim) / 2;

          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);
          resolve(canvas.toDataURL("image/png"));
        } catch (canvasErr) {
          console.warn("Circular canvas transformation error:", canvasErr);
          resolve(sourceDataUrl);
        }
      };
      img.onerror = () => resolve(sourceDataUrl);
      img.src = sourceDataUrl;
    } catch {
      resolve(sourceDataUrl);
    }
  });
}

/**
 * Column definitions with metadata for width calculation, formatting, and alignment
 * Compact data columns receive only their required width; text columns and blank columns
 * receive proportional/remainder width.
 */
export const COLUMN_METADATA = {
  sNo: {
    label: "S.No",
    baseWidth: 12,
    minWidth: 12,
    halign: "center",
    getValue: (st, idx) => idx + 1
  },
  scholarNo: {
    label: "Scholar No",
    baseWidth: 24,
    minWidth: 22,
    halign: "center",
    getValue: (st) => cleanText(st.scholarNo)
  },
  studentName: {
    label: "Student Name",
    baseWidth: 38,
    minWidth: 36,
    halign: "left",
    isTextCol: true,
    getValue: (st) => cleanText(st.studentName)
  },
  className: {
    label: "Class",
    baseWidth: 18,
    minWidth: 16,
    halign: "center",
    getValue: (st) => cleanText(formatClassDisplay(st.className))
  },
  gender: {
    label: "Gender",
    baseWidth: 16,
    minWidth: 16,
    halign: "center",
    getValue: (st) => cleanText(st.gender)
  },
  category: {
    label: "Category",
    baseWidth: 20,
    minWidth: 18,
    halign: "center",
    getValue: (st) => cleanText(st.category)
  },
  fatherName: {
    label: "Father Name",
    baseWidth: 38,
    minWidth: 36,
    halign: "left",
    isTextCol: true,
    getValue: (st) => cleanText(st.fatherName)
  },
  penNo: {
    label: "Student PEN",
    baseWidth: 32,
    minWidth: 30,
    halign: "left",
    getValue: (st) => cleanText(st.penNo || st.udiseId)
  },
  samagraId: {
    label: "Samagra ID",
    baseWidth: 30,
    minWidth: 28,
    halign: "center",
    getValue: (st) => cleanText(st.samagraId || st.samagraMemberId)
  },
  blank: {
    label: " ",
    baseWidth: 24,
    minWidth: 20,
    halign: "left",
    getValue: () => ""
  }
};

/**
 * Default fallback columns if no custom config provided
 */
function getDefaultColumnsForDataset(datasetKey) {
  if (datasetKey === DATASET_KEYS.UDISE) {
    return [
      { type: "field", key: "className" },
      { type: "field", key: "studentName" },
      { type: "field", key: "gender" },
      { type: "field", key: "penNo" },
      { type: "field", key: "fatherName" },
      { type: "field", key: "category" }
    ];
  }
  if (datasetKey === DATASET_KEYS.THREE_POINT_ZERO) {
    return [
      { type: "field", key: "className" },
      { type: "field", key: "samagraId" },
      { type: "field", key: "studentName" },
      { type: "field", key: "fatherName" },
      { type: "field", key: "category" },
      { type: "field", key: "gender" }
    ];
  }
  return [
    { type: "field", key: "scholarNo" },
    { type: "field", key: "studentName" },
    { type: "field", key: "className" },
    { type: "field", key: "gender" },
    { type: "field", key: "category" },
    { type: "field", key: "fatherName" }
  ];
}

/**
 * Content-aware automatic orientation selection based on selected columns.
 * Usable Portrait width = 210mm - 20mm margins = 190mm.
 * Usable Landscape width = 297mm - 20mm margins = 277mm.
 */
export function determineTableOrientation(datasetKey, userColumns = null) {
  const columns = userColumns && userColumns.length > 0
    ? userColumns
    : getDefaultColumnsForDataset(datasetKey);

  // S.No is 12mm
  let totalMinWidth = COLUMN_METADATA.sNo.minWidth;

  for (const col of columns) {
    if (col.type === "blank") {
      totalMinWidth += COLUMN_METADATA.blank.minWidth;
    } else {
      const meta = COLUMN_METADATA[col.key];
      totalMinWidth += meta ? meta.minWidth : 20;
    }
  }

  // If total minimum required width exceeds usable portrait width (190mm), switch to landscape
  return totalMinWidth > 190 ? "landscape" : "portrait";
}

/**
 * Calculates exact column widths:
 * 1. Data columns receive only their required compact/name width.
 * 2. If Blank Columns exist:
 *    remaining width = usableWidth - totalDataWidth.
 *    Each Blank Column receives remainingWidth / numBlankCols.
 *    Blank columns stay in their exact sequence position!
 * 3. If no Blank Columns exist:
 *    Compact columns stay compact.
 *    Extra remaining width is distributed to name columns (studentName, fatherName)
 *    so text wraps comfortably without artificial stretching of compact columns.
 *
 * @param {Array} effectiveColumns - All columns including S.No
 * @param {number} usableWidth - Total usable table width (e.g. 190mm or 277mm)
 * @param {boolean} isLandscape - Whether page is in landscape orientation
 * @returns {Object} map of colIdx -> { cellWidth, halign }
 */
export function calculateColumnWidths(effectiveColumns, usableWidth, isLandscape = false) {
  const colStyles = {};
  const blankCols = [];
  const dataCols = [];

  // Pass 1: Compute base width for all real data columns
  let totalDataWidth = 0;

  effectiveColumns.forEach((col, idx) => {
    if (col.type === "blank") {
      blankCols.push({ col, idx });
    } else {
      const meta = col.type === "sNo" ? COLUMN_METADATA.sNo : (COLUMN_METADATA[col.key] || { baseWidth: 20, halign: "left" });
      let w = meta.baseWidth;
      // In landscape, give slightly wider base width to name columns
      if (isLandscape && meta.isTextCol) {
        w = 46;
      }
      dataCols.push({ col, idx, width: w, isTextCol: meta.isTextCol || false, halign: meta.halign || "left" });
      totalDataWidth += w;
    }
  });

  const remainingWidth = Math.max(0, usableWidth - totalDataWidth);

  if (blankCols.length > 0) {
    // Blank Column Rule: Blank column(s) receive ALL remaining usable width equally!
    // Sequence position is 100% preserved.
    const blankWidth = Math.max(20, Math.floor((remainingWidth / blankCols.length) * 10) / 10);

    // Apply data column widths
    dataCols.forEach(item => {
      colStyles[item.idx] = {
        cellWidth: item.width,
        halign: item.halign
      };
    });

    // Apply blank column widths (split equally)
    blankCols.forEach(item => {
      colStyles[item.idx] = {
        cellWidth: blankWidth,
        halign: "left"
      };
    });
  } else {
    // No Blank Columns:
    // Compact columns keep their fixed required widths.
    // Name columns (studentName, fatherName) receive extra remaining width.
    const textCols = dataCols.filter(d => d.isTextCol);

    if (textCols.length > 0) {
      const extraPerTextCol = Math.floor((remainingWidth / textCols.length) * 10) / 10;
      dataCols.forEach(item => {
        const finalWidth = item.isTextCol ? (item.width + extraPerTextCol) : item.width;
        colStyles[item.idx] = {
          cellWidth: finalWidth,
          halign: item.halign
        };
      });
    } else {
      // If user selected only compact columns (e.g. S.No, Class, Gender), distribute extra width
      const extraPerCol = Math.floor((remainingWidth / dataCols.length) * 10) / 10;
      dataCols.forEach(item => {
        colStyles[item.idx] = {
          cellWidth: item.width + extraPerCol,
          halign: item.halign
        };
      });
    }
  }

  return colStyles;
}

/**
 * Generates an official, compact, context-aware PDF from the currently viewed student dataset.
 *
 * @param {Object} options
 * @param {Object} options.school - School entity { schoolId, schoolName, name, logoUrl }
 * @param {string} options.datasetKey - "school_data" | "udise" | "three_point_zero"
 * @param {Array} options.students - Array of students currently visible on screen
 * @param {Object} [options.filterContext] - Optional filter context
 * @param {Array} [options.columnConfig] - Optional selected columns config [{ type: "field", key }, { type: "blank" }]
 * @returns {Promise<{ success: boolean, filename?: string, error?: string }>}
 */
export async function generateStudentListPdf({ school, datasetKey, students = [], filterContext = {}, columnConfig = null }) {
  try {
    if (!school) {
      throw new Error("School information is required for PDF generation.");
    }

    const schoolId = school.schoolId || school.id || "SCH";
    const schoolName = (school.schoolName || school.name || "School").trim();
    const logoUrl = school.logoUrl || "";

    // 1. Resolve User Column Configuration (Default or Custom)
    const userColumns = Array.isArray(columnConfig) && columnConfig.length > 0
      ? columnConfig.slice(0, 7) // Enforce max 7 user columns
      : getDefaultColumnsForDataset(datasetKey);

    // Build effective column list: Serial Number is ALWAYS first and automatic!
    const effectiveColumns = [
      { type: "sNo", key: "sNo" },
      ...userColumns
    ];

    // 2. Content-Aware Orientation Decision
    const orientation = determineTableOrientation(datasetKey, userColumns);
    const isLandscape = orientation === "landscape";

    const doc = new jsPDF({
      orientation,
      unit: "mm",
      format: "a4",
      compress: true
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10; // Clean 10mm margins
    const usableWidth = pageWidth - (margin * 2);

    // 3. Fetch & Prepare School Logo (Circular Crop)
    let logoDataUrl = null;
    if (logoUrl) {
      try {
        const rawLogo = await getOrFetchSchoolLogoDataUrl(schoolId, logoUrl);
        if (rawLogo) {
          logoDataUrl = await createCircularLogoDataUrl(rawLogo, 140);
        }
      } catch (err) {
        console.warn("Logo retrieval note:", err);
      }
    }

    // -------------------------------------------------------------
    // 4. Premium PDF Header:
    // [ (O) LOGO ]  SCHOOL NAME                           Generated Date
    //               DISE Code: XXXXXXXX
    // ─────────────────────────────────────────────────────────────
    // -------------------------------------------------------------
    const headerTopY = 10;
    const logoDiameter = 16; // 16mm circular logo
    let textStartX = margin;

    if (logoDataUrl && logoDataUrl.startsWith("data:image/")) {
      try {
        doc.addImage(logoDataUrl, "PNG", margin, headerTopY, logoDiameter, logoDiameter);
        textStartX = margin + logoDiameter + 4.5;
      } catch (imgErr) {
        console.warn("Error embedding circular logo into PDF, falling back:", imgErr);
        textStartX = margin;
      }
    }

    // School Name (Prominent, High-Contrast, Strong Hierarchy)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42); // #0f172a
    
    // Fit long school name gracefully
    const dateEstimatedWidth = 45;
    const maxTitleWidth = pageWidth - textStartX - margin - dateEstimatedWidth;
    let schoolTitle = schoolName;
    if (doc.getTextWidth(schoolTitle) > maxTitleWidth) {
      doc.setFontSize(11.5);
    }
    doc.text(schoolTitle, textStartX, headerTopY + 6.5);

    // DISE Code: [schoolId] (Subtle, Clean Subtitle)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // #64748b
    doc.text(`DISE Code: ${schoolId}`, textStartX, headerTopY + 12.5);

    // Clean Generated Date on the Right
    const generatedDateStr = formatGeneratedDate();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // #64748b
    doc.text(`Generated: ${generatedDateStr}`, pageWidth - margin, headerTopY + 6.5, { align: "right" });

    // Subtle Professional Divider Rule
    const dividerY = headerTopY + 18.5;
    doc.setDrawColor(226, 232, 240); // #e2e8f0
    doc.setLineWidth(0.35);
    doc.line(margin, dividerY, pageWidth - margin, dividerY);

    // Table starts with breathing room below divider
    const tableStartY = dividerY + 3.5;

    // -------------------------------------------------------------
    // 5. Dynamic Table Headers, Rows & Calculated Widths
    // -------------------------------------------------------------
    const headRow = [];

    effectiveColumns.forEach((col) => {
      let meta;
      if (col.type === "blank") {
        meta = COLUMN_METADATA.blank;
      } else if (col.type === "sNo") {
        meta = COLUMN_METADATA.sNo;
      } else {
        meta = COLUMN_METADATA[col.key] || {
          label: col.key,
          halign: "left",
          getValue: (st) => cleanText(st[col.key])
        };
      }

      // Dataset-specific label refinements
      let label = meta.label;
      if (datasetKey === DATASET_KEYS.UDISE) {
        if (col.key === "studentName") label = "Name";
        if (col.key === "category") label = "Social Category";
      }

      headRow.push(label);
    });

    const head = [headRow];

    // Compute precise column styles with remainder logic for Blank columns
    const colStyles = calculateColumnWidths(effectiveColumns, usableWidth, isLandscape);

    // Build body rows
    const body = students.map((st, studentIdx) => {
      return effectiveColumns.map(col => {
        if (col.type === "blank") {
          return "";
        }
        if (col.type === "sNo") {
          return studentIdx + 1;
        }
        const meta = COLUMN_METADATA[col.key];
        return meta ? meta.getValue(st, studentIdx) : cleanText(st[col.key]);
      });
    });

    // 6. AutoTable Rendering (Print-Safe & B&W Optimized Theme)
    autoTable(doc, {
      head,
      body,
      startY: tableStartY,
      margin: { top: 12, bottom: 12, left: margin, right: margin },
      theme: "grid",
      showHead: "everyPage", // Repeat table header on subsequent pages
      rowPageBreak: "avoid", // Never split a single row awkwardly
      headStyles: {
        fillColor: [241, 245, 249], // #f1f5f9 Crisp high-contrast light slate header
        textColor: [15, 23, 42], // #0f172a Deep black/slate text for maximum B&W readability
        fontStyle: "bold",
        fontSize: 8,
        cellPadding: { top: 2.8, bottom: 2.8, left: 2.5, right: 2.5 },
        halign: "left",
        valign: "middle",
        lineWidth: 0.2,
        lineColor: [148, 163, 184] // #94a3b8 Crisp slate border
      },
      styles: {
        font: "helvetica",
        fontSize: 8,
        textColor: [15, 23, 42], // #0f172a Deep black/slate
        cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 },
        lineColor: [203, 213, 225], // #cbd5e1 Clean grid lines
        lineWidth: 0.15,
        overflow: "linebreak",
        valign: "middle"
      },
      alternateRowStyles: {
        fillColor: [252, 252, 253] // Very subtle 1% alternate tint
      },
      columnStyles: colStyles,
      didParseCell: (data) => {
        const colDef = effectiveColumns[data.column.index];
        if (!colDef) return;

        // Centered alignment for compact identifier/category columns
        const isCentered = (
          colDef.type === "sNo" ||
          colDef.key === "scholarNo" ||
          colDef.key === "className" ||
          colDef.key === "gender" ||
          colDef.key === "category" ||
          colDef.key === "samagraId"
        );
        if (isCentered) {
          data.cell.styles.halign = "center";
        }

        // Blank columns share the exact same clean table theme, alternate row styling,
        // and border treatment as the rest of the table without appearing as a stark isolated block,
        // while remaining 99% light and completely pen-writable when printed.
      }
    });

    // -------------------------------------------------------------
    // 7. Clean Minimal Footer & Accurate Total Page Count
    // Iterates across all pages post-table to display "Page X of Y"
    // with the true final total page count. No "Total Students" count.
    // -------------------------------------------------------------
    const totalPages = doc.internal.getNumberOfPages();
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      doc.setPage(pageNum);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // #94a3b8
      const footerText = `Page ${pageNum} of ${totalPages}`;
      doc.text(footerText, pageWidth / 2, pageHeight - 5.5, { align: "center" });
    }

    // -------------------------------------------------------------
    // 8. Exactly Formatted Filename: SCHOOLID_DDMMYYYY_HHMMSS.pdf
    // -------------------------------------------------------------
    const filename = generatePdfFilename(schoolId);

    // Trigger local browser download
    doc.save(filename);

    return { success: true, filename };
  } catch (err) {
    console.error("PDF generation error:", err);
    return { success: false, error: err.message || "Failed to generate PDF." };
  }
}
