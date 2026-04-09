/**
 * Shared types and utility functions for Spring Boot code generation.
 * Extracted from spring-generator.ts for modularity (v5.5).
 */

import type {
  UseCaseIR, DtoIR, DtoFieldIR, EnumIR,
} from "../java-parser";
import type { DataSourceInfo } from "../engine/detectors/DataSourceDetector";

// ─── Shared Interfaces ─────────────────────────────────────────────────────

export interface GeneratedFile {
  path: string;
  content: string;
  category: "controller" | "service" | "dto" | "test" | "enum" | "exception" |
    "validator" | "config" | "cloud" | "pom" | "report" | "main" | "other" |
    "entity" | "repository" | "migration_note" | "infrastructure" | "adapter";
}

export interface GenerationResult {
  files: GeneratedFile[];
  stats: GenerationStats;
  warnings: string[];
  compilationResult?: CompilationResult;
  dsInfo?: DataSourceInfo;
}

export interface GenerationStats {
  totalFiles: number;
  controllers: number;
  services: number;
  dtos: number;
  tests: number;
  enums: number;
  exceptions: number;
  validators: number;
  configFiles: number;
  cloudFiles: number;
  totalLinesGenerated: number;
}

export interface CompilationResult {
  status: "OK" | "ERRORS" | "WARNINGS";
  errors: CompilationError[];
  checkedFiles: number;
  passedFiles: number;
}

export interface CompilationError {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning";
}

export interface MigrationReportContext {
  ambiguities?: Array<{
    id: string;
    type: string;
    severity: string;
    question: string;
    affectedClass: string;
    recommendation: string;
    recommendationReason: string;
    options: Array<{ id: string; label: string }>;
  }>;
  userChoices?: Array<{
    ambiguityId: string;
    selectedOptionId: string;
  }>;
  autoResolvedCount?: number;
  userResolvedCount?: number;
}

// ─── HTTP Config for REST URL generation ────────────────────────────────────

export interface HttpConfig {
  method: string;
  pathSuffix: string;
  responseStatus: number;
  hasRequestBody: boolean;
  hasPathVariable: boolean;
  actionSuffix?: string;
}

// ─── Utility Functions ─────────────────────────────────────────────────────

export function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

export function toMethodName(className: string): string {
  const name = className.replace(/UC$/, "").replace(/UseCase$/, "");
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function mapDtoClassName(className: string): string {
  return className
    .replace(/VoIn$/, "RequestDTO")
    .replace(/VoOut$/, "ResponseDTO")
    .replace(/Dto$/, "DTO");
}

export function pluralize(word: string): string {
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("z")) return word;
  if (word.endsWith("y") && !/[aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";
  return word + "s";
}

// ─── FIX v5.8.2: Proper REST URL semantics ─────────────────────────────────

/**
 * Determine the HTTP configuration for a UseCase based on its name.
 * Implements proper REST URL rules:
 * - CRÉATION (Initier, Créer, Ouvrir, Demander) → POST /resources (sans ID)
 * - MISE À JOUR (Modifier, MettreAJour) → PUT /resources/{id}
 * - ACTION MÉTIER (Activer, Bloquer, Valider) → POST /resources/{id}/action
 * - CONSULTATION (Consulter, Charger, Lister) → GET /resources/{id} ou /resources
 * - SUPPRESSION (Supprimer, Annuler) → DELETE /resources/{id}
 */
export function determineHttpConfig(uc: UseCaseIR, domain: string): HttpConfig {
  const name = uc.className.replace(/UC$/, "").replace(/UseCase$/, "");
  const lower = name.toLowerCase();

  // ── Patterns de CRÉATION → POST sans PathVariable, 201 Created ──
  const creationPatterns = [
    "initier", "creer", "ouvrir", "demander",
    "enregistrer", "ajouter", "soumettre", "deposer",
    "create", "add", "new", "register", "submit", "open",
  ];
  if (creationPatterns.some(p => lower.startsWith(p) || lower.includes(p))) {
    return {
      method: "POST",
      pathSuffix: "",
      responseStatus: 201,
      hasRequestBody: true,
      hasPathVariable: false,
    };
  }

  // ── Patterns d'ACTION MÉTIER sur ressource existante → POST avec ID + action ──
  const actionPatterns: Array<{ pattern: string; suffix: string }> = [
    { pattern: "activer", suffix: "activer" },
    { pattern: "activate", suffix: "activate" },
    { pattern: "bloquer", suffix: "bloquer" },
    { pattern: "block", suffix: "block" },
    { pattern: "annuler", suffix: "annuler" },
    { pattern: "cancel", suffix: "cancel" },
    { pattern: "valider", suffix: "valider" },
    { pattern: "validate", suffix: "validate" },
    { pattern: "approuver", suffix: "approuver" },
    { pattern: "approve", suffix: "approve" },
    { pattern: "rejeter", suffix: "rejeter" },
    { pattern: "reject", suffix: "reject" },
    { pattern: "cloturer", suffix: "cloturer" },
    { pattern: "close", suffix: "close" },
    { pattern: "suspendre", suffix: "suspendre" },
    { pattern: "suspend", suffix: "suspend" },
    { pattern: "renouveler", suffix: "renouveler" },
    { pattern: "renew", suffix: "renew" },
    { pattern: "opposer", suffix: "opposer" },
    { pattern: "oppose", suffix: "oppose" },
    { pattern: "desactiver", suffix: "desactiver" },
    { pattern: "deactivate", suffix: "deactivate" },
    { pattern: "confirmer", suffix: "confirmer" },
    { pattern: "confirm", suffix: "confirm" },
  ];
  for (const { pattern, suffix } of actionPatterns) {
    if (lower.startsWith(pattern) || lower.includes(pattern)) {
      return {
        method: "POST",
        pathSuffix: `/{${getIdParamName(uc)}}/${suffix}`,
        responseStatus: 200,
        hasRequestBody: true,
        hasPathVariable: true,
        actionSuffix: suffix,
      };
    }
  }

  // ── Patterns de CONSULTATION → GET ──
  const readPatterns = [
    "consulter", "charger", "lister", "rechercher",
    "get", "find", "read", "search", "list", "afficher",
    "lire", "load",
  ];
  if (readPatterns.some(p => lower.startsWith(p) || lower.includes(p))) {
    // Lister → GET /resources (sans ID)
    const listPatterns = ["lister", "list", "rechercher", "search"];
    const isList = listPatterns.some(p => lower.startsWith(p) || lower.includes(p));
    if (isList) {
      return {
        method: "GET",
        pathSuffix: "",
        responseStatus: 200,
        hasRequestBody: false,
        hasPathVariable: false,
      };
    }
    // Consulter/Get → GET /resources/{id}
    return {
      method: "GET",
      pathSuffix: `/{${getIdParamName(uc)}}`,
      responseStatus: 200,
      hasRequestBody: false,
      hasPathVariable: true,
    };
  }

  // ── Patterns de MISE À JOUR → PUT avec ID ──
  const updatePatterns = [
    "modifier", "update", "edit", "changer", "change", "maj",
    "mettre", "mettreajour",
  ];
  if (updatePatterns.some(p => lower.startsWith(p) || lower.includes(p))) {
    return {
      method: "PUT",
      pathSuffix: `/{${getIdParamName(uc)}}`,
      responseStatus: 200,
      hasRequestBody: true,
      hasPathVariable: true,
    };
  }

  // ── Patterns de SUPPRESSION → DELETE avec ID ──
  const deletePatterns = ["supprimer", "delete", "remove"];
  if (deletePatterns.some(p => lower.startsWith(p) || lower.includes(p))) {
    return {
      method: "DELETE",
      pathSuffix: `/{${getIdParamName(uc)}}`,
      responseStatus: 204,
      hasRequestBody: false,
      hasPathVariable: true,
    };
  }

  // ── Patterns de VÉRIFICATION → POST (action, pas de ressource CRUD) ──
  const verifyPatterns = [
    "verifier", "verify", "calculer", "calculate",
    "estimer", "estimate", "simuler", "simulate",
  ];
  if (verifyPatterns.some(p => lower.startsWith(p) || lower.includes(p))) {
    // Extract action name for the path suffix
    const actionName = extractActionFromName(lower);
    return {
      method: "POST",
      pathSuffix: actionName ? `/${actionName}` : "",
      responseStatus: 200,
      hasRequestBody: true,
      hasPathVariable: false,
      actionSuffix: actionName,
    };
  }

  // ── Patterns de TRANSACTION FINANCIÈRE → POST sans ID ──
  const txPatterns = [
    "virement", "transfer", "virer",
    "retrait", "withdraw",
    "depot", "deposit",
    "payer", "pay", "payment",
  ];
  if (txPatterns.some(p => lower.startsWith(p) || lower.includes(p))) {
    return {
      method: "POST",
      pathSuffix: "",
      responseStatus: 201,
      hasRequestBody: true,
      hasPathVariable: false,
    };
  }

  // ── Défaut : POST sans ID ──
  return {
    method: "POST",
    pathSuffix: "",
    responseStatus: 200,
    hasRequestBody: true,
    hasPathVariable: false,
  };
}

/**
 * Extract a short action name from the UseCase name for URL suffix.
 */
function extractActionFromName(lowerName: string): string {
  const actionMap: Record<string, string> = {
    "verifier": "verifier",
    "verify": "verify",
    "calculer": "calculer",
    "calculate": "calculate",
    "estimer": "estimer",
    "estimate": "estimate",
    "simuler": "simuler",
    "simulate": "simulate",
  };
  for (const [pattern, action] of Object.entries(actionMap)) {
    if (lowerName.startsWith(pattern)) return action;
  }
  return "";
}

// R1: Semantic endpoint naming (backward-compatible wrapper using new determineHttpConfig)
export function inferSemanticEndpoint(uc: UseCaseIR, domain: string): { path: string; method: string; subPath?: string } {
  const config = determineHttpConfig(uc, domain);
  const basePath = `/api/v1/${pluralize(domain.toLowerCase())}`;

  return {
    path: `${basePath}${config.pathSuffix}`,
    method: config.method,
    subPath: config.pathSuffix || undefined,
  };
}

// R2: PathVariable detection — now delegates to determineHttpConfig
export function detectIdParam(uc: UseCaseIR): boolean {
  const domain = uc.domain || "general";
  const config = determineHttpConfig(uc, domain);
  return config.hasPathVariable;
}

export function getIdParamName(uc: UseCaseIR): string {
  const domain = (uc.domain || "").toLowerCase();
  if (domain.includes("carte") || domain.includes("card")) return "numCarte";
  if (domain.includes("compte") || domain.includes("account")) return "numCompte";
  if (domain.includes("client") || domain.includes("customer")) return "clientId";
  if (domain.includes("virement") || domain.includes("transfer")) return "virementId";
  if (domain.includes("credit") || domain.includes("loan")) return "creditId";
  if (domain.includes("cheque") || domain.includes("check")) return "numCheque";
  return `${domain || "resource"}Id`;
}

export function getHttpAnnotation(method: string, path: string): string {
  const cleanPath = path.startsWith("/") ? path : "/" + path;
  switch (method) {
    case "GET": return `@GetMapping("${cleanPath}")`;
    case "POST": return `@PostMapping("${cleanPath}")`;
    case "PUT": return `@PutMapping("${cleanPath}")`;
    case "DELETE": return `@DeleteMapping("${cleanPath}")`;
    case "PATCH": return `@PatchMapping("${cleanPath}")`;
    default: return `@PostMapping("${cleanPath}")`;
  }
}

// R10: Infer Bean Validation from field metadata
export function inferBeanValidation(field: DtoFieldIR, imports: Set<string>): string[] {
  const annotations: string[] = [];
  const name = field.name.toLowerCase();
  const type = field.type;

  if (field.required) {
    if (type === "String") {
      imports.add("import jakarta.validation.constraints.NotBlank;");
      annotations.push("    @NotBlank");
    } else {
      imports.add("import jakarta.validation.constraints.NotNull;");
      annotations.push("    @NotNull");
    }
  }

  if (name.includes("numcarte") || name.includes("cardnumber") || name.includes("numerocarte")) {
    imports.add("import jakarta.validation.constraints.Pattern;");
    annotations.push(`    @Pattern(regexp = "^[0-9]{16}$", message = "Card number must be 16 digits")`);
  } else if ((type === "BigDecimal" || type === "Double" || type === "double") &&
    (name.includes("montant") || name.includes("amount") || name.includes("solde") || name.includes("balance"))) {
    imports.add("import jakarta.validation.constraints.DecimalMin;");
    imports.add("import jakarta.validation.constraints.Digits;");
    annotations.push(`    @DecimalMin(value = "0.00", message = "Amount must be positive")`);
    annotations.push(`    @Digits(integer = 15, fraction = 2, message = "Amount format: max 15 integer digits, 2 decimal")`);
  } else if (name.includes("email") || name.includes("mail")) {
    imports.add("import jakarta.validation.constraints.Email;");
    annotations.push(`    @Email(message = "Invalid email format")`);
  } else if (name.includes("telephone") || name.includes("phone") || name.includes("tel") || name.includes("gsm")) {
    imports.add("import jakarta.validation.constraints.Pattern;");
    annotations.push(`    @Pattern(regexp = "^\\\\+?[0-9]{8,15}$", message = "Invalid phone number")`);
  }

  for (const va of field.validationAnnotations) {
    if (va.startsWith("ValidRIB") || va.startsWith("ValidIBAN")) {
      annotations.push(`    @${va}`);
    } else if (va.startsWith("NotNull") && !field.required) {
      imports.add("import jakarta.validation.constraints.NotNull;");
      annotations.push("    @NotNull");
    } else if (va.startsWith("Size")) {
      imports.add("import jakarta.validation.constraints.Size;");
      annotations.push(`    @${va}`);
    } else if (va.startsWith("Pattern")) {
      imports.add("import jakarta.validation.constraints.Pattern;");
      annotations.push(`    @${va}`);
    }
  }

  return annotations;
}

// Type mapping for Java types
export function mapToSpringType(rawType: string, isEnum: boolean, enumNames: Set<string>, imports: Set<string>): string {
  if (isEnum || enumNames.has(rawType)) return rawType;

  const typeMap: Record<string, { type: string; import?: string }> = {
    "String": { type: "String" },
    "int": { type: "int" },
    "Integer": { type: "Integer" },
    "long": { type: "long" },
    "Long": { type: "Long" },
    "double": { type: "double" },
    "Double": { type: "Double" },
    "float": { type: "float" },
    "Float": { type: "Float" },
    "boolean": { type: "boolean" },
    "Boolean": { type: "Boolean" },
    "BigDecimal": { type: "BigDecimal", import: "import java.math.BigDecimal;" },
    "BigInteger": { type: "BigInteger", import: "import java.math.BigInteger;" },
    "LocalDate": { type: "LocalDate", import: "import java.time.LocalDate;" },
    "LocalDateTime": { type: "LocalDateTime", import: "import java.time.LocalDateTime;" },
    "Date": { type: "LocalDateTime", import: "import java.time.LocalDateTime;" },
    "byte[]": { type: "byte[]" },
  };

  const genericMatch = rawType.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    const container = genericMatch[1];
    const innerRaw = genericMatch[2];

    if (container === "List" || container === "ArrayList" || container === "LinkedList") {
      imports.add("import java.util.List;");
      const innerResolved = mapToSpringType(innerRaw.trim(), false, enumNames, imports);
      return `List<${innerResolved}>`;
    }
    if (container === "Set" || container === "HashSet" || container === "TreeSet") {
      imports.add("import java.util.Set;");
      const innerResolved = mapToSpringType(innerRaw.trim(), false, enumNames, imports);
      return `Set<${innerResolved}>`;
    }
    if (container === "Map" || container === "HashMap" || container === "TreeMap") {
      imports.add("import java.util.Map;");
      const parts = innerRaw.split(",").map(p => p.trim());
      if (parts.length === 2) {
        const k = mapToSpringType(parts[0], false, enumNames, imports);
        const v = mapToSpringType(parts[1], false, enumNames, imports);
        return `Map<${k}, ${v}>`;
      }
    }
    return rawType;
  }

  if (rawType === "List" || rawType === "ArrayList") {
    imports.add("import java.util.List;");
    return "List<String>";
  }
  if (rawType === "Set" || rawType === "HashSet") {
    imports.add("import java.util.Set;");
    return "Set<String>";
  }
  if (rawType === "Map" || rawType === "HashMap") {
    imports.add("import java.util.Map;");
    return "Map<String, String>";
  }

  const baseType = rawType.replace(/\[\]$/, "").trim();
  const mapping = typeMap[baseType];
  if (mapping) {
    if (mapping.import) imports.add(mapping.import);
    if (rawType.endsWith("[]")) return mapping.type + "[]";
    return mapping.type;
  }

  return rawType;
}

// Realistic test value generation
export function getRealisticValue(field: DtoFieldIR): any {
  const name = field.name.toLowerCase();
  const type = field.type;

  if (name.includes("numcarte") || name.includes("cardnumber")) return "1234567890123456";
  if (name.includes("numcompte") || name.includes("accountnumber")) return "001234567890";
  if (name.includes("montant") || name.includes("amount")) return 1500.00;
  if (name.includes("solde") || name.includes("balance")) return 25000.50;
  if (name.includes("email")) return "client@example.com";
  if (name.includes("telephone") || name.includes("phone")) return "+212600000000";
  if (name.includes("nom") || name.includes("name") || name.includes("prenom")) return "Mohammed";
  if (name.includes("adresse") || name.includes("address")) return "123 Bd Mohammed V, Casablanca";
  if (name.includes("code") && name.includes("pays")) return "MA";
  if (name.includes("code") && name.includes("retour")) return "000";
  if (name.includes("code") && name.includes("activation")) return "12345";
  if (name.includes("code")) return "CODE001";
  if (name.includes("date")) return "2024-01-15";
  if (name.includes("statut") || name.includes("status")) return "ACTIVE";
  if (name.includes("message")) return "Operation completed successfully";
  if (name.includes("description")) return "Test description";
  if (name.includes("reference") || name.includes("ref")) return "REF-2024-001";

  if (type === "String") return "test-value";
  if (type === "int" || type === "Integer" || type === "long" || type === "Long") return 1;
  if (type === "double" || type === "Double" || type === "float" || type === "Float") return 1.0;
  if (type === "BigDecimal") return 100.00;
  if (type === "boolean" || type === "Boolean") return true;
  if (type === "LocalDate" || type === "Date") return "2024-01-15";
  return "test";
}
