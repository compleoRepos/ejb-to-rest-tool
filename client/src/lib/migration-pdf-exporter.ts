/**
 * Export PDF du plan de migration Strangler Fig
 * Génère un rapport PDF professionnel avec timeline, risques et estimations.
 *
 * @author Hamza NORDINE
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ============================================================
// Types (mirrored from Migration.tsx)
// ============================================================

interface MigrationTask {
  id: string;
  name: string;
  description: string;
  status: "pending" | "in-progress" | "completed";
  effort: "small" | "medium" | "large";
}

interface MigrationPhase {
  id: string;
  name: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "blocked";
  priority: "critical" | "high" | "medium" | "low";
  estimatedDays: number;
  dependencies: string[];
  services: string[];
  risks: string[];
  tasks: MigrationTask[];
}

interface StranglerFigPlan {
  phases: MigrationPhase[];
  totalEstimatedDays: number;
  overallProgress: number;
  riskScore: number;
}

// ============================================================
// Couleurs du thème
// ============================================================

const C = {
  dark: [30, 41, 59] as [number, number, number],
  primary: [15, 118, 110] as [number, number, number],
  primaryLight: [204, 251, 241] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  text: [51, 65, 85] as [number, number, number],
  textDark: [15, 23, 42] as [number, number, number],
  lightGray: [241, 245, 249] as [number, number, number],
  border: [203, 213, 225] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  amber: [234, 179, 8] as [number, number, number],
  blue: [37, 99, 235] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  emerald: [16, 185, 129] as [number, number, number],
};

// ============================================================
// Helpers
// ============================================================

function priorityColor(p: string): [number, number, number] {
  switch (p) {
    case "critical": return C.red;
    case "high": return C.amber;
    case "medium": return C.blue;
    case "low": return C.text;
    default: return C.text;
  }
}

function priorityLabel(p: string): string {
  switch (p) {
    case "critical": return "CRITIQUE";
    case "high": return "HAUTE";
    case "medium": return "MOYENNE";
    case "low": return "BASSE";
    default: return p.toUpperCase();
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case "completed": return "Termine";
    case "in-progress": return "En cours";
    case "pending": return "En attente";
    case "blocked": return "Bloque";
    default: return s;
  }
}

function statusColor(s: string): [number, number, number] {
  switch (s) {
    case "completed": return C.green;
    case "in-progress": return C.blue;
    case "pending": return C.text;
    case "blocked": return C.red;
    default: return C.text;
  }
}

function effortLabel(e: string): string {
  switch (e) {
    case "small": return "Faible";
    case "medium": return "Moyen";
    case "large": return "Important";
    default: return e;
  }
}

function effortDays(e: string): string {
  switch (e) {
    case "small": return "1-2j";
    case "medium": return "3-5j";
    case "large": return "5-10j";
    default: return "?";
  }
}

function addHeader(doc: jsPDF, text: string) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, pw, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C.white);
  doc.text("Plan de Migration Strangler Fig", 14, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(text, pw - 14, 10, { align: "right" });
  doc.setTextColor(...C.textDark);
}

function addFooter(doc: jsPDF, page: number, total: number) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(14, ph - 14, pw - 14, ph - 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.text);
  doc.text("Hamza NORDINE — Java Legacy Modernizer v4.0 Enterprise", 14, ph - 9);
  doc.text(`Page ${page} / ${total}`, pw - 14, ph - 9, { align: "right" });
}

function checkPageBreak(doc: jsPDF, y: number, needed: number): number {
  const ph = doc.internal.pageSize.getHeight();
  if (y + needed > ph - 25) {
    doc.addPage();
    return 28;
  }
  return y;
}

// ============================================================
// Main Export Function
// ============================================================

export function exportMigrationPlanPdf(plan: StranglerFigPlan, projectName?: string): void {
  const doc = new jsPDF("p", "mm", "a4");
  const pw = doc.internal.pageSize.getWidth();
  const margin = 14;
  const cw = pw - margin * 2;
  let y = 0;

  // ============================================================
  // PAGE 1 — Couverture
  // ============================================================

  // Header bar
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, pw, 75, "F");

  // Accent line
  doc.setFillColor(...C.emerald);
  doc.rect(0, 75, pw, 3, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...C.white);
  doc.text("Plan de Migration", margin, 28);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(16);
  doc.setTextColor(180, 220, 210);
  doc.text("Strangler Fig Pattern", margin, 40);

  // Project name
  if (projectName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...C.primaryLight);
    doc.text(`Projet : ${projectName}`, margin, 55);
  }

  // Date & Author
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(150, 180, 190);
  const dateStr = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  doc.text(`Date : ${dateStr}  |  Auteur : Hamza NORDINE`, margin, 67);

  y = 90;

  // ============================================================
  // Synthese globale
  // ============================================================

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...C.textDark);
  doc.text("Synthese globale", margin, y);
  y += 8;

  const totalTasks = plan.phases.flatMap((p) => p.tasks).length;
  const completedTasks = plan.phases.flatMap((p) => p.tasks).filter((t) => t.status === "completed").length;
  const inProgressTasks = plan.phases.flatMap((p) => p.tasks).filter((t) => t.status === "in-progress").length;
  const pendingTasks = totalTasks - completedTasks - inProgressTasks;
  const totalServices = [...new Set(plan.phases.flatMap((p) => p.services))].length;
  const totalRisks = plan.phases.reduce((sum, p) => sum + p.risks.length, 0);

  const summaryData = [
    ["Progression globale", `${plan.overallProgress}%`],
    ["Nombre de phases", String(plan.phases.length)],
    ["Effort total estime", `${plan.totalEstimatedDays} jours`],
    ["Score de risque", `${plan.riskScore} / 100`],
    ["Taches totales", String(totalTasks)],
    ["Taches terminees", String(completedTasks)],
    ["Taches en cours", String(inProgressTasks)],
    ["Taches en attente", String(pendingTasks)],
    ["Services concernes", String(totalServices)],
    ["Risques identifies", String(totalRisks)],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Indicateur", "Valeur"]],
    body: summaryData,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: C.textDark,
      lineColor: C.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: C.dark,
      textColor: C.white,
      fontStyle: "bold",
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: C.lightGray },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 80 },
      1: { halign: "center" },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // ============================================================
  // Timeline visuelle
  // ============================================================

  y = checkPageBreak(doc, y, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...C.textDark);
  doc.text("Timeline de migration", margin, y);
  y += 8;

  // Gantt-like timeline
  const maxDays = plan.totalEstimatedDays;
  const barAreaWidth = cw - 55;
  let cumulDays = 0;

  for (const phase of plan.phases) {
    y = checkPageBreak(doc, y, 14);

    // Phase label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...C.textDark);
    const shortName = phase.name.replace(/Phase \d+ — /, "").substring(0, 20);
    doc.text(shortName, margin, y + 5);

    // Bar
    const barX = margin + 55;
    const barStart = (cumulDays / maxDays) * barAreaWidth;
    const barWidth = Math.max((phase.estimatedDays / maxDays) * barAreaWidth, 8);
    const barColor = statusColor(phase.status);

    doc.setFillColor(...C.lightGray);
    doc.roundedRect(barX, y, barAreaWidth, 8, 1, 1, "F");

    doc.setFillColor(...barColor);
    doc.roundedRect(barX + barStart, y, barWidth, 8, 1, 1, "F");

    // Days label on bar
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...C.white);
    doc.text(`${phase.estimatedDays}j`, barX + barStart + barWidth / 2, y + 5.5, { align: "center" });

    cumulDays += phase.estimatedDays;
    y += 12;
  }

  // Timeline legend
  y += 4;
  y = checkPageBreak(doc, y, 12);
  const legends = [
    { label: "Termine", color: C.green },
    { label: "En cours", color: C.blue },
    { label: "En attente", color: C.text },
    { label: "Bloque", color: C.red },
  ];
  let lx = margin;
  for (const leg of legends) {
    doc.setFillColor(...leg.color);
    doc.roundedRect(lx, y, 6, 4, 1, 1, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.text);
    doc.text(leg.label, lx + 8, y + 3.5);
    lx += 35;
  }
  y += 12;

  // ============================================================
  // Detail par phase
  // ============================================================

  for (const phase of plan.phases) {
    doc.addPage();
    addHeader(doc, phase.name);
    y = 28;

    // Phase title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...C.textDark);
    doc.text(phase.name, margin, y);
    y += 6;

    // Description
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C.text);
    const descLines = doc.splitTextToSize(phase.description, cw);
    doc.text(descLines, margin, y);
    y += descLines.length * 4 + 6;

    // Phase metadata table
    const phaseMeta = [
      ["Statut", statusLabel(phase.status)],
      ["Priorite", priorityLabel(phase.priority)],
      ["Effort estime", `${phase.estimatedDays} jours`],
      ["Dependances", phase.dependencies.length > 0 ? phase.dependencies.join(", ") : "Aucune"],
      ["Services", phase.services.join(", ")],
    ];

    autoTable(doc, {
      startY: y,
      head: [["Propriete", "Valeur"]],
      body: phaseMeta,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
        textColor: C.textDark,
        lineColor: C.border,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: C.primary,
        textColor: C.white,
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: C.lightGray },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 50 },
      },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 1) {
          const row = phaseMeta[data.row.index];
          if (row && row[0] === "Statut") {
            data.cell.styles.textColor = statusColor(phase.status);
            data.cell.styles.fontStyle = "bold";
          }
          if (row && row[0] === "Priorite") {
            data.cell.styles.textColor = priorityColor(phase.priority);
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;

    // Tasks table
    y = checkPageBreak(doc, y, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...C.textDark);
    doc.text("Taches", margin, y);
    y += 5;

    const taskRows = phase.tasks.map((t) => [
      t.name,
      t.description,
      statusLabel(t.status),
      effortLabel(t.effort),
      effortDays(t.effort),
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Tache", "Description", "Statut", "Effort", "Duree"]],
      body: taskRows,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 7.5,
        cellPadding: 2.5,
        textColor: C.textDark,
        lineColor: C.border,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: C.dark,
        textColor: C.white,
        fontStyle: "bold",
        fontSize: 7.5,
      },
      alternateRowStyles: { fillColor: C.lightGray },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 45 },
        1: { cellWidth: 55 },
        2: { cellWidth: 22, halign: "center" },
        3: { cellWidth: 22, halign: "center" },
        4: { cellWidth: 18, halign: "center" },
      },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 2) {
          const task = phase.tasks[data.row.index];
          if (task) {
            data.cell.styles.textColor = statusColor(task.status);
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;

    // Risks section
    if (phase.risks.length > 0) {
      y = checkPageBreak(doc, y, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...C.red);
      doc.text("Risques identifies", margin, y);
      y += 5;

      const riskRows = phase.risks.map((r, i) => [
        `R${i + 1}`,
        r,
        phase.priority === "critical" ? "Eleve" : phase.priority === "high" ? "Moyen-Eleve" : "Moyen",
      ]);

      autoTable(doc, {
        startY: y,
        head: [["#", "Description du risque", "Niveau"]],
        body: riskRows,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          textColor: C.textDark,
          lineColor: C.border,
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: C.red,
          textColor: C.white,
          fontStyle: "bold",
          fontSize: 8,
        },
        alternateRowStyles: { fillColor: [255, 245, 245] as [number, number, number] },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 15, halign: "center" },
          2: { cellWidth: 30, halign: "center", fontStyle: "bold" },
        },
      });
    }
  }

  // ============================================================
  // Matrice des risques (page finale)
  // ============================================================

  doc.addPage();
  addHeader(doc, "Matrice des risques");
  y = 28;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...C.textDark);
  doc.text("Matrice globale des risques", margin, y);
  y += 8;

  const allRisks: string[][] = [];
  for (const phase of plan.phases) {
    for (const risk of phase.risks) {
      const level = phase.priority === "critical" ? "Critique" : phase.priority === "high" ? "Eleve" : phase.priority === "medium" ? "Moyen" : "Faible";
      allRisks.push([phase.name.replace(/Phase \d+ — /, ""), risk, level, `${phase.estimatedDays}j`]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [["Phase", "Risque", "Niveau", "Impact"]],
    body: allRisks,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: C.textDark,
      lineColor: C.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: C.dark,
      textColor: C.white,
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: C.lightGray },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 40 },
      1: { cellWidth: 70 },
      2: { cellWidth: 25, halign: "center", fontStyle: "bold" },
      3: { cellWidth: 20, halign: "center" },
    },
    didParseCell: (data: any) => {
      if (data.section === "body" && data.column.index === 2) {
        const val = data.cell.raw;
        if (val === "Critique") data.cell.styles.textColor = C.red;
        else if (val === "Eleve") data.cell.styles.textColor = C.amber;
        else if (val === "Moyen") data.cell.styles.textColor = C.blue;
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 15;

  // Recommendations
  y = checkPageBreak(doc, y, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...C.textDark);
  doc.text("Recommandations", margin, y);
  y += 8;

  const recommendations = [
    ["1", "Commencer par les phases de priorite critique pour debloquer les dependances en aval."],
    ["2", "Mettre en place un proxy Strangler Fig (API Gateway) des la Phase 1 pour router le trafic progressivement."],
    ["3", "Implementer des tests d'integration entre le monolithe et chaque nouveau microservice avant la mise en production."],
    ["4", "Utiliser le pattern Saga pour les transactions distribuees (paiements, commandes)."],
    ["5", "Planifier des points de controle (checkpoints) a la fin de chaque phase pour valider la migration."],
    ["6", "Maintenir un mecanisme de rollback vers le monolithe pendant toute la duree de la migration."],
  ];

  autoTable(doc, {
    startY: y,
    head: [["#", "Recommandation"]],
    body: recommendations,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: C.textDark,
      lineColor: C.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: C.emerald,
      textColor: C.white,
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [240, 253, 244] as [number, number, number] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 12, halign: "center" },
    },
  });

  // ============================================================
  // Add headers and footers to all pages
  // ============================================================

  const totalPages = doc.getNumberOfPages();
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    if (i > 1) {
      // Header already added for phase pages, add for others
    }
    addFooter(doc, i, totalPages);
  }

  // First page footer
  doc.setPage(1);
  addFooter(doc, 1, totalPages);

  // ============================================================
  // Save
  // ============================================================

  const safeName = (projectName || "projet").replace(/[^a-zA-Z0-9-_]/g, "_");
  doc.save(`Plan_Migration_StranglerFig_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
