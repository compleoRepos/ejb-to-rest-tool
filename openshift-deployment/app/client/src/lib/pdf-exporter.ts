/**
 * Export PDF du rapport d'analyse IA — EJB Client Modernizer
 *
 * Génère un rapport PDF professionnel côté client avec jsPDF.
 * Inclut : scores de qualité, anti-patterns, optimisations, suggestions.
 *
 * @author Compleo
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AiAnalysisResult, AiSuggestion, CodeOptimization, QualityScore } from "./ai-engine";

// ============================================================
// Couleurs du thème
// ============================================================
const COLORS = {
  primary: [15, 118, 110] as [number, number, number],       // Teal-700
  primaryLight: [204, 251, 241] as [number, number, number],  // Teal-100
  dark: [30, 41, 59] as [number, number, number],             // Slate-800
  text: [51, 65, 85] as [number, number, number],             // Slate-600
  textDark: [15, 23, 42] as [number, number, number],         // Slate-900
  white: [255, 255, 255] as [number, number, number],
  lightGray: [241, 245, 249] as [number, number, number],     // Slate-100
  border: [203, 213, 225] as [number, number, number],        // Slate-300
  critical: [220, 38, 38] as [number, number, number],        // Red-600
  warning: [234, 179, 8] as [number, number, number],         // Yellow-500
  info: [37, 99, 235] as [number, number, number],            // Blue-600
  suggestion: [22, 163, 74] as [number, number, number],      // Green-600
  success: [22, 163, 74] as [number, number, number],         // Green-600
};

// ============================================================
// Helpers
// ============================================================

function severityColor(severity: string): [number, number, number] {
  switch (severity) {
    case "critical": return COLORS.critical;
    case "warning": return COLORS.warning;
    case "info": return COLORS.info;
    case "suggestion": return COLORS.suggestion;
    default: return COLORS.text;
  }
}

function severityLabel(severity: string): string {
  switch (severity) {
    case "critical": return "CRITIQUE";
    case "warning": return "AVERTISSEMENT";
    case "info": return "INFO";
    case "suggestion": return "SUGGESTION";
    default: return severity.toUpperCase();
  }
}

function scoreColor(score: number): [number, number, number] {
  if (score >= 85) return COLORS.success;
  if (score >= 70) return COLORS.warning;
  return COLORS.critical;
}

function addPageHeader(doc: jsPDF, title: string) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header bar
  doc.setFillColor(...COLORS.dark);
  doc.rect(0, 0, pageWidth, 18, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.white);
  doc.text("EJB Client Modernizer — Rapport IA", 14, 11);

  // Right side
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(title, pageWidth - 14, 11, { align: "right" });

  doc.setTextColor(...COLORS.textDark);
}

function addFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Footer line
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);

  // Footer text
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.text);
  doc.text("Compleo — EJB Client Modernizer v3.0", 14, pageHeight - 10);
  doc.text(`Moteur IA v3.0 — 83+ regles (OWASP, SonarQube, SOLID, Clean Code, PMD, Couplage, Transactions)`, pageWidth / 2, pageHeight - 10, { align: "center" });
  doc.text(`Page ${pageNum} / ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: "right" });
}

function drawScoreGauge(doc: jsPDF, x: number, y: number, score: number, label: string) {
  const color = scoreColor(score);

  // Background circle
  doc.setFillColor(...COLORS.lightGray);
  doc.circle(x + 22, y + 22, 20, "F");

  // Score arc (simplified as filled portion)
  doc.setFillColor(...color);
  doc.circle(x + 22, y + 22, 17, "F");

  // Inner white circle
  doc.setFillColor(...COLORS.white);
  doc.circle(x + 22, y + 22, 13, "F");

  // Score text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...color);
  doc.text(`${score}`, x + 22, y + 25, { align: "center" });

  // /100
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.text);
  doc.text("/100", x + 22, y + 31, { align: "center" });

  // Label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.textDark);
  doc.text(label, x + 22, y + 50, { align: "center" });
}

function drawScoreBar(doc: jsPDF, x: number, y: number, width: number, score: number, label: string) {
  const barHeight = 5;
  const color = scoreColor(score);

  // Label
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.text);
  doc.text(label, x, y - 1);

  // Score value
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...color);
  doc.text(`${score}`, x + width, y - 1, { align: "right" });

  // Background bar
  doc.setFillColor(...COLORS.lightGray);
  doc.roundedRect(x, y + 1, width, barHeight, 1.5, 1.5, "F");

  // Score bar
  const filledWidth = (score / 100) * width;
  doc.setFillColor(...color);
  doc.roundedRect(x, y + 1, Math.max(filledWidth, 3), barHeight, 1.5, 1.5, "F");
}

// ============================================================
// Main export function
// ============================================================

export function exportAiReportPdf(aiResult: AiAnalysisResult, projectName?: string): void {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  // ============================================================
  // PAGE 1 — Cover & Scores
  // ============================================================

  // Cover header
  doc.setFillColor(...COLORS.dark);
  doc.rect(0, 0, pageWidth, 70, "F");

  // Accent line
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 70, pageWidth, 3, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...COLORS.white);
  doc.text("Rapport d'Analyse IA", margin, 30);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(180, 200, 220);
  doc.text("EJB Client Modernizer — Analyse Deterministe", margin, 40);

  // Project name
  if (projectName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.primaryLight);
    doc.text(`Projet : ${projectName}`, margin, 52);
  }

  // Date & Author
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(150, 170, 190);
  const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  doc.text(`Date : ${dateStr}  |  Auteur : Compleo`, margin, 62);

  y = 85;

  // ---- Summary badges ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.textDark);
  doc.text("Resume de l'analyse", margin, y);
  y += 8;

  // Summary table
  const summaryData = [
    ["Suggestions totales", String(aiResult.summary.totalSuggestions)],
    ["Critiques", String(aiResult.summary.criticalCount)],
    ["Avertissements", String(aiResult.summary.warningCount)],
    ["Informations", String(aiResult.summary.infoCount)],
    ["Complexite de migration", aiResult.summary.migrationComplexity.charAt(0).toUpperCase() + aiResult.summary.migrationComplexity.slice(1)],
    ["Effort estime", `${aiResult.summary.estimatedEffortDays} jour(s)`],
    ["Niveau de confiance", aiResult.summary.confidenceLevel],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Indicateur", "Valeur"]],
    body: summaryData,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: COLORS.textDark,
      lineColor: COLORS.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: COLORS.dark,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 9,
    },
    alternateRowStyles: {
      fillColor: COLORS.lightGray,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 80 },
      1: { halign: "center" },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 15;

  // ---- Rules Engine Metrics ----
  if (aiResult.summary.totalRules) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...COLORS.textDark);
    doc.text("Moteur de regles IA v3.0", margin, y);
    y += 3;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.text);
    doc.text("Sources : OWASP, SonarQube, SOLID, Clean Code, PMD, SpotBugs, Checkstyle, Couplage, Transactions, Concurrence", margin, y + 4);
    y += 10;

    const rulesData: string[][] = [
      ["Regles totales", String(aiResult.summary.totalRules)],
      ["Regles declenchees", String(aiResult.summary.rulesTriggered || 0)],
      ["Regles conformes", String(aiResult.summary.totalRules - (aiResult.summary.rulesTriggered || 0))],
      ["Taux de conformite", `${Math.round(((aiResult.summary.totalRules - (aiResult.summary.rulesTriggered || 0)) / aiResult.summary.totalRules) * 100)}%`],
    ];

    if (aiResult.summary.rulesByCategory) {
      const sorted = Object.entries(aiResult.summary.rulesByCategory).sort((a, b) => b[1] - a[1]);
      for (const [cat, count] of sorted) {
        rulesData.push([`  ${cat}`, String(count)]);
      }
    }

    autoTable(doc, {
      startY: y,
      head: [["Indicateur", "Valeur"]],
      body: rulesData,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
        textColor: COLORS.textDark,
        lineColor: COLORS.border,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [0, 128, 128],
        textColor: COLORS.white,
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: COLORS.lightGray,
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 80 },
        1: { halign: "center" },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 15;
  }

  // ---- Quality Scores ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.textDark);
  doc.text("Scores de qualite", margin, y);
  y += 5;

  // Legacy score gauge
  const gaugeStartX = margin + 10;
  drawScoreGauge(doc, gaugeStartX, y, aiResult.legacyScore.overall, "Code Legacy");

  // Modern score gauge
  drawScoreGauge(doc, gaugeStartX + 80, y, aiResult.modernScore.overall, "Code Modernise");

  // Arrow between gauges
  doc.setFillColor(...COLORS.primary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.primary);
  doc.text("→", gaugeStartX + 60, y + 25, { align: "center" });

  // Gain
  const gain = aiResult.modernScore.overall - aiResult.legacyScore.overall;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.success);
  doc.text(`+${gain} points`, gaugeStartX + 60, y + 35, { align: "center" });

  y += 60;

  // Score breakdown bars - Legacy
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textDark);
  doc.text("Detail — Code Legacy", margin, y);
  y += 5;

  const barWidth = (contentWidth - 20) / 2;
  drawScoreBar(doc, margin, y, barWidth, aiResult.legacyScore.maintainability, "Maintenabilite");
  drawScoreBar(doc, margin + barWidth + 20, y, barWidth, aiResult.legacyScore.security, "Securite");
  y += 14;
  drawScoreBar(doc, margin, y, barWidth, aiResult.legacyScore.performance, "Performance");
  drawScoreBar(doc, margin + barWidth + 20, y, barWidth, aiResult.legacyScore.resilience, "Resilience");
  y += 18;

  // Score breakdown bars - Modern
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textDark);
  doc.text("Detail — Code Modernise", margin, y);
  y += 5;

  drawScoreBar(doc, margin, y, barWidth, aiResult.modernScore.maintainability, "Maintenabilite");
  drawScoreBar(doc, margin + barWidth + 20, y, barWidth, aiResult.modernScore.security, "Securite");
  y += 14;
  drawScoreBar(doc, margin, y, barWidth, aiResult.modernScore.performance, "Performance");
  drawScoreBar(doc, margin + barWidth + 20, y, barWidth, aiResult.modernScore.resilience, "Resilience");

  // ============================================================
  // PAGE 2 — Optimizations
  // ============================================================
  doc.addPage();
  addPageHeader(doc, "Optimisations");
  y = 28;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.textDark);
  doc.text("Optimisations appliquees et recommandees", margin, y);
  y += 8;

  const optimData = aiResult.optimizations.map((opt: CodeOptimization) => [
    opt.type.charAt(0).toUpperCase() + opt.type.slice(1).replace("-", " "),
    opt.applied ? "Applique" : "Recommande",
    opt.description,
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Optimisation", "Statut", "Description"]],
    body: optimData,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: COLORS.textDark,
      lineColor: COLORS.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: COLORS.dark,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: COLORS.lightGray,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 35 },
      1: { cellWidth: 25, halign: "center" },
      2: { cellWidth: "auto" },
    },
    didParseCell: (data: any) => {
      if (data.column.index === 1 && data.section === "body") {
        const val = data.cell.raw as string;
        if (val === "Applique") {
          data.cell.styles.textColor = COLORS.success;
          data.cell.styles.fontStyle = "bold";
        } else {
          data.cell.styles.textColor = COLORS.warning;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 15;

  // ---- Top Risks ----
  if (aiResult.summary.topRisks.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...COLORS.textDark);
    doc.text("Risques principaux identifies", margin, y);
    y += 8;

    const riskData = aiResult.summary.topRisks.map((risk: string, i: number) => [
      `R-${String(i + 1).padStart(2, "0")}`,
      risk,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["ID", "Description du risque"]],
      body: riskData,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: COLORS.textDark,
        lineColor: COLORS.border,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: COLORS.critical,
        textColor: COLORS.white,
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [254, 242, 242],
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 20, halign: "center" },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 15;
  }

  // ============================================================
  // PAGE 3+ — Suggestions
  // ============================================================
  doc.addPage();
  addPageHeader(doc, "Suggestions");
  y = 28;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.textDark);
  doc.text(`Suggestions detaillees (${aiResult.suggestions.length})`, margin, y);
  y += 8;

  // Group suggestions by severity
  const severityOrder: string[] = ["critical", "warning", "info", "suggestion"];
  const groupedSuggestions = new Map<string, AiSuggestion[]>();
  for (const sev of severityOrder) {
    const items = aiResult.suggestions.filter((s: AiSuggestion) => s.severity === sev);
    if (items.length > 0) {
      groupedSuggestions.set(sev, items);
    }
  }

  for (const [severity, suggestions] of Array.from(groupedSuggestions.entries())) {
    // Check if we need a new page
    if (y > 250) {
      doc.addPage();
      addPageHeader(doc, "Suggestions");
      y = 28;
    }

    // Severity header
    const sevColor = severityColor(severity);
    doc.setFillColor(...sevColor);
    doc.roundedRect(margin, y - 4, contentWidth, 8, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.white);
    doc.text(`${severityLabel(severity)} (${suggestions.length})`, margin + 4, y + 1);
    y += 10;

    const suggData = suggestions.map((s: AiSuggestion) => [
      s.ruleId,
      s.category,
      s.title,
      s.line ? `L.${s.line}` : "-",
      s.fix || s.impact,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Regle", "Categorie", "Description", "Ligne", "Correction / Impact"]],
      body: suggData,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 7,
        cellPadding: 2.5,
        textColor: COLORS.textDark,
        lineColor: COLORS.border,
        lineWidth: 0.15,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: COLORS.dark,
        textColor: COLORS.white,
        fontStyle: "bold",
        fontSize: 7,
      },
      alternateRowStyles: {
        fillColor: COLORS.lightGray,
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 18, halign: "center" },
        1: { cellWidth: 25 },
        2: { cellWidth: 50 },
        3: { cellWidth: 12, halign: "center" },
        4: { cellWidth: "auto" },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ============================================================
  // Score breakdown detail page
  // ============================================================
  doc.addPage();
  addPageHeader(doc, "Detail des scores");
  y = 28;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.textDark);
  doc.text("Detail des scores — Code Legacy", margin, y);
  y += 8;

  if (aiResult.legacyScore.breakdown && aiResult.legacyScore.breakdown.length > 0) {
    const legacyBreakdown = aiResult.legacyScore.breakdown.map((d) => [
      d.category,
      `${d.score} / ${d.maxScore}`,
      d.reason,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Critere", "Score", "Justification"]],
      body: legacyBreakdown,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: COLORS.textDark,
        lineColor: COLORS.border,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: COLORS.dark,
        textColor: COLORS.white,
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: COLORS.lightGray,
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 35 },
        1: { cellWidth: 25, halign: "center" },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 15;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.textDark);
  doc.text("Detail des scores — Code Modernise", margin, y);
  y += 8;

  if (aiResult.modernScore.breakdown && aiResult.modernScore.breakdown.length > 0) {
    const modernBreakdown = aiResult.modernScore.breakdown.map((d) => [
      d.category,
      `${d.score} / ${d.maxScore}`,
      d.reason,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Critere", "Score", "Justification"]],
      body: modernBreakdown,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: COLORS.textDark,
        lineColor: COLORS.border,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: COLORS.lightGray,
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 35 },
        1: { cellWidth: 25, halign: "center" },
      },
    });
  }

  // ============================================================
  // Add page numbers (footer on all pages)
  // ============================================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, i, totalPages);
  }

  // ============================================================
  // Save
  // ============================================================
  const fileName = projectName
    ? `rapport-ia-${projectName.toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf`
    : `rapport-ia-ejb-client-modernizer.pdf`;
  doc.save(fileName);
}
// PDF export v2.0 - Compleo — Moteur IA v2.0 avec 55+ regles industrielles
