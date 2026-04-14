/**
 * PDF Report Generator — Export PDF stylisé des rapports enrichis.
 *
 * Génère un PDF professionnel à partir du contenu Markdown des rapports,
 * avec en-tête Compleo, pied de page, table des matières, et mise en forme.
 *
 * Utilise jsPDF côté client pour une génération directe sans serveur.
 * Aucune mention IA/agent dans le document final.
 *
 * @author Hamza NORDINE
 */

import jsPDF from "jspdf";
import "jspdf-autotable";
import { marked } from "marked";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReportSection {
  id: string;
  title: string;
  content: string;
}

interface PDFGeneratorOptions {
  projectName?: string;
  generatedAt?: string;
  author?: string;
  reports: Record<string, string | null>;
  singleReport?: string; // If set, export only this report
}

interface TocEntry {
  title: string;
  page: number;
  level: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const COLORS = {
  primary: [0, 180, 140] as [number, number, number],       // Compleo teal
  primaryDark: [0, 140, 110] as [number, number, number],
  dark: [20, 24, 33] as [number, number, number],
  darkPanel: [28, 32, 42] as [number, number, number],
  text: [50, 55, 65] as [number, number, number],
  textLight: [120, 130, 145] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  border: [220, 225, 235] as [number, number, number],
  headerBg: [245, 247, 250] as [number, number, number],
  accent: [59, 130, 246] as [number, number, number],       // Blue accent
  warning: [234, 179, 8] as [number, number, number],
  success: [34, 197, 94] as [number, number, number],
};

const REPORT_TITLES: Record<string, string> = {
  EXECUTIVE_SUMMARY: "Synthèse Exécutive",
  MIGRATION_REPORT: "Rapport de Migration",
  MICROSERVICES_REPORT: "Architecture Microservices",
  DATASOURCE_MIGRATION: "Migration des Sources de Données",
  QUALITY_SCORE: "Score de Qualité",
};

const PAGE_MARGIN = 25;
const CONTENT_WIDTH = 160; // A4 width (210) - 2 * margin (25)
const LINE_HEIGHT = 6;
const FONT_SIZE = {
  title: 24,
  h1: 16,
  h2: 13,
  h3: 11,
  body: 9.5,
  small: 8,
  footer: 7.5,
};

// ─── Markdown to text blocks parser ─────────────────────────────────────────

interface TextBlock {
  type: "h1" | "h2" | "h3" | "paragraph" | "bullet" | "code" | "separator" | "table";
  text: string;
  items?: string[];
  rows?: string[][];
  headers?: string[];
}

function parseMarkdownToBlocks(markdown: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  const lines = markdown.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      blocks.push({ type: "separator", text: "" });
      i++;
      continue;
    }

    // Headers
    if (line.startsWith("# ")) {
      blocks.push({ type: "h1", text: cleanText(line.slice(2)) });
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: cleanText(line.slice(3)) });
      i++;
      continue;
    }
    if (line.startsWith("### ") || line.startsWith("#### ")) {
      const level = line.startsWith("#### ") ? 4 : 3;
      blocks.push({ type: "h3", text: cleanText(line.slice(level + 1)) });
      i++;
      continue;
    }

    // Table
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1]?.includes("---")) {
      const headers = line.split("|").map(c => c.trim()).filter(Boolean);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        const row = lines[i].split("|").map(c => c.trim()).filter(Boolean);
        rows.push(row);
        i++;
      }
      blocks.push({ type: "table", text: "", headers, rows });
      continue;
    }

    // Bullet list
    if (/^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && (/^\s*[-*+]\s/.test(lines[i]) || /^\s*\d+\.\s/.test(lines[i]))) {
        items.push(cleanText(lines[i].replace(/^\s*[-*+]\s/, "").replace(/^\s*\d+\.\s/, "")));
        i++;
      }
      blocks.push({ type: "bullet", text: "", items });
      continue;
    }

    // Code block
    if (line.trim().startsWith("```")) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }

    // Regular paragraph — collect consecutive non-empty lines
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("#") && !lines[i].startsWith("```") && !/^\s*[-*+]\s/.test(lines[i]) && !/^\s*\d+\.\s/.test(lines[i]) && !/^---+$/.test(lines[i].trim())) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", text: cleanText(paraLines.join(" ")) });
    }
  }

  return blocks;
}

function cleanText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")  // bold
    .replace(/\*(.+?)\*/g, "$1")       // italic
    .replace(/`(.+?)`/g, "$1")         // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // links
    .replace(/~~(.+?)~~/g, "$1")       // strikethrough
    .trim();
}

// ─── PDF Generator ──────────────────────────────────────────────────────────

export async function generateReportPDF(options: PDFGeneratorOptions): Promise<void> {
  const { projectName = "Projet", generatedAt, author = "Hamza NORDINE", reports, singleReport } = options;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const tocEntries: TocEntry[] = [];
  let currentPage = 1;

  // ─── Helper functions ─────────────────────────────────────────────────

  function addHeader() {
    // Top bar
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageWidth, 3, "F");

    // Logo text "COMPLEO"
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.primary);
    doc.text("COMPLEO", PAGE_MARGIN, 12);

    // Separator dot
    doc.setTextColor(...COLORS.textLight);
    doc.setFontSize(8);
    doc.text("•", PAGE_MARGIN + 24, 12);

    // Project name
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textLight);
    doc.text("Java Legacy Modernizer", PAGE_MARGIN + 28, 12);

    // Right side: date
    if (generatedAt) {
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.textLight);
      doc.text(generatedAt, pageWidth - PAGE_MARGIN, 12, { align: "right" });
    }

    // Header line
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(PAGE_MARGIN, 16, pageWidth - PAGE_MARGIN, 16);
  }

  function addFooter() {
    const y = pageHeight - 10;

    // Footer line
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.line(PAGE_MARGIN, y - 4, pageWidth - PAGE_MARGIN, y - 4);

    // Left: confidential
    doc.setFont("helvetica", "italic");
    doc.setFontSize(FONT_SIZE.footer);
    doc.setTextColor(...COLORS.textLight);
    doc.text("Document confidentiel — Compleo", PAGE_MARGIN, y);

    // Right: page number
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${currentPage}`, pageWidth - PAGE_MARGIN, y, { align: "right" });
  }

  function newPage() {
    doc.addPage();
    currentPage++;
    addHeader();
    addFooter();
    return 22; // Y position after header
  }

  function checkPageBreak(y: number, needed: number): number {
    if (y + needed > pageHeight - 20) {
      return newPage();
    }
    return y;
  }

  // ─── Cover page ───────────────────────────────────────────────────────

  // Background gradient effect
  doc.setFillColor(...COLORS.dark);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // Top accent bar
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, 5, "F");

  // Logo area
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.primary);
  doc.text("COMPLEO", PAGE_MARGIN, 35);

  // Decorative line
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.8);
  doc.line(PAGE_MARGIN, 42, PAGE_MARGIN + 40, 42);

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...COLORS.white);

  if (singleReport && REPORT_TITLES[singleReport]) {
    doc.text(REPORT_TITLES[singleReport], PAGE_MARGIN, 75);
  } else {
    doc.text("Rapports d'Analyse", PAGE_MARGIN, 75);
    doc.setFontSize(18);
    doc.text("& Migration", PAGE_MARGIN, 88);
  }

  // Project name
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(180, 190, 205);
  doc.text(projectName, PAGE_MARGIN, 110);

  // Metadata box
  const boxY = 140;
  doc.setFillColor(35, 40, 52);
  doc.roundedRect(PAGE_MARGIN, boxY, CONTENT_WIDTH, 40, 3, 3, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(150, 160, 175);

  const metaItems = [
    ["Auteur", author],
    ["Date", generatedAt || new Date().toLocaleDateString("fr-FR")],
    ["Plateforme", "Java Legacy Modernizer v4.0"],
    ["Classification", "Confidentiel"],
  ];

  metaItems.forEach(([label, value], idx) => {
    const metaY = boxY + 10 + idx * 8;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text(`${label} :`, PAGE_MARGIN + 8, metaY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 210, 220);
    doc.text(value, PAGE_MARGIN + 45, metaY);
  });

  // Bottom accent
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, pageHeight - 5, pageWidth, 5, "F");

  // ─── Table of Contents (only for multi-report) ────────────────────────

  const sectionsToExport: ReportSection[] = [];

  if (singleReport) {
    if (reports[singleReport]) {
      sectionsToExport.push({
        id: singleReport,
        title: REPORT_TITLES[singleReport] || singleReport,
        content: reports[singleReport]!,
      });
    }
  } else {
    const order = ["EXECUTIVE_SUMMARY", "MIGRATION_REPORT", "MICROSERVICES_REPORT", "DATASOURCE_MIGRATION", "QUALITY_SCORE"];
    for (const key of order) {
      if (reports[key]) {
        sectionsToExport.push({
          id: key,
          title: REPORT_TITLES[key] || key,
          content: reports[key]!,
        });
      }
    }
  }

  if (!singleReport && sectionsToExport.length > 1) {
    let y = newPage();

    // TOC title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...COLORS.text);
    doc.text("Table des Matières", PAGE_MARGIN, y + 5);

    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(0.6);
    doc.line(PAGE_MARGIN, y + 9, PAGE_MARGIN + 50, y + 9);

    y += 20;

    sectionsToExport.forEach((section, idx) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(...COLORS.text);

      // Section number
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.primary);
      doc.text(`${idx + 1}.`, PAGE_MARGIN, y);

      // Section title
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.text);
      doc.text(section.title, PAGE_MARGIN + 10, y);

      // Dotted line
      doc.setDrawColor(...COLORS.border);
      doc.setLineDashPattern([1, 1], 0);
      doc.line(PAGE_MARGIN + 80, y, pageWidth - PAGE_MARGIN - 10, y);
      doc.setLineDashPattern([], 0);

      y += 10;
    });
  }

  // ─── Render each report section ───────────────────────────────────────

  for (let sIdx = 0; sIdx < sectionsToExport.length; sIdx++) {
    const section = sectionsToExport[sIdx];
    let y = newPage();

    // Section title page header
    doc.setFillColor(...COLORS.headerBg);
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 14, "F");
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(0.5);
    doc.line(PAGE_MARGIN, y, PAGE_MARGIN, y + 14);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT_SIZE.h1);
    doc.setTextColor(...COLORS.text);
    doc.text(`${sIdx + 1}. ${section.title}`, PAGE_MARGIN + 5, y + 9);

    y += 20;

    // Parse markdown blocks
    const blocks = parseMarkdownToBlocks(section.content);

    for (const block of blocks) {
      switch (block.type) {
        case "h1": {
          y = checkPageBreak(y, 15);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(FONT_SIZE.h1);
          doc.setTextColor(...COLORS.text);
          doc.text(block.text, PAGE_MARGIN, y);
          doc.setDrawColor(...COLORS.primary);
          doc.setLineWidth(0.4);
          doc.line(PAGE_MARGIN, y + 2, PAGE_MARGIN + 30, y + 2);
          y += 10;
          break;
        }

        case "h2": {
          y = checkPageBreak(y, 12);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(FONT_SIZE.h2);
          doc.setTextColor(...COLORS.primaryDark);
          doc.text(block.text, PAGE_MARGIN, y);
          y += 8;
          break;
        }

        case "h3": {
          y = checkPageBreak(y, 10);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(FONT_SIZE.h3);
          doc.setTextColor(...COLORS.text);
          doc.text(block.text, PAGE_MARGIN, y);
          y += 7;
          break;
        }

        case "paragraph": {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(FONT_SIZE.body);
          doc.setTextColor(...COLORS.text);

          const lines = doc.splitTextToSize(block.text, CONTENT_WIDTH);
          for (const line of lines) {
            y = checkPageBreak(y, LINE_HEIGHT);
            doc.text(line, PAGE_MARGIN, y);
            y += LINE_HEIGHT;
          }
          y += 2;
          break;
        }

        case "bullet": {
          if (!block.items) break;
          for (const item of block.items) {
            y = checkPageBreak(y, LINE_HEIGHT + 2);

            // Bullet dot
            doc.setFillColor(...COLORS.primary);
            doc.circle(PAGE_MARGIN + 2, y - 1.5, 1, "F");

            doc.setFont("helvetica", "normal");
            doc.setFontSize(FONT_SIZE.body);
            doc.setTextColor(...COLORS.text);

            const bulletLines = doc.splitTextToSize(item, CONTENT_WIDTH - 10);
            for (let bIdx = 0; bIdx < bulletLines.length; bIdx++) {
              if (bIdx > 0) y = checkPageBreak(y, LINE_HEIGHT);
              doc.text(bulletLines[bIdx], PAGE_MARGIN + 6, y);
              y += LINE_HEIGHT;
            }
          }
          y += 2;
          break;
        }

        case "code": {
          const codeLines = block.text.split("\n");
          const codeHeight = codeLines.length * 4.5 + 8;
          y = checkPageBreak(y, Math.min(codeHeight, 60));

          // Code background
          const actualHeight = Math.min(codeLines.length * 4.5 + 8, pageHeight - y - 20);
          doc.setFillColor(245, 245, 248);
          doc.roundedRect(PAGE_MARGIN, y - 2, CONTENT_WIDTH, actualHeight, 2, 2, "F");
          doc.setDrawColor(...COLORS.border);
          doc.setLineWidth(0.2);
          doc.roundedRect(PAGE_MARGIN, y - 2, CONTENT_WIDTH, actualHeight, 2, 2, "S");

          doc.setFont("courier", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(80, 85, 100);

          let codeY = y + 3;
          for (const codeLine of codeLines) {
            if (codeY > y - 2 + actualHeight - 3) break;
            const truncated = codeLine.length > 90 ? codeLine.slice(0, 87) + "..." : codeLine;
            doc.text(truncated, PAGE_MARGIN + 4, codeY);
            codeY += 4.5;
          }

          y += actualHeight + 4;
          break;
        }

        case "table": {
          if (!block.headers || !block.rows) break;
          y = checkPageBreak(y, 20);

          try {
            (doc as any).autoTable({
              startY: y,
              head: [block.headers],
              body: block.rows,
              margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
              styles: {
                fontSize: 8,
                cellPadding: 3,
                textColor: COLORS.text,
                lineColor: COLORS.border,
                lineWidth: 0.2,
                font: "helvetica",
              },
              headStyles: {
                fillColor: COLORS.primary,
                textColor: COLORS.white,
                fontStyle: "bold",
                fontSize: 8,
              },
              alternateRowStyles: {
                fillColor: [250, 251, 253],
              },
              theme: "grid",
            });
            y = (doc as any).lastAutoTable.finalY + 6;
          } catch {
            // Fallback: render as text
            y += 4;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(...COLORS.textLight);
            doc.text(`[Tableau: ${block.headers.join(" | ")}]`, PAGE_MARGIN, y);
            y += 8;
          }
          break;
        }

        case "separator": {
          y = checkPageBreak(y, 8);
          doc.setDrawColor(...COLORS.border);
          doc.setLineWidth(0.3);
          doc.line(PAGE_MARGIN + 20, y, pageWidth - PAGE_MARGIN - 20, y);
          y += 6;
          break;
        }
      }
    }
  }

  // ─── Save ─────────────────────────────────────────────────────────────

  const filename = singleReport
    ? `${REPORT_TITLES[singleReport] || singleReport}_${projectName}.pdf`
    : `Rapports_Compleo_${projectName}.pdf`;

  doc.save(filename.replace(/\s+/g, "_"));
}

/**
 * Export a single report as PDF.
 */
export async function exportSingleReportPDF(
  reportId: string,
  content: string,
  projectName?: string,
  generatedAt?: string,
): Promise<void> {
  return generateReportPDF({
    projectName,
    generatedAt,
    reports: { [reportId]: content },
    singleReport: reportId,
  });
}

/**
 * Export all reports as a single combined PDF.
 */
export async function exportAllReportsPDF(
  reports: Record<string, string | null>,
  projectName?: string,
  generatedAt?: string,
): Promise<void> {
  return generateReportPDF({
    projectName,
    generatedAt,
    reports,
  });
}
