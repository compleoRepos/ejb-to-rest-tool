/**
 * Export Excel du plan de migration Strangler Fig
 * Génère un classeur Excel multi-feuilles avec synthèse, phases, tâches, risques et timeline.
 *
 * @author Hamza NORDINE
 */

import * as XLSX from "xlsx";

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
// Helpers
// ============================================================

function statusLabel(s: string): string {
  switch (s) {
    case "completed": return "Terminé";
    case "in-progress": return "En cours";
    case "pending": return "En attente";
    case "blocked": return "Bloqué";
    default: return s;
  }
}

function priorityLabel(p: string): string {
  switch (p) {
    case "critical": return "Critique";
    case "high": return "Haute";
    case "medium": return "Moyenne";
    case "low": return "Basse";
    default: return p;
  }
}

function effortLabel(e: string): string {
  switch (e) {
    case "small": return "Faible (1-2j)";
    case "medium": return "Moyen (3-5j)";
    case "large": return "Important (5-10j)";
    default: return e;
  }
}

function setColumnWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map((w) => ({ wch: w }));
}

// ============================================================
// Main Export Function
// ============================================================

export function exportMigrationPlanExcel(plan: StranglerFigPlan, projectName?: string): void {
  const wb = XLSX.utils.book_new();
  const dateStr = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // ============================================================
  // Feuille 1 — Synthèse
  // ============================================================

  const totalTasks = plan.phases.flatMap((p) => p.tasks).length;
  const completedTasks = plan.phases.flatMap((p) => p.tasks).filter((t) => t.status === "completed").length;
  const inProgressTasks = plan.phases.flatMap((p) => p.tasks).filter((t) => t.status === "in-progress").length;
  const pendingTasks = totalTasks - completedTasks - inProgressTasks;
  const totalServices = [...new Set(plan.phases.flatMap((p) => p.services))].length;
  const totalRisks = plan.phases.reduce((sum, p) => sum + p.risks.length, 0);

  const synthData = [
    ["Plan de Migration Strangler Fig"],
    [`Projet : ${projectName || "N/A"}`],
    [`Date : ${dateStr}`],
    ["Auteur : Hamza NORDINE"],
    [],
    ["Indicateur", "Valeur"],
    ["Progression globale", `${plan.overallProgress}%`],
    ["Nombre de phases", plan.phases.length],
    ["Effort total estimé", `${plan.totalEstimatedDays} jours`],
    ["Score de risque", `${plan.riskScore} / 100`],
    ["Tâches totales", totalTasks],
    ["Tâches terminées", completedTasks],
    ["Tâches en cours", inProgressTasks],
    ["Tâches en attente", pendingTasks],
    ["Services concernés", totalServices],
    ["Risques identifiés", totalRisks],
  ];

  const wsSynth = XLSX.utils.aoa_to_sheet(synthData);
  setColumnWidths(wsSynth, [30, 20]);
  // Merge title row
  wsSynth["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  XLSX.utils.book_append_sheet(wb, wsSynth, "Synthèse");

  // ============================================================
  // Feuille 2 — Phases
  // ============================================================

  const phasesHeader = ["Phase", "Description", "Statut", "Priorité", "Effort (jours)", "Dépendances", "Services", "Nb Tâches", "Progression"];
  const phasesData = plan.phases.map((p) => {
    const done = p.tasks.filter((t) => t.status === "completed").length;
    const progress = p.tasks.length > 0 ? Math.round((done / p.tasks.length) * 100) : 0;
    return [
      p.name,
      p.description,
      statusLabel(p.status),
      priorityLabel(p.priority),
      p.estimatedDays,
      p.dependencies.length > 0 ? p.dependencies.join(", ") : "Aucune",
      p.services.join(", "),
      p.tasks.length,
      `${progress}%`,
    ];
  });

  const wsPhases = XLSX.utils.aoa_to_sheet([phasesHeader, ...phasesData]);
  setColumnWidths(wsPhases, [35, 50, 15, 12, 15, 25, 35, 12, 12]);
  XLSX.utils.book_append_sheet(wb, wsPhases, "Phases");

  // ============================================================
  // Feuille 3 — Toutes les tâches
  // ============================================================

  const tasksHeader = ["Phase", "Tâche", "Description", "Statut", "Effort", "Durée estimée"];
  const tasksData: (string | number)[][] = [];
  for (const phase of plan.phases) {
    for (const task of phase.tasks) {
      tasksData.push([
        phase.name.replace(/Phase \d+ — /, ""),
        task.name,
        task.description,
        statusLabel(task.status),
        effortLabel(task.effort),
        task.effort === "small" ? "1-2 jours" : task.effort === "medium" ? "3-5 jours" : "5-10 jours",
      ]);
    }
  }

  const wsTasks = XLSX.utils.aoa_to_sheet([tasksHeader, ...tasksData]);
  setColumnWidths(wsTasks, [25, 40, 45, 15, 20, 15]);
  XLSX.utils.book_append_sheet(wb, wsTasks, "Tâches");

  // ============================================================
  // Feuille 4 — Risques
  // ============================================================

  const risksHeader = ["Phase", "Risque", "Niveau", "Priorité phase", "Impact (jours)"];
  const risksData: (string | number)[][] = [];
  for (const phase of plan.phases) {
    for (const risk of phase.risks) {
      const level = phase.priority === "critical" ? "Critique" : phase.priority === "high" ? "Élevé" : phase.priority === "medium" ? "Moyen" : "Faible";
      risksData.push([
        phase.name.replace(/Phase \d+ — /, ""),
        risk,
        level,
        priorityLabel(phase.priority),
        phase.estimatedDays,
      ]);
    }
  }

  const wsRisks = XLSX.utils.aoa_to_sheet([risksHeader, ...risksData]);
  setColumnWidths(wsRisks, [25, 50, 15, 15, 15]);
  XLSX.utils.book_append_sheet(wb, wsRisks, "Risques");

  // ============================================================
  // Feuille 5 — Timeline (Gantt simplifié)
  // ============================================================

  const timelineHeader = ["Phase", "Début (jour)", "Fin (jour)", "Durée (jours)", "Statut", "Dépendances"];
  const timelineData: (string | number)[][] = [];
  let cumulDays = 0;
  for (const phase of plan.phases) {
    const start = cumulDays + 1;
    const end = cumulDays + phase.estimatedDays;
    timelineData.push([
      phase.name,
      start,
      end,
      phase.estimatedDays,
      statusLabel(phase.status),
      phase.dependencies.length > 0 ? phase.dependencies.join(", ") : "Aucune",
    ]);
    cumulDays += phase.estimatedDays;
  }

  const wsTimeline = XLSX.utils.aoa_to_sheet([timelineHeader, ...timelineData]);
  setColumnWidths(wsTimeline, [35, 15, 15, 15, 15, 25]);
  XLSX.utils.book_append_sheet(wb, wsTimeline, "Timeline");

  // ============================================================
  // Feuille 6 — Services
  // ============================================================

  const servicesHeader = ["Service", "Phase(s)", "Statut phase"];
  const serviceMap = new Map<string, { phases: string[]; statuses: string[] }>();
  for (const phase of plan.phases) {
    for (const service of phase.services) {
      const existing = serviceMap.get(service) || { phases: [], statuses: [] };
      existing.phases.push(phase.name.replace(/Phase \d+ — /, ""));
      existing.statuses.push(statusLabel(phase.status));
      serviceMap.set(service, existing);
    }
  }
  const servicesData = Array.from(serviceMap.entries()).map(([name, info]) => [
    name,
    info.phases.join(", "),
    info.statuses.join(", "),
  ]);

  const wsServices = XLSX.utils.aoa_to_sheet([servicesHeader, ...servicesData]);
  setColumnWidths(wsServices, [25, 50, 30]);
  XLSX.utils.book_append_sheet(wb, wsServices, "Services");

  // ============================================================
  // Save
  // ============================================================

  const safeName = (projectName || "projet").replace(/[^a-zA-Z0-9-_]/g, "_");
  XLSX.writeFile(wb, `Plan_Migration_StranglerFig_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
