/**
 * report-gen.ts — Générateurs de rapports intégrés au projet API Spring Boot.
 *
 * Produit 3 rapports inclus dans le ZIP de sortie :
 *   - BIAN_MAPPING.md       : Mapping des use cases vers les domaines BIAN
 *   - ARCHITECTURE.md       : Architecture cible Spring Boot (composants, couches, flux)
 *   - MIGRATION_SUMMARY.md  : Résumé global de la migration (ce qui a été fait, métriques)
 *
 * @author Compleo
 */

import type { ProjectIR, UseCaseIR, BianMapping } from "../java-parser";
import type { GeneratedFile, GenerationStats } from "./shared";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. BIAN_MAPPING.md — Mapping des use cases vers les domaines BIAN
// ═══════════════════════════════════════════════════════════════════════════════

export function generateBianMappingReport(ir: ProjectIR): GeneratedFile {
  const lines: string[] = [];
  const date = new Date().toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  lines.push(`# Mapping BIAN — ${ir.artifactId || "Projet"}`);
  lines.push("");
  lines.push(`> Généré le ${date} par Compleo`);
  lines.push("");

  // ── Section 1: Vue d'ensemble ──
  lines.push("## 1. Vue d'ensemble");
  lines.push("");

  const bianMappings = ir.bianMapping || [];
  const useCases = ir.useCases || [];
  const bianUseCases = useCases.filter(
    (uc) => uc.bianDomain && uc.bianDomain.trim() !== ""
  );
  const nonBianUseCases = useCases.filter(
    (uc) => !uc.bianDomain || uc.bianDomain.trim() === ""
  );
  const bianDomains = new Set(bianUseCases.map((uc) => uc.bianDomain));
  const bianActions = new Set(
    bianUseCases.filter((uc) => uc.bianAction).map((uc) => uc.bianAction)
  );

  lines.push(
    `Ce projet contient **${useCases.length} use cases** dont **${bianUseCases.length}** sont mappés vers des domaines BIAN.`
  );
  lines.push("");
  lines.push(`| Métrique | Valeur |`);
  lines.push(`|----------|--------|`);
  lines.push(`| Use cases totaux | ${useCases.length} |`);
  lines.push(`| Use cases mappés BIAN | ${bianUseCases.length} |`);
  lines.push(`| Use cases non mappés | ${nonBianUseCases.length} |`);
  lines.push(`| Domaines BIAN distincts | ${bianDomains.size} |`);
  lines.push(`| Actions BIAN distinctes | ${bianActions.size} |`);
  lines.push(
    `| Couverture BIAN | ${useCases.length > 0 ? Math.round((bianUseCases.length / useCases.length) * 100) : 0}% |`
  );
  lines.push("");

  // ── Section 2: Mapping détaillé par domaine BIAN ──
  lines.push("## 2. Mapping détaillé par domaine BIAN");
  lines.push("");

  if (bianUseCases.length === 0 && bianMappings.length === 0) {
    lines.push(
      "> Le mapping BIAN automatique via LLM n'a pas pu mapper ces use cases. Vérifiez les noms de classes et domaines métier."
    );
    lines.push("");
    lines.push(
      "Le mapping BIAN est désormais automatique via LLM. Si certains use cases ne sont pas mappés, vous pouvez forcer le mapping via un fichier `bian.yml`."
    );
    lines.push("");
    lines.push("Exemple de fichier `bian.yml` :");
    lines.push("```yaml");
    lines.push("ActivationCarteUC:");
    lines.push('  service_domain: "Card Administration"');
    lines.push('  sd_code: "SD-CA"');
    lines.push('  action: "Initiate"');
    lines.push("```");
    lines.push("");
  } else {
    // Grouper par domaine BIAN
    const domainGroups = new Map<string, UseCaseIR[]>();
    for (const uc of bianUseCases) {
      const domain = uc.bianDomain;
      if (!domainGroups.has(domain)) domainGroups.set(domain, []);
      domainGroups.get(domain)!.push(uc);
    }

    for (const [domain, useCases] of Array.from(domainGroups.entries()).sort()) {
      lines.push(`### ${domain}`);
      lines.push("");
      lines.push(
        `| Use Case | Action BIAN | Méthode HTTP | Endpoint REST | Domaine métier |`
      );
      lines.push(
        `|----------|-------------|--------------|---------------|----------------|`
      );
      for (const uc of useCases) {
        lines.push(
          `| ${uc.className} | ${uc.bianAction || "—"} | ${uc.httpMethod || "POST"} | ${uc.restPath || "—"} | ${uc.domain || "—"} |`
        );
      }
      lines.push("");
    }
  }

  // ── Section 3: Mapping depuis bian.yml ──
  if (bianMappings.length > 0) {
    lines.push("## 3. Mapping BIAN (auto-détecté par LLM + bian.yml)");
    lines.push("");
    lines.push(
      `| Use Case | Service Domain | Code SD | Action |`
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
  if (nonBianUseCases.length > 0) {
    lines.push(
      `## ${bianMappings.length > 0 ? "4" : "3"}. Use cases non mappés BIAN`
    );
    lines.push("");
    lines.push(
      "Ces use cases n'ont pas de mapping BIAN. Ils peuvent être mappés manuellement via `bian.yml` ou des commentaires Javadoc."
    );
    lines.push("");
    lines.push(`| Use Case | Domaine métier | Description |`);
    lines.push(`|----------|----------------|-------------|`);
    for (const uc of nonBianUseCases) {
      const desc =
        uc.useCaseDescription ||
        uc.javadoc?.slice(0, 80) ||
        "—";
      lines.push(
        `| ${uc.className} | ${uc.domain || "—"} | ${desc} |`
      );
    }
    lines.push("");
  }

  // ── Section 5: Recommandations ──
  const sectionNum = bianMappings.length > 0 ? 5 : 4;
  lines.push(`## ${sectionNum}. Recommandations`);
  lines.push("");
  if (bianUseCases.length === 0) {
    lines.push(
      "- Définir un fichier `bian.yml` pour mapper chaque use case vers un domaine BIAN"
    );
    lines.push(
      "- Utiliser les commentaires Javadoc `/** BIAN: ServiceDomain(Action) */` dans le code source"
    );
  } else {
    const coverage = Math.round(
      (bianUseCases.length / useCases.length) * 100
    );
    if (coverage < 50) {
      lines.push(
        `- La couverture BIAN est de ${coverage}% — il est recommandé de mapper les ${nonBianUseCases.length} use cases restants`
      );
    } else if (coverage < 100) {
      lines.push(
        `- La couverture BIAN est de ${coverage}% — ${nonBianUseCases.length} use cases restent à mapper`
      );
    } else {
      lines.push(
        "- Couverture BIAN complète (100%) — tous les use cases sont mappés"
      );
    }
  }
  lines.push(
    "- Valider les mappings avec l'équipe architecture pour confirmer les domaines BIAN"
  );
  lines.push(
    "- Utiliser les codes SD (Service Domain) pour aligner les microservices avec la taxonomie BIAN"
  );
  lines.push("");

  return {
    path: "BIAN_MAPPING.md",
    content: lines.join("\n"),
    category: "report",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. ARCHITECTURE.md — Architecture cible Spring Boot
// ═══════════════════════════════════════════════════════════════════════════════

export function generateArchitectureReport(ir: ProjectIR): GeneratedFile {
  const lines: string[] = [];
  const date = new Date().toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  lines.push(`# Architecture Cible — ${ir.artifactId || "Projet"}`);
  lines.push("");
  lines.push(`> Généré le ${date} par Compleo`);
  lines.push("");

  // ── Section 1: Vue d'ensemble ──
  lines.push("## 1. Vue d'ensemble de l'architecture");
  lines.push("");
  lines.push(
    "L'architecture cible suit le pattern **Hexagonal Architecture** (Ports & Adapters) avec Spring Boot 3.x."
  );
  lines.push("");
  lines.push("```");
  lines.push("┌─────────────────────────────────────────────────────────┐");
  lines.push("│                    API Gateway / Ingress                │");
  lines.push("├─────────────────────────────────────────────────────────┤");
  lines.push("│                                                         │");
  lines.push("│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │");
  lines.push("│  │  Controller  │  │  Controller  │  │  Controller  │  │");
  lines.push("│  │  (REST API)  │  │  (REST API)  │  │  (REST API)  │  │");
  lines.push("│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │");
  lines.push("│         │                 │                 │          │");
  lines.push("│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐  │");
  lines.push("│  │   Service    │  │   Service    │  │   Service    │  │");
  lines.push("│  │  (Business)  │  │  (Business)  │  │  (Business)  │  │");
  lines.push("│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │");
  lines.push("│         │                 │                 │          │");
  lines.push("│  ┌──────▼───────────────────────────────────▼───────┐  │");
  lines.push("│  │              Repository / DAO Layer              │  │");
  lines.push("│  └──────────────────────┬──────────────────────────┘  │");
  lines.push("│                         │                             │");
  lines.push("│  ┌──────────────────────▼──────────────────────────┐  │");
  lines.push("│  │              Database (JPA / Spring Data)       │  │");
  lines.push("│  └────────────────────────────────────────────────┘  │");
  lines.push("└─────────────────────────────────────────────────────────┘");
  lines.push("```");
  lines.push("");

  // ── Section 2: Stack technique ──
  lines.push("## 2. Stack technique");
  lines.push("");
  lines.push("| Couche | Technologie | Rôle |");
  lines.push("|--------|-------------|------|");
  lines.push("| Framework | Spring Boot 3.x | Framework applicatif |");
  lines.push("| API REST | Spring Web MVC | Exposition des endpoints REST |");
  lines.push("| Sécurité | Spring Security | Authentification et autorisation |");
  lines.push("| Persistance | Spring Data JPA | Accès aux données |");
  lines.push("| Validation | Jakarta Validation | Validation des DTOs |");
  lines.push("| Documentation | SpringDoc OpenAPI | Documentation API Swagger |");
  lines.push("| Tests | JUnit 5 + Mockito | Tests unitaires et d'intégration |");
  lines.push("| Build | Maven 3.9+ | Gestion des dépendances et build |");
  lines.push("| Conteneurisation | Docker | Image de déploiement |");
  lines.push("| Orchestration | Kubernetes | Déploiement cloud-native |");
  lines.push("");

  // ── Section 3: Couches applicatives ──
  lines.push("## 3. Couches applicatives");
  lines.push("");

  // Controllers
  const ucList = ir.useCases || [];
  const domains = [...new Set(ucList.map((uc) => uc.domain || "general"))];
  lines.push("### 3.1 Couche Controller (REST API)");
  lines.push("");
  lines.push(
    `**${domains.length} contrôleurs REST** générés, un par domaine métier :`
  );
  lines.push("");
  lines.push("| Contrôleur | Domaine | Endpoints | Base Path |");
  lines.push("|------------|---------|-----------|-----------|" );
  for (const domain of domains.sort()) {
    const ucs = ucList.filter(
      (uc) => (uc.domain || "general") === domain
    );
    const basePath = `/api/${domain.toLowerCase().replace(/\s+/g, "-")}`;
    lines.push(
      `| ${toPascalCase(domain)}Controller | ${domain} | ${ucs.length} | ${basePath} |`
    );
  }
  lines.push("");

  // Services
  lines.push("### 3.2 Couche Service (Logique métier)");
  lines.push("");
  lines.push(
    `**${ucList.length} services** migrés depuis les EJB/Use Cases legacy :`
  );
  lines.push("");
  lines.push("| Service | Méthode HTTP | Transactionnel | Services injectés |");
  lines.push("|---------|-------------|----------------|-------------------|");
  for (const uc of ucList.slice(0, 30)) {
    const txn = uc.transactional
      ? `Oui (${uc.transactional.propagation || "REQUIRED"})`
      : "Non";
    const injected =
      uc.injectedServices.length > 0
        ? uc.injectedServices.map((s) => s.type).join(", ")
        : "—";
    lines.push(
      `| ${uc.className} | ${uc.httpMethod || "POST"} | ${txn} | ${injected} |`
    );
  }
  if (ucList.length > 30) {
    lines.push(
      `| ... | ... | ... | ... |`
    );
    lines.push("");
    lines.push(
      `> ${ucList.length - 30} services supplémentaires non listés pour la lisibilité.`
    );
  }
  lines.push("");

  // DTOs
  lines.push("### 3.3 Couche DTO (Transfert de données)");
  lines.push("");
  const dtoList = ir.dtos || [];
  lines.push(
    `**${dtoList.length} DTOs** migrés depuis les ValueObjects legacy :`
  );
  lines.push("");
  lines.push("| DTO | Direction | Champs | Validations |");
  lines.push("|-----|-----------|--------|-------------|" );
  for (const dto of dtoList.slice(0, 20)) {
    const validatedFields = dto.fields.filter(
      (f) => f.validationAnnotations.length > 0
    ).length;
    lines.push(
      `| ${dto.className} | ${dto.direction} | ${dto.fields.length} | ${validatedFields} |`
    );
  }
  if (dtoList.length > 20) {
    lines.push(`| ... | ... | ... | ... |`);
    lines.push("");
    lines.push(
      `> ${dtoList.length - 20} DTOs supplémentaires non listés.`
    );
  }
  lines.push("");

  // ── Section 4: Dépendances inter-services ──
  lines.push("## 4. Dépendances inter-services");
  lines.push("");
  const serviceGraph: { from: string; to: string }[] = [];
  for (const uc of ucList) {
    for (const svc of uc.injectedServices) {
      serviceGraph.push({ from: uc.className, to: svc.type });
    }
  }
  if (serviceGraph.length > 0) {
    lines.push(
      `**${serviceGraph.length} dépendances** détectées entre services :`
    );
    lines.push("");
    lines.push("| Service source | Service cible |");
    lines.push("|----------------|---------------|");
    const uniqueDeps = new Set(
      serviceGraph.map((d) => `${d.from}|${d.to}`)
    );
    for (const dep of Array.from(uniqueDeps).slice(0, 30)) {
      const [from, to] = dep.split("|");
      lines.push(`| ${from} | ${to} |`);
    }
    if (uniqueDeps.size > 30) {
      lines.push(`| ... | ... |`);
    }
    lines.push("");
  } else {
    lines.push(
      "> Aucune dépendance inter-services détectée (services indépendants)."
    );
    lines.push("");
  }

  // ── Section 5: Configuration et déploiement ──
  lines.push("## 5. Configuration et déploiement");
  lines.push("");
  lines.push("### 5.1 Fichiers de configuration générés");
  lines.push("");
  lines.push("| Fichier | Rôle |");
  lines.push("|---------|------|");
  lines.push("| `application.yml` | Configuration Spring Boot (datasource, JPA, logging) |");
  lines.push("| `application.properties` | Propriétés complémentaires |");
  lines.push("| `pom.xml` | Dépendances Maven |");
  lines.push("| `Dockerfile` | Image Docker multi-stage |");
  lines.push("| `docker-compose.yml` | Stack locale (app + DB) |");
  lines.push("| `k8s/deployment.yaml` | Déploiement Kubernetes |");
  lines.push("| `k8s/service.yaml` | Service Kubernetes |");
  lines.push("");

  lines.push("### 5.2 Profils Spring");
  lines.push("");
  lines.push("| Profil | Usage |");
  lines.push("|--------|-------|");
  lines.push("| `default` | Développement local |");
  lines.push("| `test` | Tests d'intégration (H2 in-memory) |");
  lines.push("| `prod` | Production (datasource externe) |");
  lines.push("");

  // ── Section 6: Sécurité ──
  lines.push("## 6. Sécurité");
  lines.push("");
  lines.push("- Authentification par **JWT** (Spring Security)");
  lines.push("- Validation des entrées via **Jakarta Validation** (`@Valid`, `@NotNull`, `@Size`)");
  lines.push("- Protection CSRF désactivée pour les API REST stateless");
  lines.push("- CORS configuré dans `application.yml`");
  lines.push("- Gestion centralisée des exceptions via `@ControllerAdvice`");
  lines.push("");

  return {
    path: "ARCHITECTURE.md",
    content: lines.join("\n"),
    category: "report",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. MIGRATION_SUMMARY.md — Résumé global de la migration
// ═══════════════════════════════════════════════════════════════════════════════

export function generateMigrationSummaryReport(
  ir: ProjectIR,
  stats: GenerationStats,
  warnings: string[],
  qualityGrade?: string,
  qualityScore?: number,
  qualityMax?: number
): GeneratedFile {
  const lines: string[] = [];
  const date = new Date().toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  lines.push(`# Résumé de Migration — ${ir.artifactId || "Projet"}`);
  lines.push("");
  lines.push(`> Généré le ${date} par Compleo`);
  lines.push("");

  // ── Section 1: Synthèse exécutive ──
  lines.push("## 1. Synthèse exécutive");
  lines.push("");
  const ucListS = ir.useCases || [];
  const dtoListS = ir.dtos || [];
  const serviceListS = ir.services || [];
  const enumListS = ir.enums || [];
  const exceptionListS = ir.exceptions || [];
  const validatorListS = ir.validators || [];
  const remoteListS = ir.remoteInterfaces || [];
  const ejb2xListS = ir.ejb2xBeans || [];
  const batchListS = ir.batchJobs || [];
  const bianMappingsS = ir.bianMapping || [];

  lines.push(
    `Le projet **${ir.artifactId || "legacy"}** a été migré depuis une architecture **Java EE / EJB** vers **Spring Boot 3.x**. ` +
    `La migration a produit **${stats.totalFiles} fichiers** pour un total de **${stats.totalLinesGenerated.toLocaleString("fr-FR")} lignes** de code généré.`
  );
  lines.push("");
  if (qualityGrade) {
    lines.push(
      `**Score de qualité : ${qualityScore || 0}/${qualityMax || 100} (${qualityGrade})**`
    );
    lines.push("");
  }

  // ── Section 2: Ce qui a été migré ──
  lines.push("## 2. Ce qui a été migré");
  lines.push("");
  lines.push("### 2.1 Composants migrés");
  lines.push("");
  lines.push("| Composant legacy | Composant Spring Boot | Quantité |");
  lines.push("|------------------|-----------------------|----------|");
  lines.push(
    `| EJB Stateless / Use Cases | @Service + @RestController | ${ucListS.length} |`
  );
  lines.push(
    `| ValueObjects (VoIn/VoOut) | Request/Response DTOs | ${dtoListS.length} |`
  );
  lines.push(
    `| Services métier | @Service (Spring) | ${serviceListS.length} |`
  );
  lines.push(
    `| Enums | Enums Java (inchangés) | ${enumListS.length} |`
  );
  lines.push(
    `| Exceptions métier | @ResponseStatus Exceptions | ${exceptionListS.length} |`
  );
  lines.push(
    `| Validators | @Component Validators | ${validatorListS.length} |`
  );
  lines.push(
    `| Remote Interfaces | (supprimées — REST API) | ${remoteListS.length} |`
  );
  if (ejb2xListS.length > 0) {
    lines.push(
      `| EJB 2.x Beans (Session/Entity/MDB) | @Service / @Entity / @JmsListener | ${ejb2xListS.length} |`
    );
  }
  if (batchListS.length > 0) {
    lines.push(
      `| Batch Jobs (JSR-352) | Spring Batch (Job/Step/Reader/Writer) | ${batchListS.length} |`
    );
  }
  lines.push("");

  // ── Section 2.2: Transformations appliquées ──
  lines.push("### 2.2 Transformations appliquées");
  lines.push("");
  lines.push("| Transformation | Description |");
  lines.push("|----------------|-------------|");
  lines.push("| EJB → Spring | `@Stateless` → `@Service`, injection JNDI → `@Autowired` |");
  lines.push("| Transactions | `@TransactionAttribute` → `@Transactional` (Spring) |");
  lines.push("| REST API | Création de `@RestController` avec endpoints REST |");
  lines.push("| DTOs | ValueObjects XML → DTOs avec Jakarta Validation |");
  lines.push("| Exceptions | Exceptions custom → `@ResponseStatus` + `@ControllerAdvice` |");
  lines.push("| Tests | Génération de tests unitaires JUnit 5 + Mockito |");
  lines.push("| Configuration | `ejb-jar.xml` → `application.yml` |");
  lines.push("| Build | Ant/propriétaire → Maven (`pom.xml`) |");
  lines.push("| Conteneurisation | — → Dockerfile multi-stage + docker-compose |");
  lines.push("| Orchestration | — → Kubernetes (deployment + service) |");
  lines.push("");

  // ── Section 3: Fichiers générés ──
  lines.push("## 3. Fichiers générés");
  lines.push("");
  lines.push("| Catégorie | Nombre |");
  lines.push("|-----------|--------|");
  lines.push(`| Controllers REST | ${stats.controllers} |`);
  lines.push(`| Services métier | ${stats.services} |`);
  lines.push(`| DTOs (Request/Response) | ${stats.dtos} |`);
  lines.push(`| Tests unitaires | ${stats.tests} |`);
  lines.push(`| Enums | ${stats.enums} |`);
  lines.push(`| Exceptions | ${stats.exceptions} |`);
  lines.push(`| Validators | ${stats.validators} |`);
  lines.push(`| Fichiers de configuration | ${stats.configFiles} |`);
  lines.push(`| Fichiers cloud (Docker, K8s) | ${stats.cloudFiles} |`);
  lines.push(`| **Total** | **${stats.totalFiles}** |`);
  lines.push("");
  lines.push(`**Total lignes générées : ${stats.totalLinesGenerated.toLocaleString("fr-FR")}**`);
  lines.push("");

  // ── Section 4: Domaines métier ──
  lines.push("## 4. Domaines métier identifiés");
  lines.push("");
  const domainMap = new Map<string, UseCaseIR[]>();
  for (const uc of ucListS) {
    const d = uc.domain || "general";
    if (!domainMap.has(d)) domainMap.set(d, []);
    domainMap.get(d)!.push(uc);
  }
  lines.push("| Domaine | Use Cases | Endpoints REST |");
  lines.push("|---------|-----------|----------------|");
  for (const [domain, ucs] of Array.from(domainMap.entries()).sort()) {
    lines.push(`| ${domain} | ${ucs.length} | ${ucs.length} |`);
  }
  lines.push("");

  // ── Section 5: Standard métier (BIAN, ACORD, HL7/FHIR, TMForum, DDD, TOGAF) ──
  const stdName = ir.industryStandard || "BIAN";
  const stdFileNames: Record<string, string> = {
    BIAN: "BIAN_MAPPING.md", ACORD: "ACORD_MAPPING.md", HL7_FHIR: "HL7_FHIR_MAPPING.md",
    TMFORUM: "TMFORUM_MAPPING.md", DDD: "DDD_MAPPING.md", TOGAF: "TOGAF_MAPPING.md",
  };
  const stdFileName = stdFileNames[stdName] || "BIAN_MAPPING.md";
  const bianUseCasesS = ucListS.filter(
    (uc) => uc.bianDomain && uc.bianDomain.trim() !== ""
  );
  if (bianUseCasesS.length > 0 || bianMappingsS.length > 0) {
    lines.push(`## 5. Conformité ${stdName}`);
    lines.push("");
    const coverage = ucListS.length > 0
      ? Math.round((bianUseCasesS.length / ucListS.length) * 100)
      : 0;
    lines.push(
      `**${bianUseCasesS.length}/${ucListS.length}** use cases mappés vers des domaines ${stdName} (couverture : ${coverage}%).`
    );
    lines.push("");
    lines.push(
      `> Voir le rapport détaillé dans **${stdFileName}**.`
    );
    lines.push("");
  }

  // ── Section 6: Avertissements ──
  if (warnings.length > 0) {
    const sectionNum = bianUseCasesS.length > 0 || bianMappingsS.length > 0 ? 6 : 5;
    lines.push(`## ${sectionNum}. Avertissements`);
    lines.push("");
    lines.push(
      `**${warnings.length} avertissements** ont été émis pendant la migration :`
    );
    lines.push("");
    for (const w of warnings.slice(0, 20)) {
      lines.push(`- ${w}`);
    }
    if (warnings.length > 20) {
      lines.push(
        `- ... et ${warnings.length - 20} avertissements supplémentaires`
      );
    }
    lines.push("");
  }

  // ── Section 7: Rapports disponibles ──
  const lastSection =
    (bianUseCasesS.length > 0 || bianMappingsS.length > 0 ? 6 : 5) +
    (warnings.length > 0 ? 1 : 0);
  lines.push(`## ${lastSection}. Rapports disponibles`);
  lines.push("");
  lines.push("| Rapport | Description |");
  lines.push("|---------|-------------|");
  lines.push("| `MIGRATION_SUMMARY.md` | Ce document — résumé global de la migration |");
  lines.push("| `MIGRATION_REPORT.md` | Rapport détaillé de migration (mapping fichier par fichier) |");
  lines.push("| `ARCHITECTURE.md` | Architecture cible Spring Boot (composants, couches, flux) |");
  lines.push(`| \`${stdFileName}\` | Mapping des use cases vers les domaines ${stdName} |`);
  lines.push("| `DATASOURCE_MIGRATION.md` | Guide de migration des datasources |");
  lines.push("| `QUALITY_SCORE.md` | Score de qualité du code généré |");
  lines.push("| `MICROSERVICES_REPORT.md` | Rapport de découpage en microservices (si applicable) |");
  lines.push("| `EXECUTIVE_SUMMARY.md` | Synthèse exécutive (si enrichissement IA activé) |");
  lines.push("");

  // ── Section 8: Actions manuelles recommandées ──
  lines.push(`## ${lastSection + 1}. Actions manuelles recommandées`);
  lines.push("");
  lines.push(
    "1. **Configurer la datasource** : adapter `application.yml` avec les credentials de votre base de données"
  );
  lines.push(
    "2. **Valider les DTOs** : vérifier que les champs et validations correspondent au contrat d'interface"
  );
  lines.push(
    "3. **Compléter les tests** : ajouter des tests d'intégration et des tests fonctionnels"
  );
  lines.push(
    "4. **Configurer la sécurité** : adapter Spring Security selon vos besoins (JWT, OAuth2, LDAP)"
  );
  lines.push(
    "5. **Revue de code** : effectuer une revue de code complète avant la mise en production"
  );
  lines.push(
    "6. **Tests de charge** : valider les performances sous charge avant le déploiement"
  );
  lines.push("");

  return {
    path: "MIGRATION_SUMMARY.md",
    content: lines.join("\n"),
    category: "report",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utilitaires
// ═══════════════════════════════════════════════════════════════════════════════

function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^./, (c) => c.toUpperCase());
}
