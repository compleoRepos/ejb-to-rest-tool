/**
 * BusinessLogicValidator — Valide la préservation de la logique métier
 * après transformation Java EE → Spring Boot.
 *
 * Vérifie :
 *   1. Préservation des règles de gestion (invariants de domaine)
 *   2. Cohérence des transactions (@Transactional sur les opérations critiques)
 *   3. Patterns métier par secteur (banque, assurance, industrie, etc.)
 *   4. Intégrité des flux de données (DTO ↔ Entity mapping)
 *   5. Gestion des exceptions métier
 *
 * @version v10.8
 * @author Compleo
 */

import type { GeneratedFile } from "../registry/types";
import type { DetectedComponent } from "../registry/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BusinessValidationResult {
  valid: boolean;
  score: number; // 0-100
  issues: BusinessIssue[];
  warnings: BusinessWarning[];
  sectorChecks: SectorCheckResult[];
  summary: {
    rulesPreserved: number;
    rulesTotal: number;
    transactionalCoverage: number;
    exceptionHandlingScore: number;
    dtoEntityConsistency: number;
  };
}

export interface BusinessIssue {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: BusinessIssueCategory;
  file: string;
  line?: number;
  message: string;
  suggestion: string;
}

export type BusinessIssueCategory =
  | "MISSING_TRANSACTION"
  | "LOST_BUSINESS_RULE"
  | "INCOMPLETE_EXCEPTION_HANDLING"
  | "DTO_ENTITY_MISMATCH"
  | "MISSING_VALIDATION"
  | "SECTOR_PATTERN_VIOLATION"
  | "DATA_INTEGRITY_RISK"
  | "CONCURRENCY_RISK";

export interface BusinessWarning {
  category: string;
  file: string;
  message: string;
}

export interface SectorCheckResult {
  sector: string;
  checks: SectorCheck[];
  passed: number;
  total: number;
}

export interface SectorCheck {
  name: string;
  passed: boolean;
  details: string;
}

// ─── Sector Pattern Definitions ─────────────────────────────────────────────

interface SectorPattern {
  sector: string;
  keywords: string[];
  requiredPatterns: {
    name: string;
    description: string;
    /** Regex to check in service/controller files */
    check: RegExp;
    /** Category of the pattern */
    category: "validation" | "transaction" | "security" | "audit" | "calculation";
  }[];
}

const SECTOR_PATTERNS: SectorPattern[] = [
  {
    sector: "banking",
    keywords: ["account", "balance", "transfer", "transaction", "loan", "credit", "debit", "payment", "interest"],
    requiredPatterns: [
      {
        name: "Balance validation",
        description: "Vérification du solde avant opération de débit/transfert",
        check: /(?:balance|solde|amount|montant)\s*(?:>=?|<=?|>|<|!=)\s*|(?:insufficient|insuffisant|negative|négatif)/i,
        category: "validation",
      },
      {
        name: "Transaction atomicity",
        description: "Opérations financières dans une transaction atomique",
        check: /@Transactional/,
        category: "transaction",
      },
      {
        name: "Audit trail",
        description: "Traçabilité des opérations financières",
        check: /(?:audit|log|trace|journal|historique).*(?:transaction|operation|transfer|virement)/i,
        category: "audit",
      },
    ],
  },
  {
    sector: "insurance",
    keywords: ["policy", "claim", "premium", "coverage", "underwriting", "beneficiary", "risk", "sinistre", "contrat"],
    requiredPatterns: [
      {
        name: "Premium calculation",
        description: "Calcul de prime avec les facteurs de risque",
        check: /(?:premium|prime|tarif|rate)\s*(?:=|\*|calculate|calcul)/i,
        category: "calculation",
      },
      {
        name: "Claim validation",
        description: "Validation des demandes d'indemnisation",
        check: /(?:claim|sinistre|indemnisation).*(?:valid|verify|check|vérif)/i,
        category: "validation",
      },
      {
        name: "Policy status management",
        description: "Gestion des statuts de contrat (actif, suspendu, résilié)",
        check: /(?:status|statut|état).*(?:active|suspended|cancelled|actif|suspendu|résilié)/i,
        category: "validation",
      },
    ],
  },
  {
    sector: "healthcare",
    keywords: ["patient", "diagnosis", "prescription", "medical", "hospital", "doctor", "treatment", "consultation"],
    requiredPatterns: [
      {
        name: "Patient data privacy",
        description: "Protection des données patient (RGPD/HIPAA)",
        check: /(?:encrypt|chiffr|mask|masqu|anonymiz|pseudonymiz|@Secured|@PreAuthorize)/i,
        category: "security",
      },
      {
        name: "Prescription validation",
        description: "Validation des prescriptions médicales",
        check: /(?:prescription|ordonnance|medication|médicament).*(?:valid|check|vérif|dosage|dose)/i,
        category: "validation",
      },
    ],
  },
  {
    sector: "ecommerce",
    keywords: ["order", "cart", "product", "inventory", "stock", "price", "discount", "shipping", "commande"],
    requiredPatterns: [
      {
        name: "Stock validation",
        description: "Vérification du stock avant commande",
        check: /(?:stock|inventory|quantit).*(?:>=?|<=?|available|disponible|check|vérif)/i,
        category: "validation",
      },
      {
        name: "Price consistency",
        description: "Cohérence des prix (positifs, remises valides)",
        check: /(?:price|prix|amount|montant|total)\s*(?:>=?|<=?|>|<)\s*0|(?:negative|négatif)/i,
        category: "validation",
      },
      {
        name: "Order transaction",
        description: "Commande dans une transaction atomique",
        check: /@Transactional/,
        category: "transaction",
      },
    ],
  },
  {
    sector: "telecom",
    keywords: ["subscriber", "subscription", "billing", "usage", "plan", "forfait", "abonné", "facturation"],
    requiredPatterns: [
      {
        name: "Usage tracking",
        description: "Suivi de la consommation (data, voix, SMS)",
        check: /(?:usage|consommation|consumption).*(?:track|suiv|record|enregistr|meter)/i,
        category: "audit",
      },
      {
        name: "Billing calculation",
        description: "Calcul de facturation avec les forfaits",
        check: /(?:bill|factur|invoice|charge).*(?:calcul|comput|amount|montant)/i,
        category: "calculation",
      },
    ],
  },
  {
    sector: "energy",
    keywords: ["meter", "consumption", "grid", "tariff", "compteur", "consommation", "réseau", "tarif"],
    requiredPatterns: [
      {
        name: "Meter reading validation",
        description: "Validation des relevés de compteur (monotone croissant)",
        check: /(?:meter|compteur|reading|relevé|index).*(?:valid|check|vérif|previous|précédent)/i,
        category: "validation",
      },
    ],
  },
  {
    sector: "transport",
    keywords: ["route", "vehicle", "driver", "schedule", "booking", "reservation", "trajet", "véhicule"],
    requiredPatterns: [
      {
        name: "Booking conflict check",
        description: "Vérification des conflits de réservation",
        check: /(?:booking|reservation|réservation).*(?:conflict|overlap|chevauche|disponib)/i,
        category: "validation",
      },
    ],
  },
  {
    sector: "government",
    keywords: ["citizen", "permit", "license", "regulation", "citoyen", "permis", "licence", "réglementation"],
    requiredPatterns: [
      {
        name: "Audit logging",
        description: "Journalisation obligatoire des actions administratives",
        check: /(?:audit|log|journal|trace).*(?:action|operation|décision)/i,
        category: "audit",
      },
      {
        name: "Authorization check",
        description: "Vérification des droits d'accès",
        check: /(?:@PreAuthorize|@Secured|@RolesAllowed|hasRole|hasAuthority|permission)/i,
        category: "security",
      },
    ],
  },
];

// ─── Transaction-Critical Method Patterns ───────────────────────────────────

/** Method names that MUST be wrapped in @Transactional */
const TRANSACTIONAL_METHOD_PATTERNS = [
  /^(?:create|save|insert|add|persist|store)/i,
  /^(?:update|modify|edit|change|patch)/i,
  /^(?:delete|remove|destroy|purge|archive)/i,
  /^(?:transfer|move|swap|exchange)/i,
  /^(?:process|execute|run|perform|handle)(?:Order|Payment|Transaction|Claim|Transfer)/i,
  /^(?:approve|reject|validate|confirm|cancel|close|finalize)/i,
];

// ─── Exception Handling Patterns ────────────────────────────────────────────

const BUSINESS_EXCEPTION_PATTERNS = [
  /throw\s+new\s+\w*(?:Business|Domain|Application|Service)Exception/,
  /throw\s+new\s+\w*(?:NotFound|AlreadyExists|Invalid|Insufficient|Unauthorized)Exception/,
  /throw\s+new\s+ResponseStatusException/,
  /throw\s+new\s+\w*(?:Validation|Constraint|Conflict)Exception/,
];

// ─── Main Validator Class ───────────────────────────────────────────────────

export class BusinessLogicValidator {
  /**
   * Valide la préservation de la logique métier dans le projet généré.
   */
  validate(
    generatedFiles: GeneratedFile[],
    sourceComponents?: DetectedComponent[]
  ): BusinessValidationResult {
    const issues: BusinessIssue[] = [];
    const warnings: BusinessWarning[] = [];

    // 1. Vérifier la couverture @Transactional
    const transactionalResult = this.checkTransactionalCoverage(generatedFiles);
    issues.push(...transactionalResult.issues);
    warnings.push(...transactionalResult.warnings);

    // 2. Vérifier la gestion des exceptions métier
    const exceptionResult = this.checkExceptionHandling(generatedFiles);
    issues.push(...exceptionResult.issues);
    warnings.push(...exceptionResult.warnings);

    // 3. Vérifier la cohérence DTO ↔ Entity
    const dtoEntityResult = this.checkDtoEntityConsistency(generatedFiles);
    issues.push(...dtoEntityResult.issues);
    warnings.push(...dtoEntityResult.warnings);

    // 4. Vérifier les validations de données
    const validationResult = this.checkDataValidation(generatedFiles);
    issues.push(...validationResult.issues);
    warnings.push(...validationResult.warnings);

    // 5. Vérifier les patterns métier par secteur
    const sectorChecks = this.checkSectorPatterns(generatedFiles, sourceComponents);

    // 6. Calculer le score global
    const score = this.calculateScore(
      transactionalResult,
      exceptionResult,
      dtoEntityResult,
      validationResult,
      sectorChecks
    );

    const criticalCount = issues.filter((i) => i.severity === "CRITICAL").length;
    const highCount = issues.filter((i) => i.severity === "HIGH").length;

    return {
      valid: criticalCount === 0 && highCount <= 2,
      score,
      issues,
      warnings,
      sectorChecks,
      summary: {
        rulesPreserved: transactionalResult.covered + exceptionResult.covered + dtoEntityResult.matched,
        rulesTotal: transactionalResult.total + exceptionResult.total + dtoEntityResult.total,
        transactionalCoverage: transactionalResult.total > 0
          ? Math.round((transactionalResult.covered / transactionalResult.total) * 100)
          : 100,
        exceptionHandlingScore: exceptionResult.total > 0
          ? Math.round((exceptionResult.covered / exceptionResult.total) * 100)
          : 100,
        dtoEntityConsistency: dtoEntityResult.total > 0
          ? Math.round((dtoEntityResult.matched / dtoEntityResult.total) * 100)
          : 100,
      },
    };
  }

  // ─── 1. Transactional Coverage ──────────────────────────────────────────────

  private checkTransactionalCoverage(files: GeneratedFile[]): {
    issues: BusinessIssue[];
    warnings: BusinessWarning[];
    covered: number;
    total: number;
  } {
    const issues: BusinessIssue[] = [];
    const warnings: BusinessWarning[] = [];
    let covered = 0;
    let total = 0;

    const serviceFiles = files.filter(
      (f) => f.category === "service" && f.path.endsWith(".java")
    );

    for (const file of serviceFiles) {
      const lines = file.content.split("\n");
      const classHasTransactional = file.content.includes("@Transactional");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Detect method declarations
        const methodMatch = line.match(
          /(?:public|protected)\s+\w+(?:<[^>]+>)?\s+(\w+)\s*\(/
        );
        if (!methodMatch) continue;

        const methodName = methodMatch[1];
        const isTransactionalMethod = TRANSACTIONAL_METHOD_PATTERNS.some((p) =>
          p.test(methodName)
        );

        if (!isTransactionalMethod) continue;

        total++;

        // Check if method or class has @Transactional
        const prevLines = lines
          .slice(Math.max(0, i - 3), i)
          .join("\n");
        const methodHasTransactional =
          prevLines.includes("@Transactional") || classHasTransactional;

        if (methodHasTransactional) {
          covered++;
        } else {
          issues.push({
            severity: "HIGH",
            category: "MISSING_TRANSACTION",
            file: file.path,
            line: i + 1,
            message: `La méthode '${methodName}' modifie des données mais n'est pas annotée @Transactional`,
            suggestion: `Ajouter @Transactional sur la méthode ou la classe ${file.path.split("/").pop()?.replace(".java", "")}`,
          });
        }
      }
    }

    return { issues, warnings, covered, total };
  }

  // ─── 2. Exception Handling ──────────────────────────────────────────────────

  private checkExceptionHandling(files: GeneratedFile[]): {
    issues: BusinessIssue[];
    warnings: BusinessWarning[];
    covered: number;
    total: number;
  } {
    const issues: BusinessIssue[] = [];
    const warnings: BusinessWarning[] = [];
    let covered = 0;
    let total = 0;

    const serviceFiles = files.filter(
      (f) =>
        (f.category === "service" || f.category === "controller") &&
        f.path.endsWith(".java")
    );

    for (const file of serviceFiles) {
      const lines = file.content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect catch blocks
        if (line.startsWith("catch") || line.match(/}\s*catch\s*\(/)) {
          total++;

          // Check the catch block content (next 10 lines)
          const catchBlock = lines.slice(i, Math.min(i + 10, lines.length)).join("\n");

          const hasBusinessException = BUSINESS_EXCEPTION_PATTERNS.some((p) =>
            p.test(catchBlock)
          );
          const hasLogging = /(?:log\.|logger\.|LOG\.|@Slf4j)/.test(catchBlock) ||
            /(?:log\.(?:error|warn|info))/.test(catchBlock);
          const isSwallowed =
            !hasBusinessException &&
            !hasLogging &&
            !catchBlock.includes("throw") &&
            !catchBlock.includes("return");

          if (hasBusinessException || catchBlock.includes("throw")) {
            covered++;
          } else if (isSwallowed) {
            issues.push({
              severity: "CRITICAL",
              category: "INCOMPLETE_EXCEPTION_HANDLING",
              file: file.path,
              line: i + 1,
              message: `Exception avalée silencieusement — la logique métier peut être perdue`,
              suggestion: `Ajouter un throw d'exception métier ou au minimum un log.error() dans le catch block`,
            });
          } else if (hasLogging) {
            covered++;
            warnings.push({
              category: "EXCEPTION_HANDLING",
              file: file.path,
              message: `Ligne ${i + 1}: Exception loggée mais non relancée — vérifier si c'est intentionnel`,
            });
          }
        }
      }
    }

    return { issues, warnings, covered, total };
  }

  // ─── 3. DTO ↔ Entity Consistency ────────────────────────────────────────────

  private checkDtoEntityConsistency(files: GeneratedFile[]): {
    issues: BusinessIssue[];
    warnings: BusinessWarning[];
    matched: number;
    total: number;
  } {
    const issues: BusinessIssue[] = [];
    const warnings: BusinessWarning[] = [];

    // Extract DTOs and Entities
    const dtos = new Map<string, Set<string>>(); // name → fields
    const entities = new Map<string, Set<string>>(); // name → fields

    for (const file of files) {
      if (!file.path.endsWith(".java")) continue;

      const className = this.extractClassName(file.content);
      if (!className) continue;

      const fields = this.extractFields(file.content);

      if (file.category === "dto" || className.endsWith("DTO") || className.endsWith("Dto") || className.endsWith("Request") || className.endsWith("Response")) {
        const baseName = className
          .replace(/(?:DTO|Dto|Request|Response|Command|Query)$/, "");
        dtos.set(baseName, fields);
      } else if (file.category === "entity" || file.content.includes("@Entity") || file.content.includes("@Table")) {
        entities.set(className, fields);
      }
    }

    // Compare DTO fields against Entity fields
    let matched = 0;
    let total = 0;

    for (const [baseName, dtoFields] of dtos) {
      const entityFields = entities.get(baseName);
      if (!entityFields) continue;

      for (const field of dtoFields) {
        total++;
        // Ignore common non-entity fields
        if (["id", "createdAt", "updatedAt", "version", "timestamp"].includes(field)) {
          matched++;
          continue;
        }
        if (entityFields.has(field)) {
          matched++;
        } else {
          warnings.push({
            category: "DTO_ENTITY_MISMATCH",
            file: `${baseName}DTO / ${baseName}`,
            message: `Le champ '${field}' existe dans le DTO mais pas dans l'Entity — vérifier si c'est un champ calculé ou un oubli`,
          });
        }
      }
    }

    return { issues, warnings, matched, total };
  }

  // ─── 4. Data Validation ─────────────────────────────────────────────────────

  private checkDataValidation(files: GeneratedFile[]): {
    issues: BusinessIssue[];
    warnings: BusinessWarning[];
  } {
    const issues: BusinessIssue[] = [];
    const warnings: BusinessWarning[] = [];

    const dtoFiles = files.filter(
      (f) =>
        f.path.endsWith(".java") &&
        (f.category === "dto" ||
          f.content.includes("@RequestBody") ||
          f.content.match(/class\s+\w+(?:DTO|Dto|Request|Command)\b/))
    );

    for (const file of dtoFiles) {
      const hasValidation =
        file.content.includes("@Valid") ||
        file.content.includes("@NotNull") ||
        file.content.includes("@NotBlank") ||
        file.content.includes("@NotEmpty") ||
        file.content.includes("@Size") ||
        file.content.includes("@Min") ||
        file.content.includes("@Max") ||
        file.content.includes("@Pattern") ||
        file.content.includes("@Email") ||
        file.content.includes("javax.validation") ||
        file.content.includes("jakarta.validation");

      if (!hasValidation) {
        const className = this.extractClassName(file.content) || file.path;
        warnings.push({
          category: "MISSING_VALIDATION",
          file: file.path,
          message: `${className} n'a aucune annotation de validation Bean Validation — les contraintes métier du code source pourraient être perdues`,
        });
      }
    }

    // Check controllers for @Valid on @RequestBody
    const controllerFiles = files.filter(
      (f) => f.category === "controller" && f.path.endsWith(".java")
    );

    for (const file of controllerFiles) {
      const lines = file.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("@RequestBody") && !line.includes("@Valid")) {
          issues.push({
            severity: "MEDIUM",
            category: "MISSING_VALIDATION",
            file: file.path,
            line: i + 1,
            message: `@RequestBody sans @Valid — les validations Bean Validation ne seront pas déclenchées`,
            suggestion: `Ajouter @Valid avant @RequestBody pour activer la validation automatique`,
          });
        }
      }
    }

    return { issues, warnings };
  }

  // ─── 5. Sector Pattern Checks ───────────────────────────────────────────────

  private checkSectorPatterns(
    files: GeneratedFile[],
    sourceComponents?: DetectedComponent[]
  ): SectorCheckResult[] {
    const results: SectorCheckResult[] = [];

    // Detect sectors from file content
    const allContent = files
      .filter((f) => f.path.endsWith(".java"))
      .map((f) => f.content)
      .join("\n")
      .toLowerCase();

    const serviceAndControllerContent = files
      .filter(
        (f) =>
          (f.category === "service" || f.category === "controller") &&
          f.path.endsWith(".java")
      )
      .map((f) => f.content)
      .join("\n");

    for (const pattern of SECTOR_PATTERNS) {
      // Check if this sector is relevant
      const keywordHits = pattern.keywords.filter((kw) =>
        allContent.includes(kw.toLowerCase())
      );

      if (keywordHits.length < 2) continue; // Need at least 2 keyword matches

      const checks: SectorCheck[] = [];

      for (const req of pattern.requiredPatterns) {
        const passed = req.check.test(serviceAndControllerContent);
        checks.push({
          name: req.name,
          passed,
          details: passed
            ? `✓ Pattern '${req.name}' détecté dans le code généré`
            : `✗ Pattern '${req.name}' absent — ${req.description}`,
        });
      }

      results.push({
        sector: pattern.sector,
        checks,
        passed: checks.filter((c) => c.passed).length,
        total: checks.length,
      });
    }

    return results;
  }

  // ─── Utility Methods ────────────────────────────────────────────────────────

  private extractClassName(content: string): string | null {
    const match = content.match(
      /(?:public\s+)?(?:abstract\s+)?(?:class|interface|enum|record)\s+(\w+)/
    );
    return match ? match[1] : null;
  }

  private extractFields(content: string): Set<string> {
    const fields = new Set<string>();
    // Match field declarations: private Type fieldName;
    const fieldRegex = /(?:private|protected|public)\s+(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*[;=]/g;
    let match;
    while ((match = fieldRegex.exec(content)) !== null) {
      fields.add(match[1]);
    }
    // Also match record components: record Foo(Type fieldName, ...)
    const recordMatch = content.match(/record\s+\w+\s*\(([^)]+)\)/);
    if (recordMatch) {
      const params = recordMatch[1].split(",");
      for (const param of params) {
        const paramMatch = param.trim().match(/\w+\s+(\w+)/);
        if (paramMatch) fields.add(paramMatch[1]);
      }
    }
    return fields;
  }

  private calculateScore(
    transactional: { covered: number; total: number },
    exception: { covered: number; total: number },
    dtoEntity: { matched: number; total: number },
    validation: { issues: BusinessIssue[] },
    sectorChecks: SectorCheckResult[]
  ): number {
    let score = 100;

    // Transactional coverage: -5 per missing
    if (transactional.total > 0) {
      const missing = transactional.total - transactional.covered;
      score -= missing * 5;
    }

    // Exception handling: -8 per swallowed exception
    if (exception.total > 0) {
      const missing = exception.total - exception.covered;
      score -= missing * 8;
    }

    // DTO-Entity consistency: -2 per mismatch
    if (dtoEntity.total > 0) {
      const missing = dtoEntity.total - dtoEntity.matched;
      score -= missing * 2;
    }

    // Validation issues
    for (const issue of validation.issues) {
      switch (issue.severity) {
        case "CRITICAL":
          score -= 15;
          break;
        case "HIGH":
          score -= 8;
          break;
        case "MEDIUM":
          score -= 3;
          break;
        case "LOW":
          score -= 1;
          break;
      }
    }

    // Sector pattern compliance
    for (const sector of sectorChecks) {
      if (sector.total > 0) {
        const compliance = sector.passed / sector.total;
        if (compliance < 0.5) {
          score -= 10;
        } else if (compliance < 0.8) {
          score -= 5;
        }
      }
    }

    return Math.max(0, Math.min(100, score));
  }
}
