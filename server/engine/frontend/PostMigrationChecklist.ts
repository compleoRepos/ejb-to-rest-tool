/**
 * PostMigrationChecklist -- Generateur de checklist post-migration dynamique.
 *
 * Genere une checklist personnalisee basee sur :
 *   - Les technologies detectees dans le projet legacy
 *   - Le domaine metier identifie
 *   - Les options de generation choisies par l'utilisateur
 *   - Les fichiers generes (back + front)
 *
 * Chaque item de la checklist explique :
 *   - QUOI faire
 *   - POURQUOI c'est necessaire
 *   - COMMENT le faire (guidance concrete)
 *   - Les fichiers concernes
 *
 * La checklist est incluse dans le ZIP genere (POST_MIGRATION_CHECKLIST.md)
 * et affichee dans l'ecran post-migration de l'application.
 *
 * @version v10.8
 * @author Compleo
 */

import type { TechnologyType } from "../registry/types";
import type { DetectedDomain, IndustryStandard } from "./DynamicOptionsResolver";
import type { FrontendTodo } from "./FrontendGenerator";

// --- Types ---

export type ChecklistCategory =
  | "compilation"
  | "configuration"
  | "security"
  | "testing"
  | "integration"
  | "business_logic"
  | "performance"
  | "deployment"
  | "monitoring"
  | "documentation"
  | "frontend"
  | "data_migration";

export type ChecklistPriority = "critical" | "high" | "medium" | "low";

export interface ChecklistItem {
  id: string;
  category: ChecklistCategory;
  priority: ChecklistPriority;
  title: string;
  what: string;
  why: string;
  how: string;
  relatedFiles: string[];
  estimatedEffort: string;
  /** Whether this item is auto-verified by the tool */
  autoVerified: boolean;
  /** Tags for filtering */
  tags: string[];
}

export interface PostMigrationChecklistResult {
  items: ChecklistItem[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    autoVerified: number;
    estimatedTotalDays: number;
  };
  /** Markdown content for the ZIP file */
  markdownContent: string;
}

export interface ChecklistInput {
  projectName: string;
  technologiesDetected: TechnologyType[];
  detectedDomain: DetectedDomain;
  hasFrontend: boolean;
  frontendFramework?: "react" | "angular" | "vue";
  hasMicroservices: boolean;
  hasSaga: boolean;
  hasMessaging: boolean;
  messagingBroker?: "kafka" | "rabbitmq";
  hasBatch: boolean;
  hasSOAP: boolean;
  industryStandard?: IndustryStandard;
  generatedBackendFiles: number;
  generatedFrontendFiles: number;
  frontendTodos?: FrontendTodo[];
  compilationErrors: number;
}

// --- Main class ---

export class PostMigrationChecklist {

  generate(input: ChecklistInput): PostMigrationChecklistResult {
    const items: ChecklistItem[] = [];
    let itemCounter = 0;

    const nextId = () => `PMC-${String(++itemCounter).padStart(3, "0")}`;

    // =====================================================================
    // 1. COMPILATION — Always first
    // =====================================================================

    items.push({
      id: nextId(),
      category: "compilation",
      priority: "critical",
      title: "Verifier la compilation du backend Spring Boot",
      what: "Executer `mvn compile` ou `./gradlew compileJava` et corriger les erreurs restantes.",
      why: "Le CompilationLoop a corrige la majorite des erreurs, mais certains edge cases peuvent subsister (generics complexes, annotations custom).",
      how: "1. Ouvrir un terminal dans le dossier backend/\n2. Executer `mvn compile`\n3. Corriger les erreurs signalees (imports manquants, types incompatibles)\n4. Les fichiers les plus susceptibles d'avoir des erreurs sont les Services et les Repositories.",
      relatedFiles: ["backend/pom.xml", "backend/src/main/java/"],
      estimatedEffort: "0.5 jour",
      autoVerified: input.compilationErrors === 0,
      tags: ["backend", "compilation"],
    });

    if (input.hasFrontend) {
      items.push({
        id: nextId(),
        category: "compilation",
        priority: "critical",
        title: `Verifier la compilation du frontend ${input.frontendFramework || ""}`,
        what: "Executer `npm install && npm run build` et corriger les erreurs TypeScript.",
        why: "Le frontend genere doit compiler sans erreur pour etre deployable. Les types TypeScript doivent correspondre aux DTOs du backend.",
        how: `1. Ouvrir un terminal dans le dossier frontend/\n2. Executer \`npm install\`\n3. Executer \`npm run build\`\n4. Corriger les erreurs TypeScript (types manquants, imports incorrects)`,
        relatedFiles: ["frontend/package.json", "frontend/tsconfig.json", "frontend/src/"],
        estimatedEffort: "0.5 jour",
        autoVerified: false,
        tags: ["frontend", "compilation"],
      });
    }

    // =====================================================================
    // 2. CONFIGURATION — Environment setup
    // =====================================================================

    items.push({
      id: nextId(),
      category: "configuration",
      priority: "critical",
      title: "Configurer les variables d'environnement",
      what: "Creer le fichier application.yml (ou .properties) avec les vrais parametres de connexion (BDD, messaging, etc.).",
      why: "Le fichier genere contient des valeurs placeholder (localhost, password123). Les vrais parametres dependent de votre infrastructure.",
      how: "1. Copier application.yml en application-dev.yml et application-prod.yml\n2. Remplacer les valeurs placeholder par les vraies valeurs\n3. Ne JAMAIS committer les credentials en clair — utiliser des variables d'environnement ou un vault.",
      relatedFiles: ["backend/src/main/resources/application.yml"],
      estimatedEffort: "0.5 jour",
      autoVerified: false,
      tags: ["backend", "configuration", "security"],
    });

    if (input.hasFrontend) {
      items.push({
        id: nextId(),
        category: "configuration",
        priority: "high",
        title: "Configurer le proxy frontend/backend",
        what: "Ajuster l'URL du backend dans la configuration du frontend (proxy dev + URL production).",
        why: "En dev, le proxy Vite/Webpack redirige /api vers le backend. En production, l'URL doit pointer vers le backend deploye.",
        how: "1. Verifier vite.config.ts (ou proxy.conf.json pour Angular)\n2. Creer .env.production avec VITE_API_URL=https://votre-backend.com/api\n3. Configurer CORS dans le backend si front et back sont sur des domaines differents.",
        relatedFiles: ["frontend/vite.config.ts", "frontend/.env.production"],
        estimatedEffort: "0.25 jour",
        autoVerified: false,
        tags: ["frontend", "configuration"],
      });
    }

    // =====================================================================
    // 3. SECURITY — Authentication & Authorization
    // =====================================================================

    items.push({
      id: nextId(),
      category: "security",
      priority: "critical",
      title: "Implementer l'authentification",
      what: "Configurer Spring Security avec la strategie d'authentification choisie (JWT, OAuth2, SAML, Session).",
      why: "Le backend genere inclut un squelette Spring Security mais l'authentification n'est pas completement configuree.",
      how: "1. Choisir la strategie d'auth (JWT recommande pour les APIs REST)\n2. Configurer SecurityConfig.java avec les filtres d'authentification\n3. Implementer le endpoint /api/auth/login\n4. Tester avec Postman/curl.",
      relatedFiles: ["backend/src/main/java/**/config/SecurityConfig.java"],
      estimatedEffort: "1-2 jours",
      autoVerified: false,
      tags: ["backend", "security"],
    });

    items.push({
      id: nextId(),
      category: "security",
      priority: "high",
      title: "Valider les autorisations (RBAC)",
      what: "Verifier que les roles et permissions sont correctement mappes depuis le systeme legacy.",
      why: "Le legacy utilisait probablement un systeme de roles different. Les annotations @Secured/@PreAuthorize doivent etre validees.",
      how: "1. Lister les roles existants dans le systeme legacy\n2. Mapper vers les roles Spring Security\n3. Verifier chaque @PreAuthorize dans les controllers\n4. Tester chaque endpoint avec differents roles.",
      relatedFiles: ["backend/src/main/java/**/controller/"],
      estimatedEffort: "1 jour",
      autoVerified: false,
      tags: ["backend", "security"],
    });

    // =====================================================================
    // 4. BUSINESS LOGIC — Domain-specific validation
    // =====================================================================

    items.push({
      id: nextId(),
      category: "business_logic",
      priority: "critical",
      title: "Valider la logique metier transformee",
      what: "Comparer chaque service genere avec la logique metier du code legacy original.",
      why: "La transformation automatique preserve la structure mais peut manquer des subtilites metier (calculs specifiques, regles de gestion, validations).",
      how: "1. Pour chaque Service genere, ouvrir le fichier source legacy correspondant (reference dans le Javadoc)\n2. Comparer methode par methode\n3. Porter une attention particuliere aux calculs financiers, validations metier, et workflows\n4. Verifier les TODO generes dans chaque fichier.",
      relatedFiles: ["backend/src/main/java/**/service/"],
      estimatedEffort: "2-5 jours",
      autoVerified: false,
      tags: ["backend", "business_logic"],
    });

    // Domain-specific items
    if (input.detectedDomain.primary === "BIAN") {
      items.push({
        id: nextId(),
        category: "business_logic",
        priority: "high",
        title: "Valider le mapping BIAN des services bancaires",
        what: "Verifier que les services generes sont correctement alignes sur les Service Domains BIAN v12.",
        why: "Le mapping BIAN automatique est base sur l'analyse IA. Certains services peuvent necessiter un realignement.",
        how: "1. Consulter le rapport BIAN_MAPPING.md genere\n2. Verifier chaque Service Domain assigne\n3. Comparer avec la documentation BIAN officielle (bian.org)\n4. Ajuster les noms de services et les interfaces si necessaire.",
        relatedFiles: ["BIAN_MAPPING.md", "backend/src/main/java/**/service/"],
        estimatedEffort: "1-2 jours",
        autoVerified: false,
        tags: ["backend", "bian", "banking"],
      });
    }

    if (input.detectedDomain.primary === "ACORD") {
      items.push({
        id: nextId(),
        category: "business_logic",
        priority: "high",
        title: "Valider le mapping ACORD des services assurance",
        what: "Verifier l'alignement des services sur le standard ACORD pour l'assurance.",
        why: "Les workflows d'assurance (souscription, sinistres, primes) ont des regles metier strictes.",
        how: "1. Verifier les workflows de souscription et de sinistres\n2. Valider les calculs de primes\n3. S'assurer que les etats de police sont correctement geres.",
        relatedFiles: ["backend/src/main/java/**/service/"],
        estimatedEffort: "1-2 jours",
        autoVerified: false,
        tags: ["backend", "acord", "insurance"],
      });
    }

    // =====================================================================
    // 5. TESTING — Write tests
    // =====================================================================

    items.push({
      id: nextId(),
      category: "testing",
      priority: "high",
      title: "Ecrire les tests unitaires du backend",
      what: "Ecrire des tests JUnit 5 + Mockito pour chaque service et controller genere.",
      why: "Le code genere n'inclut pas de tests. Les tests sont essentiels pour valider la transformation et prevenir les regressions.",
      how: "1. Creer un test par service dans src/test/java/\n2. Mocker les repositories avec @MockBean\n3. Tester les cas nominaux ET les cas d'erreur\n4. Viser une couverture > 80% sur les services.",
      relatedFiles: ["backend/src/test/java/"],
      estimatedEffort: "3-5 jours",
      autoVerified: false,
      tags: ["backend", "testing"],
    });

    items.push({
      id: nextId(),
      category: "testing",
      priority: "high",
      title: "Ecrire les tests d'integration",
      what: "Ecrire des tests d'integration avec @SpringBootTest pour valider les endpoints REST.",
      why: "Les tests unitaires ne suffisent pas — il faut valider le flux complet (controller -> service -> repository -> DB).",
      how: "1. Utiliser @SpringBootTest avec TestRestTemplate\n2. Configurer une base H2 en memoire pour les tests\n3. Tester chaque endpoint CRUD\n4. Verifier les codes HTTP et les payloads de reponse.",
      relatedFiles: ["backend/src/test/java/"],
      estimatedEffort: "2-3 jours",
      autoVerified: false,
      tags: ["backend", "testing"],
    });

    if (input.hasFrontend) {
      items.push({
        id: nextId(),
        category: "testing",
        priority: "high",
        title: "Ecrire les tests frontend",
        what: `Ecrire des tests avec ${input.frontendFramework === "angular" ? "Jasmine/Karma" : "Vitest + React Testing Library"} pour les composants et services.`,
        why: "Les composants frontend generes doivent etre testes pour valider l'affichage et les interactions.",
        how: "1. Tester chaque service API avec des mocks (MSW)\n2. Tester les composants avec des snapshots\n3. Tester les formulaires (validation, soumission)\n4. Tester la navigation et le routing.",
        relatedFiles: ["frontend/src/"],
        estimatedEffort: "2-3 jours",
        autoVerified: false,
        tags: ["frontend", "testing"],
      });
    }

    // =====================================================================
    // 6. INTEGRATION — Connect the pieces
    // =====================================================================

    if (input.hasFrontend) {
      items.push({
        id: nextId(),
        category: "integration",
        priority: "critical",
        title: "Connecter le frontend au backend",
        what: "Remplacer les donnees mock dans les services frontend par les vrais appels API.",
        why: "Les services generes contiennent des TODO pour les appels API. Les donnees mock doivent etre remplacees.",
        how: "1. Pour chaque service dans frontend/src/services/\n2. Decommenter les appels API\n3. Verifier que les types TypeScript correspondent aux DTOs du backend\n4. Tester chaque flux CRUD end-to-end.",
        relatedFiles: ["frontend/src/services/", "frontend/src/pages/"],
        estimatedEffort: "1-2 jours",
        autoVerified: false,
        tags: ["frontend", "integration"],
      });
    }

    if (input.hasMessaging) {
      items.push({
        id: nextId(),
        category: "integration",
        priority: "high",
        title: "Configurer le broker de messaging (Kafka/RabbitMQ)",
        what: "Deployer et configurer le broker de messaging choisi, et connecter les producers/consumers generes.",
        why: "Le code JMS legacy a ete transforme en producers/consumers Spring Kafka ou RabbitMQ, mais le broker doit etre configure.",
        how: "1. Deployer le broker (Docker recommande pour le dev)\n2. Configurer les parametres de connexion dans application.yml\n3. Creer les topics/queues necessaires\n4. Tester l'envoi et la reception de messages.",
        relatedFiles: ["backend/src/main/java/**/messaging/", "docker-compose.yml"],
        estimatedEffort: "1 jour",
        autoVerified: false,
        tags: ["backend", "messaging"],
      });
    }

    if (input.hasSaga) {
      items.push({
        id: nextId(),
        category: "integration",
        priority: "high",
        title: "Valider les sagas et les compensations",
        what: "Tester chaque saga generee avec des scenarios de succes ET d'echec (compensation).",
        why: "Les sagas remplacent les transactions distribuees (2PC). Les compensations doivent etre validees pour garantir la coherence des donnees.",
        how: "1. Pour chaque saga, simuler un echec a chaque etape\n2. Verifier que la compensation annule correctement les etapes precedentes\n3. Tester les cas de timeout et de retry\n4. Documenter les scenarios de test.",
        relatedFiles: ["backend/src/main/java/**/saga/"],
        estimatedEffort: "2-3 jours",
        autoVerified: false,
        tags: ["backend", "saga", "testing"],
      });
    }

    if (input.hasSOAP) {
      items.push({
        id: nextId(),
        category: "integration",
        priority: "high",
        title: "Valider les adaptateurs SOAP vers REST",
        what: "Tester que les nouveaux endpoints REST retournent les memes donnees que les anciens services SOAP.",
        why: "La transformation SOAP -> REST peut perdre des informations (headers SOAP, attachments, WS-Security).",
        how: "1. Comparer les reponses REST avec les reponses SOAP originales\n2. Verifier les schemas de validation\n3. Tester les cas d'erreur SOAP (SoapFault -> HTTP error)\n4. Mettre a jour la documentation OpenAPI.",
        relatedFiles: ["backend/src/main/java/**/adapter/"],
        estimatedEffort: "1-2 jours",
        autoVerified: false,
        tags: ["backend", "soap", "rest"],
      });
    }

    // =====================================================================
    // 7. DATA MIGRATION
    // =====================================================================

    items.push({
      id: nextId(),
      category: "data_migration",
      priority: "critical",
      title: "Planifier et executer la migration des donnees",
      what: "Migrer les donnees de la base legacy vers le nouveau schema genere.",
      why: "Le nouveau schema (JPA entities) peut differer du schema legacy. Les donnees doivent etre migrees et validees.",
      how: "1. Comparer le schema legacy avec les entities JPA generees\n2. Ecrire des scripts de migration (Flyway ou Liquibase recommande)\n3. Tester la migration sur un environnement de staging\n4. Valider l'integrite des donnees apres migration.",
      relatedFiles: ["backend/src/main/java/**/entity/", "backend/src/main/resources/db/migration/"],
      estimatedEffort: "2-5 jours",
      autoVerified: false,
      tags: ["backend", "data", "database"],
    });

    // =====================================================================
    // 8. DEPLOYMENT
    // =====================================================================

    items.push({
      id: nextId(),
      category: "deployment",
      priority: "high",
      title: "Configurer le pipeline CI/CD",
      what: "Creer un pipeline CI/CD (GitHub Actions, GitLab CI, Jenkins) pour le build, les tests et le deploiement.",
      why: "Le deploiement manuel est risque et non reproductible. Un pipeline CI/CD automatise garantit la qualite.",
      how: "1. Creer .github/workflows/ci.yml (ou equivalent)\n2. Configurer les etapes : build -> test -> docker build -> deploy\n3. Ajouter les secrets (credentials BDD, registry Docker)\n4. Tester le pipeline sur une branche de dev.",
      relatedFiles: ["Dockerfile", "docker-compose.yml", ".github/workflows/"],
      estimatedEffort: "1-2 jours",
      autoVerified: false,
      tags: ["devops", "deployment"],
    });

    items.push({
      id: nextId(),
      category: "deployment",
      priority: "high",
      title: "Tester le deploiement Docker/Kubernetes",
      what: "Builder les images Docker et deployer sur Kubernetes avec les Helm charts generes.",
      why: "Les fichiers Docker et Helm sont generes mais doivent etre testes dans votre environnement specifique.",
      how: "1. Builder l'image Docker : `docker build -t ${input.projectName} .`\n2. Tester localement : `docker-compose up`\n3. Deployer sur K8s : `helm install ${input.projectName} ./helm/`\n4. Verifier les health checks et les logs.",
      relatedFiles: ["Dockerfile", "docker-compose.yml", "helm/"],
      estimatedEffort: "1 jour",
      autoVerified: false,
      tags: ["devops", "docker", "kubernetes"],
    });

    // =====================================================================
    // 9. MONITORING
    // =====================================================================

    items.push({
      id: nextId(),
      category: "monitoring",
      priority: "medium",
      title: "Configurer le monitoring et les alertes",
      what: "Mettre en place Prometheus/Grafana pour le monitoring et configurer les alertes.",
      why: "L'application modernisee doit etre monitoree en production pour detecter les problemes rapidement.",
      how: "1. Activer Spring Boot Actuator (deja inclus)\n2. Configurer Prometheus pour scraper les metriques\n3. Creer des dashboards Grafana\n4. Configurer des alertes (latence, erreurs, memoire).",
      relatedFiles: ["backend/src/main/resources/application.yml"],
      estimatedEffort: "1 jour",
      autoVerified: false,
      tags: ["devops", "monitoring"],
    });

    // =====================================================================
    // 10. DOCUMENTATION
    // =====================================================================

    items.push({
      id: nextId(),
      category: "documentation",
      priority: "medium",
      title: "Completer la documentation API (OpenAPI/Swagger)",
      what: "Enrichir les annotations OpenAPI sur les controllers pour generer une documentation API complete.",
      why: "La documentation API est essentielle pour les consommateurs de l'API (frontend, partenaires, equipes).",
      how: "1. Ajouter @Operation, @ApiResponse sur chaque endpoint\n2. Documenter les schemas avec @Schema sur les DTOs\n3. Acceder a Swagger UI : http://localhost:8080/swagger-ui.html\n4. Exporter le fichier OpenAPI pour les clients.",
      relatedFiles: ["backend/src/main/java/**/controller/"],
      estimatedEffort: "1 jour",
      autoVerified: false,
      tags: ["backend", "documentation"],
    });

    // =====================================================================
    // Build summary
    // =====================================================================

    const summary = {
      total: items.length,
      critical: items.filter(i => i.priority === "critical").length,
      high: items.filter(i => i.priority === "high").length,
      medium: items.filter(i => i.priority === "medium").length,
      low: items.filter(i => i.priority === "low").length,
      autoVerified: items.filter(i => i.autoVerified).length,
      estimatedTotalDays: this.estimateTotalDays(items),
    };

    const markdownContent = this.generateMarkdown(items, summary, input);

    return { items, summary, markdownContent };
  }

  // --- Markdown generation ---

  private generateMarkdown(
    items: ChecklistItem[],
    summary: PostMigrationChecklistResult["summary"],
    input: ChecklistInput,
  ): string {
    const lines: string[] = [];

    lines.push(`# Checklist Post-Migration : ${input.projectName}`);
    lines.push("");
    lines.push(`> Generee automatiquement par **EJB Client Modernizer v10.8**`);
    lines.push(`> Date : ${new Date().toISOString().split("T")[0]}`);
    lines.push("");

    // Summary
    lines.push("## Resume");
    lines.push("");
    lines.push(`| Metrique | Valeur |`);
    lines.push(`|----------|--------|`);
    lines.push(`| Total items | ${summary.total} |`);
    lines.push(`| Critiques | ${summary.critical} |`);
    lines.push(`| Hauts | ${summary.high} |`);
    lines.push(`| Moyens | ${summary.medium} |`);
    lines.push(`| Bas | ${summary.low} |`);
    lines.push(`| Auto-verifies | ${summary.autoVerified} |`);
    lines.push(`| Effort estime | ~${summary.estimatedTotalDays} jours |`);
    lines.push("");

    // Context
    lines.push("## Contexte de migration");
    lines.push("");
    lines.push(`- **Technologies legacy** : ${input.technologiesDetected.join(", ")}`);
    lines.push(`- **Domaine metier** : ${input.detectedDomain.label} (${input.detectedDomain.primary})`);
    lines.push(`- **Frontend genere** : ${input.hasFrontend ? `Oui (${input.frontendFramework})` : "Non"}`);
    lines.push(`- **Microservices** : ${input.hasMicroservices ? "Oui" : "Non"}`);
    lines.push(`- **Saga** : ${input.hasSaga ? "Oui" : "Non"}`);
    lines.push(`- **Fichiers backend** : ${input.generatedBackendFiles}`);
    lines.push(`- **Fichiers frontend** : ${input.generatedFrontendFiles}`);
    lines.push("");

    // Items by category
    const categories: ChecklistCategory[] = [
      "compilation", "configuration", "security", "business_logic",
      "testing", "integration", "data_migration", "deployment",
      "monitoring", "documentation", "frontend",
    ];

    const categoryLabels: Record<ChecklistCategory, string> = {
      compilation: "Compilation",
      configuration: "Configuration",
      security: "Securite",
      testing: "Tests",
      integration: "Integration",
      business_logic: "Logique Metier",
      performance: "Performance",
      deployment: "Deploiement",
      monitoring: "Monitoring",
      documentation: "Documentation",
      frontend: "Frontend",
      data_migration: "Migration de Donnees",
    };

    for (const cat of categories) {
      const catItems = items.filter(i => i.category === cat);
      if (catItems.length === 0) continue;

      lines.push(`## ${categoryLabels[cat]}`);
      lines.push("");

      for (const item of catItems) {
        const checkbox = item.autoVerified ? "[x]" : "[ ]";
        const priorityBadge = item.priority === "critical" ? "**CRITIQUE**" : item.priority === "high" ? "**HAUT**" : item.priority;

        lines.push(`### ${checkbox} ${item.id} — ${item.title} (${priorityBadge})`);
        lines.push("");
        lines.push(`**Quoi** : ${item.what}`);
        lines.push("");
        lines.push(`**Pourquoi** : ${item.why}`);
        lines.push("");
        lines.push(`**Comment** :`);
        lines.push(item.how);
        lines.push("");
        lines.push(`**Fichiers concernes** : \`${item.relatedFiles.join("`, `")}\``);
        lines.push("");
        lines.push(`**Effort estime** : ${item.estimatedEffort}`);
        lines.push("");
        lines.push("---");
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  // --- Effort estimation ---

  private estimateTotalDays(items: ChecklistItem[]): number {
    let total = 0;
    for (const item of items) {
      if (item.autoVerified) continue;
      const match = item.estimatedEffort.match(/(\d+(?:\.\d+)?)/);
      if (match) {
        total += parseFloat(match[1]);
      }
    }
    return Math.ceil(total);
  }
}
