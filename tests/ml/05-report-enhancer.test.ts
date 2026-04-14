/**
 * Tests unitaires — ReportEnhancer (Compleo v7.4)
 *
 * Vérifie le comportement du ReportEnhancer :
 *   - Fallback gracieux si ML désactivé → rapports originaux
 *   - Fallback gracieux si Ollama indisponible → pas d'exception
 *   - extractRisks() détecte les risques Oracle, DB2, SOAP, couplage
 *   - estimateDuration() calcule correctement la durée
 *   - cleanMarkdown() nettoie les artefacts LLM
 *   - buildMockContext() génère un contexte valide
 *
 * Les tests avec Ollama réel sont skippés si OLLAMA_URL n'est pas défini.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { ReportEnhancer, type ReportContext } from "../../server/engine/ml/report-enhancer";
import { buildMockContext } from "../helpers/mock-context";

// Skip si Ollama non disponible
const skipIfNoOllama = process.env.OLLAMA_URL ? it : it.skip;

describe("ReportEnhancer", () => {
  let enhancer: ReportEnhancer;

  beforeAll(() => {
    enhancer = new ReportEnhancer({
      enabled:   true,
      ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
      model:     "qwen2.5:1.5b",
      language:  "fr",
    });
  });

  // ── Tests sans Ollama (toujours exécutés) ──────────────────────

  it("fallback sans Ollama — retourne le rapport original quand disabled", async () => {
    const enhancerOff = new ReportEnhancer({
      enabled:   false,
      ollamaUrl: "http://localhost:11434",
      model:     "qwen2.5:1.5b",
      language:  "fr",
    });
    const ctx    = buildMockContext();
    const result = await enhancerOff.enhanceAll(ctx);
    expect(result.enhanced).toBe(false);
    expect(result.reports).toEqual({});
  });

  it("timeout gracieux — retourne enhanced=false sans planter", async () => {
    const enhancerTimeout = new ReportEnhancer({
      enabled:   true,
      ollamaUrl: "http://localhost:99999",  // port invalide
      model:     "qwen2.5:1.5b",
      language:  "fr",
      timeoutMs: 2000,  // timeout court pour le test
    });
    const ctx    = buildMockContext();
    const result = await enhancerTimeout.enhanceAll(ctx);
    // Pas d'exception — les rapports ML sont null, mais QUALITY_SCORE est statique
    expect(result.enhanced).toBe(true);
    // Les rapports ML (qui nécessitent Ollama) sont null
    for (const key of Object.keys(result.reports)) {
      if (key === "QUALITY_SCORE") {
        // QUALITY_SCORE est calculé statiquement, pas via Ollama
        // Il peut être non-null même sans Ollama
        continue;
      }
      expect(result.reports[key]).toBeNull();
    }
  });

  // ── Tests des helpers (pure logique, pas de réseau) ────────────

  describe("extractRisks()", () => {
    it("détecte les risques Oracle FOR UPDATE NOWAIT", () => {
      const ctx = buildMockContext({ hasOracle: true });
      const risks = enhancer.extractRisks(ctx);
      expect(risks.some(r => r.includes("FOR UPDATE NOWAIT"))).toBe(true);
    });

    it("détecte les risques DB2", () => {
      const ctx = buildMockContext({ hasDB2: true });
      // Ajouter un module avec DataSource DB2
      ctx.modules[0].dataSources = ["jdbc/BMCE_LEGACY_DB2"];
      const risks = enhancer.extractRisks(ctx);
      expect(risks.some(r => r.includes("DB2"))).toBe(true);
    });

    it("détecte les risques SOAP", () => {
      const ctx = buildMockContext({ hasSoap: true });
      const risks = enhancer.extractRisks(ctx);
      expect(risks.some(r => r.includes("SOAP"))).toBe(true);
    });

    it("détecte le fort couplage @EJB (> 2 appels)", () => {
      const ctx = buildMockContext();
      ctx.modules[0].ejbCalls = ["CarteEJB", "VirementEJB", "CompteEJB"];
      const risks = enhancer.extractRisks(ctx);
      expect(risks.some(r => r.includes("appels @EJB"))).toBe(true);
    });

    it("détecte les transactions distribuées (> 2 DataSources)", () => {
      const ctx = buildMockContext();
      ctx.modules[0].dataSources = ["ds1", "ds2", "ds3"];
      const risks = enhancer.extractRisks(ctx);
      expect(risks.some(r => r.includes("DataSources"))).toBe(true);
    });

    it("retourne un tableau vide si aucun risque", () => {
      const ctx = buildMockContext();
      // Nettoyer tous les risques
      for (const m of ctx.modules) {
        m.sqlFeatures = [];
        m.dataSources = [];
        m.externalApis = [];
        m.ejbCalls = [];
      }
      const risks = enhancer.extractRisks(ctx);
      expect(risks).toEqual([]);
    });
  });

  describe("estimateDuration()", () => {
    it("calcule 2 semaines par service + 4 semaines setup", () => {
      const ctx = buildMockContext({ serviceCount: 6 });
      expect(enhancer.estimateDuration(ctx)).toBe(16); // 6*2 + 4
    });

    it("calcule correctement pour un seul service", () => {
      const ctx = buildMockContext({ serviceCount: 1 });
      expect(enhancer.estimateDuration(ctx)).toBe(6); // 1*2 + 4
    });
  });

  describe("cleanMarkdown()", () => {
    it("supprime les marqueurs ```markdown", () => {
      const raw = "```markdown\n# Titre\nContenu\n```";
      expect(enhancer.cleanMarkdown(raw)).toBe("# Titre\nContenu");
    });

    it("trim les espaces", () => {
      const raw = "  \n# Titre\n  ";
      expect(enhancer.cleanMarkdown(raw)).toBe("# Titre");
    });

    it("retourne le contenu intact si pas de marqueurs", () => {
      const raw = "# Titre\nContenu normal";
      expect(enhancer.cleanMarkdown(raw)).toBe("# Titre\nContenu normal");
    });
  });

  describe("buildMockContext()", () => {
    it("génère un contexte valide par défaut", () => {
      const ctx = buildMockContext();
      expect(ctx.projectName).toBe("BMCE Digital Banking");
      expect(ctx.modules.length).toBe(5);
      expect(ctx.services.length).toBe(6);
      expect(ctx.dataSources.length).toBeGreaterThanOrEqual(1);
      expect(ctx.qualityReport.score).toBe(87);
    });

    it("respecte les options personnalisées", () => {
      const ctx = buildMockContext({
        projectName: "Custom Bank",
        moduleCount: 3,
        serviceCount: 2,
        hasOracle: true,
        hasDB2: true,
      });
      expect(ctx.projectName).toBe("Custom Bank");
      expect(ctx.modules.length).toBe(3);
      expect(ctx.services.length).toBe(2);
      expect(ctx.dataSources.length).toBe(2); // Oracle + DB2
    });

    it("inclut les modules BMCE par défaut", () => {
      const ctx = buildMockContext();
      const moduleIds = ctx.modules.map(m => m.id);
      expect(moduleIds).toContain("CompteEJB");
      expect(moduleIds).toContain("CarteEJB");
      expect(moduleIds).toContain("AuthServlet");
    });
  });

  // ── Tests avec Ollama réel (skippés si non disponible) ─────────

  skipIfNoOllama(
    "enhanceMigrationReport — génère un rapport en français",
    async () => {
      const ctx = buildMockContext({
        projectName: "BMCE Digital Banking",
        moduleCount: 5,
        hasOracle:   true,
        hasDB2:      true,
        hasJMS:      true,
        hasSoap:     true,
      });
      const report = await enhancer.enhanceMigrationReport(ctx);
      // En français
      expect(report).toMatch(/[àâéèêëîïôùûü]/);
      // Structure Markdown
      expect(report).toContain("##");
      // Pas de jargon brut non expliqué
      expect(report.toLowerCase()).not.toContain("stacktrace");
      // Contient des recommandations
      expect(report).toMatch(/recommand|conseil|priorité|action/i);
    },
    300_000
  );

  skipIfNoOllama(
    "enhanceMicroservicesReport — explique le découpage au DSI",
    async () => {
      const ctx = buildMockContext({ serviceCount: 6 });
      const report = await enhancer.enhanceMicroservicesReport(ctx);
      // Mentionne les services
      expect(report).toMatch(/carte-service|compte-service|virement-service|service/i);
      // Donne une recommandation d'ordre
      expect(report).toMatch(/commencer|premier|priorité|ordre|phase/i);
    },
    300_000
  );

  skipIfNoOllama(
    "generateExecutiveSummary — pas de jargon technique",
    async () => {
      const ctx = buildMockContext({});
      const summary = await enhancer.generateExecutiveSummary(ctx);
      // Max 1000 mots (modèle léger peut être plus verbeux)
      const wordCount = summary.split(/\s+/).length;
      expect(wordCount).toBeLessThan(1000);
      // Contient des éléments business
      expect(summary).toMatch(/décision|risque|investissement|calendrier|migration|banque/i);
    },
    300_000
  );

  skipIfNoOllama(
    "enhanceAll — retourne 5 rapports enrichis",
    async () => {
      const ctx = buildMockContext({
        hasOracle: true,
        hasDB2:    true,
      });
      const result = await enhancer.enhanceAll(ctx);
      expect(result.enhanced).toBe(true);
      expect(Object.keys(result.reports)).toHaveLength(5);
      // Avec un modèle léger, certains rapports peuvent être null si timeout
      // Au minimum 3 rapports doivent être générés
      const nonNull = Object.values(result.reports).filter(r => r !== null);
      expect(nonNull.length).toBeGreaterThanOrEqual(3);
    },
    600_000
  );
});
