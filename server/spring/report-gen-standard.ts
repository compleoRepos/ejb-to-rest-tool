/**
 * report-gen-standard.ts — Générateur de rapport de mapping standard métier.
 * Supporte BIAN, ACORD, HL7/FHIR, TMForum, DDD, TOGAF.
 * Adapte la terminologie et le format au standard choisi.
 *
 * @author Compleo v10.12
 */
import type { ProjectIR, UseCaseIR, BianMapping } from "../java-parser";
import type { GeneratedFile } from "./shared";

// ─── Terminologie par standard ───────────────────────────────────────────────

interface StandardTerminology {
  fullName: string;
  shortName: string;
  domainLabel: string;        // "Service Domain" pour BIAN, "Data Model" pour ACORD, etc.
  actionLabel: string;        // "Action BIAN" pour BIAN, "Transaction" pour ACORD, etc.
  codeLabel: string;          // "Code SD" pour BIAN, "Code Modèle" pour ACORD, etc.
  description: string;        // Description du standard
  version: string;            // Version du standard
  fileName: string;           // Nom du fichier de rapport
  recommendations: string[];  // Recommandations spécifiques
}

const STANDARD_TERMINOLOGY: Record<string, StandardTerminology> = {
  BIAN: {
    fullName: "Banking Industry Architecture Network",
    shortName: "BIAN",
    domainLabel: "Service Domain",
    actionLabel: "Action BIAN",
    codeLabel: "Code SD",
    description: "Référentiel d'architecture bancaire BIAN v13 — taxonomie des domaines de services bancaires.",
    version: "v13",
    fileName: "BIAN_MAPPING.md",
    recommendations: [
      "Valider les mappings avec l'équipe architecture pour confirmer les domaines BIAN",
      "Utiliser les codes SD (Service Domain) pour aligner les microservices avec la taxonomie BIAN",
      "Consulter le portail BIAN (bian.org) pour les spécifications détaillées de chaque domaine",
      "Vérifier la conformité des APIs REST générées avec les patterns BIAN (Initiate, Execute, Evaluate, etc.)",
    ],
  },
  ACORD: {
    fullName: "Association for Cooperative Operations Research and Development",
    shortName: "ACORD",
    domainLabel: "Data Model",
    actionLabel: "Transaction ACORD",
    codeLabel: "Code Modèle",
    description: "Standard ACORD pour l'industrie de l'assurance — modèles de données et transactions normalisées.",
    version: "v3.x",
    fileName: "ACORD_MAPPING.md",
    recommendations: [
      "Valider les mappings avec l'équipe métier assurance pour confirmer les modèles ACORD",
      "Vérifier la conformité des messages XML/JSON avec les schémas ACORD",
      "Consulter le portail ACORD (acord.org) pour les spécifications des transactions",
      "Aligner les DTOs générés avec les structures de données ACORD standard",
    ],
  },
  HL7_FHIR: {
    fullName: "Health Level 7 / FHIR (Fast Healthcare Interoperability Resources)",
    shortName: "HL7/FHIR",
    domainLabel: "Ressource FHIR",
    actionLabel: "Interaction FHIR",
    codeLabel: "Code Ressource",
    description: "Standard HL7 FHIR R4 pour l'interopérabilité des systèmes de santé — ressources et interactions normalisées.",
    version: "R4",
    fileName: "HL7_FHIR_MAPPING.md",
    recommendations: [
      "Valider les mappings avec l'équipe métier santé pour confirmer les ressources FHIR",
      "Vérifier la conformité des APIs REST avec les interactions FHIR (read, search, create, update)",
      "Consulter le portail HL7 (hl7.org/fhir) pour les profils et extensions",
      "Implémenter les validations FHIR (StructureDefinition) pour chaque ressource",
    ],
  },
  TMFORUM: {
    fullName: "TM Forum / eTOM (enhanced Telecom Operations Map)",
    shortName: "TMForum",
    domainLabel: "Processus eTOM",
    actionLabel: "Opération TMF",
    codeLabel: "Code API TMF",
    description: "Référentiel TMForum/eTOM pour l'industrie télécom — processus métier et APIs Open API normalisées.",
    version: "v4.x",
    fileName: "TMFORUM_MAPPING.md",
    recommendations: [
      "Valider les mappings avec l'équipe architecture télécom pour confirmer les processus eTOM",
      "Vérifier la conformité des APIs REST avec les TMF Open APIs (TMF620, TMF637, etc.)",
      "Consulter le portail TMForum (tmforum.org) pour les spécifications Open API",
      "Aligner les microservices avec les domaines eTOM (Strategy, Infrastructure, Product, etc.)",
    ],
  },
  DDD: {
    fullName: "Domain-Driven Design",
    shortName: "DDD",
    domainLabel: "Bounded Context",
    actionLabel: "Commande/Requête",
    codeLabel: "Agrégat",
    description: "Approche Domain-Driven Design — structuration en bounded contexts, agrégats et événements domaine.",
    version: "—",
    fileName: "DDD_MAPPING.md",
    recommendations: [
      "Valider les bounded contexts avec l'équipe métier via des sessions Event Storming",
      "Identifier les agrégats racines et les invariants métier pour chaque contexte",
      "Définir les contrats d'interface (Anti-Corruption Layer) entre les bounded contexts",
      "Implémenter les événements domaine pour la communication inter-contextes",
    ],
  },
  TOGAF: {
    fullName: "The Open Group Architecture Framework",
    shortName: "TOGAF",
    domainLabel: "Building Block",
    actionLabel: "Capacité",
    codeLabel: "Code ABB",
    description: "Framework TOGAF pour l'architecture d'entreprise — building blocks et capacités métier.",
    version: "v10",
    fileName: "TOGAF_MAPPING.md",
    recommendations: [
      "Valider les mappings avec l'équipe architecture d'entreprise",
      "Aligner les building blocks avec le référentiel d'architecture existant",
      "Documenter les dépendances entre les Architecture Building Blocks (ABB)",
      "Intégrer les capacités identifiées dans le catalogue d'architecture TOGAF",
    ],
  },
};

// ─── Générateur de rapport multi-standards ───────────────────────────────────

export function generateStandardMappingReport(
  ir: ProjectIR,
  standardKey?: string,
): GeneratedFile {
  // Si pas de standard spécifié, utiliser BIAN par défaut (rétrocompatibilité)
  const key = standardKey || "BIAN";
  const terminology = STANDARD_TERMINOLOGY[key] || STANDARD_TERMINOLOGY.BIAN;

  const lines: string[] = [];
  const date = new Date().toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  lines.push(`# Mapping ${terminology.shortName} — ${ir.artifactId || "Projet"}`);
  lines.push("");
  lines.push(`> Généré le ${date} par Compleo — Standard : **${terminology.fullName}** (${terminology.version})`);
  lines.push("");
  lines.push(`> ${terminology.description}`);
  lines.push("");

  // ── Section 1: Vue d'ensemble ──
  lines.push("## 1. Vue d'ensemble");
  lines.push("");

  const useCases = ir.useCases || [];
  const mappedUseCases = useCases.filter(
    (uc) => uc.bianDomain && uc.bianDomain.trim() !== ""
  );
  const unmappedUseCases = useCases.filter(
    (uc) => !uc.bianDomain || uc.bianDomain.trim() === ""
  );
  const domains = new Set(mappedUseCases.map((uc) => uc.bianDomain));
  const actions = new Set(
    mappedUseCases.filter((uc) => uc.bianAction).map((uc) => uc.bianAction)
  );

  lines.push(
    `Ce projet contient **${useCases.length} use cases** dont **${mappedUseCases.length}** sont mappés vers des ${terminology.domainLabel}s ${terminology.shortName}.`
  );
  lines.push("");
  lines.push(`| Métrique | Valeur |`);
  lines.push(`|----------|--------|`);
  lines.push(`| Use cases totaux | ${useCases.length} |`);
  lines.push(`| Use cases mappés ${terminology.shortName} | ${mappedUseCases.length} |`);
  lines.push(`| Use cases non mappés | ${unmappedUseCases.length} |`);
  lines.push(`| ${terminology.domainLabel}s distincts | ${domains.size} |`);
  lines.push(`| ${terminology.actionLabel}s distinctes | ${actions.size} |`);
  lines.push(
    `| Couverture ${terminology.shortName} | ${useCases.length > 0 ? Math.round((mappedUseCases.length / useCases.length) * 100) : 0}% |`
  );
  lines.push("");

  // ── Section 2: Mapping détaillé ──
  lines.push(`## 2. Mapping détaillé par ${terminology.domainLabel}`);
  lines.push("");

  const bianMappings = ir.bianMapping || [];

  if (mappedUseCases.length === 0 && bianMappings.length === 0) {
    lines.push(
      `> Le mapping ${terminology.shortName} automatique via LLM n'a pas pu mapper ces use cases. Vérifiez les noms de classes et domaines métier.`
    );
    lines.push("");
  } else {
    // Grouper par domaine
    const domainGroups = new Map<string, UseCaseIR[]>();
    for (const uc of mappedUseCases) {
      const domain = uc.bianDomain;
      if (!domainGroups.has(domain)) domainGroups.set(domain, []);
      domainGroups.get(domain)!.push(uc);
    }

    for (const [domain, ucs] of Array.from(domainGroups.entries()).sort()) {
      lines.push(`### ${domain}`);
      lines.push("");
      lines.push(
        `| Use Case | ${terminology.actionLabel} | Méthode HTTP | Endpoint REST | Domaine métier |`
      );
      lines.push(
        `|----------|-------------|--------------|---------------|----------------|`
      );
      for (const uc of ucs) {
        lines.push(
          `| ${uc.className} | ${uc.bianAction || "—"} | ${uc.httpMethod || "POST"} | ${uc.restPath || "—"} | ${uc.domain || "—"} |`
        );
      }
      lines.push("");
    }
  }

  // ── Section 3: Table de mapping complète ──
  if (bianMappings.length > 0) {
    lines.push(`## 3. Table de mapping ${terminology.shortName} (auto-détecté par LLM)`);
    lines.push("");
    lines.push(
      `| Use Case | ${terminology.domainLabel} | ${terminology.codeLabel} | ${terminology.actionLabel} |`
    );
    lines.push(
      `|----------|----------------|---------|--------|`
    );
    for (const m of bianMappings) {
      lines.push(
        `| ${m.useCase} | ${m.serviceDomain} | ${m.sdCode} | ${m.action} |`
      );
    }
    lines.push("");
  }

  // ── Section 4: Use cases non mappés ──
  if (unmappedUseCases.length > 0) {
    const sNum = bianMappings.length > 0 ? 4 : 3;
    lines.push(`## ${sNum}. Use cases non mappés ${terminology.shortName}`);
    lines.push("");
    lines.push(
      `Ces use cases n'ont pas de mapping ${terminology.shortName}. Le LLM n'a pas pu les associer à un ${terminology.domainLabel} avec suffisamment de confiance.`
    );
    lines.push("");
    lines.push(`| Use Case | Domaine métier | Description |`);
    lines.push(`|----------|----------------|-------------|`);
    for (const uc of unmappedUseCases) {
      const desc = uc.useCaseDescription || uc.javadoc?.slice(0, 80) || "—";
      lines.push(`| ${uc.className} | ${uc.domain || "—"} | ${desc} |`);
    }
    lines.push("");
  }

  // ── Section 5: Recommandations ──
  const recSection = (bianMappings.length > 0 ? 4 : 3) + (unmappedUseCases.length > 0 ? 1 : 0);
  lines.push(`## ${recSection + 1}. Recommandations`);
  lines.push("");

  if (mappedUseCases.length === 0) {
    lines.push(
      `- Aucun use case n'a pu être mappé automatiquement vers ${terminology.shortName}. Vérifiez que le domaine métier correspond bien à ce standard.`
    );
  } else {
    const coverage = Math.round((mappedUseCases.length / useCases.length) * 100);
    if (coverage < 50) {
      lines.push(
        `- La couverture ${terminology.shortName} est de ${coverage}% — il est recommandé de mapper les ${unmappedUseCases.length} use cases restants`
      );
    } else if (coverage < 100) {
      lines.push(
        `- La couverture ${terminology.shortName} est de ${coverage}% — ${unmappedUseCases.length} use cases restent à mapper`
      );
    } else {
      lines.push(
        `- Couverture ${terminology.shortName} complète (100%) — tous les use cases sont mappés`
      );
    }
  }

  for (const rec of terminology.recommendations) {
    lines.push(`- ${rec}`);
  }
  lines.push("");

  return {
    path: terminology.fileName,
    content: lines.join("\n"),
    category: "report",
  };
}

/**
 * Retourne le nom du fichier de rapport pour un standard donné.
 */
export function getStandardReportFileName(standardKey: string): string {
  return STANDARD_TERMINOLOGY[standardKey]?.fileName || "BIAN_MAPPING.md";
}
