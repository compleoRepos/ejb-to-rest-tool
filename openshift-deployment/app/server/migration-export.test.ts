/**
 * Tests pour les modules d'export du plan de migration
 * Vérifie la structure des données et la logique de transformation.
 * Note: Les exports PDF/Excel sont côté client (jsPDF, xlsx), on teste ici
 * la logique métier et la validation des données du plan.
 *
 * @author Compleo
 */
import { describe, expect, it } from "vitest";

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
// Helper: generate a test plan (same logic as Migration.tsx)
// ============================================================

function generateTestPlan(): StranglerFigPlan {
  const phases: MigrationPhase[] = [
    {
      id: "phase-1",
      name: "Phase 1 — Infrastructure & CI/CD",
      description: "Mise en place de l'infrastructure cloud.",
      status: "completed",
      priority: "critical",
      estimatedDays: 15,
      dependencies: [],
      services: ["API Gateway", "Docker Registry", "Kubernetes Cluster"],
      risks: ["Configuration réseau complexe", "Latence inter-services"],
      tasks: [
        { id: "t1-1", name: "Provisionner le cluster K8s", description: "EKS/GKE/AKS", status: "completed", effort: "large" },
        { id: "t1-2", name: "Pipeline CI/CD", description: "GitHub Actions + ArgoCD", status: "completed", effort: "medium" },
        { id: "t1-3", name: "Monitoring", description: "Prometheus + Grafana", status: "completed", effort: "medium" },
      ],
    },
    {
      id: "phase-2",
      name: "Phase 2 — Service Utilisateurs",
      description: "Migration du module utilisateurs.",
      status: "in-progress",
      priority: "high",
      estimatedDays: 20,
      dependencies: ["phase-1"],
      services: ["User Service", "Auth Service"],
      risks: ["Synchronisation des sessions"],
      tasks: [
        { id: "t2-1", name: "User Service Spring Boot", description: "REST API", status: "completed", effort: "large" },
        { id: "t2-2", name: "OAuth2/JWT", description: "Remplacer sessions EJB", status: "in-progress", effort: "large" },
        { id: "t2-3", name: "Tests d'intégration", description: "Compatibilité monolithe", status: "pending", effort: "medium" },
      ],
    },
    {
      id: "phase-3",
      name: "Phase 3 — Service Paiements",
      description: "Extraction du module paiements.",
      status: "pending",
      priority: "high",
      estimatedDays: 25,
      dependencies: ["phase-2"],
      services: ["Payment Service", "Notification Service"],
      risks: ["Intégrité transactionnelle", "PCI-DSS compliance"],
      tasks: [
        { id: "t3-1", name: "Payment Service", description: "Spring Boot + JPA", status: "pending", effort: "large" },
        { id: "t3-2", name: "Pattern Saga", description: "Transactions distribuées", status: "pending", effort: "large" },
      ],
    },
  ];

  const completedTasks = phases.flatMap((p) => p.tasks).filter((t) => t.status === "completed").length;
  const totalTasks = phases.flatMap((p) => p.tasks).length;
  const totalDays = phases.reduce((sum, p) => sum + p.estimatedDays, 0);

  return {
    phases,
    totalEstimatedDays: totalDays,
    overallProgress: Math.round((completedTasks / totalTasks) * 100),
    riskScore: 42,
  };
}

// ============================================================
// Tests
// ============================================================

describe("migration plan data structure", () => {
  const plan = generateTestPlan();

  it("has correct number of phases", () => {
    expect(plan.phases.length).toBe(3);
  });

  it("calculates total estimated days correctly", () => {
    const expected = 15 + 20 + 25;
    expect(plan.totalEstimatedDays).toBe(expected);
  });

  it("calculates overall progress correctly", () => {
    // 4 completed out of 8 total = 50%
    expect(plan.overallProgress).toBe(50);
  });

  it("has valid risk score", () => {
    expect(plan.riskScore).toBeGreaterThanOrEqual(0);
    expect(plan.riskScore).toBeLessThanOrEqual(100);
  });

  it("each phase has valid status", () => {
    const validStatuses = ["pending", "in-progress", "completed", "blocked"];
    for (const phase of plan.phases) {
      expect(validStatuses).toContain(phase.status);
    }
  });

  it("each phase has valid priority", () => {
    const validPriorities = ["critical", "high", "medium", "low"];
    for (const phase of plan.phases) {
      expect(validPriorities).toContain(phase.priority);
    }
  });

  it("each task has valid effort level", () => {
    const validEfforts = ["small", "medium", "large"];
    for (const phase of plan.phases) {
      for (const task of phase.tasks) {
        expect(validEfforts).toContain(task.effort);
      }
    }
  });

  it("dependencies reference existing phases", () => {
    const phaseIds = new Set(plan.phases.map((p) => p.id));
    for (const phase of plan.phases) {
      for (const dep of phase.dependencies) {
        expect(phaseIds).toContain(dep);
      }
    }
  });

  it("first phase has no dependencies", () => {
    expect(plan.phases[0].dependencies.length).toBe(0);
  });

  it("collects all unique services", () => {
    const allServices = [...new Set(plan.phases.flatMap((p) => p.services))];
    expect(allServices.length).toBeGreaterThan(0);
    expect(allServices).toContain("API Gateway");
    expect(allServices).toContain("User Service");
    expect(allServices).toContain("Payment Service");
  });

  it("collects all risks", () => {
    const allRisks = plan.phases.flatMap((p) => p.risks);
    expect(allRisks.length).toBeGreaterThan(0);
    expect(allRisks).toContain("Configuration réseau complexe");
    expect(allRisks).toContain("PCI-DSS compliance");
  });

  it("completed phase has all tasks completed", () => {
    const completedPhase = plan.phases.find((p) => p.status === "completed");
    expect(completedPhase).toBeDefined();
    if (completedPhase) {
      const allDone = completedPhase.tasks.every((t) => t.status === "completed");
      expect(allDone).toBe(true);
    }
  });

  it("in-progress phase has at least one in-progress or pending task", () => {
    const ipPhase = plan.phases.find((p) => p.status === "in-progress");
    expect(ipPhase).toBeDefined();
    if (ipPhase) {
      const hasActive = ipPhase.tasks.some((t) => t.status === "in-progress" || t.status === "pending");
      expect(hasActive).toBe(true);
    }
  });
});

describe("migration plan export data preparation", () => {
  const plan = generateTestPlan();

  it("generates valid timeline data", () => {
    let cumulDays = 0;
    for (const phase of plan.phases) {
      const start = cumulDays + 1;
      const end = cumulDays + phase.estimatedDays;
      expect(start).toBeGreaterThan(0);
      expect(end).toBeGreaterThanOrEqual(start);
      expect(phase.estimatedDays).toBeGreaterThan(0);
      cumulDays += phase.estimatedDays;
    }
    expect(cumulDays).toBe(plan.totalEstimatedDays);
  });

  it("generates valid risk matrix data", () => {
    const riskMatrix: { phase: string; risk: string; level: string }[] = [];
    for (const phase of plan.phases) {
      for (const risk of phase.risks) {
        const level =
          phase.priority === "critical"
            ? "Critique"
            : phase.priority === "high"
            ? "Élevé"
            : phase.priority === "medium"
            ? "Moyen"
            : "Faible";
        riskMatrix.push({ phase: phase.name, risk, level });
      }
    }
    expect(riskMatrix.length).toBe(5); // 2 + 1 + 2 risks
    expect(riskMatrix[0].level).toBe("Critique"); // phase-1 is critical
    expect(riskMatrix[2].level).toBe("Élevé"); // phase-2 is high
  });

  it("generates valid task flat list", () => {
    const allTasks = plan.phases.flatMap((p) =>
      p.tasks.map((t) => ({
        phase: p.name,
        task: t.name,
        status: t.status,
        effort: t.effort,
      }))
    );
    expect(allTasks.length).toBe(8);
    expect(allTasks[0].phase).toContain("Infrastructure");
    expect(allTasks[allTasks.length - 1].phase).toContain("Paiements");
  });

  it("generates valid service map", () => {
    const serviceMap = new Map<string, string[]>();
    for (const phase of plan.phases) {
      for (const service of phase.services) {
        const existing = serviceMap.get(service) || [];
        existing.push(phase.name);
        serviceMap.set(service, existing);
      }
    }
    expect(serviceMap.size).toBe(7);
    expect(serviceMap.has("API Gateway")).toBe(true);
    expect(serviceMap.has("Payment Service")).toBe(true);
  });
});
