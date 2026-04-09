/**
 * Shared types and utility functions for Spring Boot code generation.
 * Extracted from spring-generator.ts for modularity (v5.5).
 */

import type {
  UseCaseIR, DtoIR, DtoFieldIR, EnumIR,
} from "../java-parser";

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

// R1: Semantic endpoint naming
export function inferSemanticEndpoint(uc: UseCaseIR, domain: string): { path: string; method: string; subPath?: string } {
  const name = uc.className.replace(/UC$/, "").replace(/UseCase$/, "");
  const lower = name.toLowerCase();

  // Verb-to-HTTP mapping with path suffixes
  const verbMap: Array<{ patterns: RegExp[]; method: string; pathSuffix?: string }> = [
    { patterns: [/^consulter/i, /^get/i, /^lire/i, /^read/i, /^find/i, /^search/i, /^lister/i, /^list/i, /^afficher/i], method: "GET" },
    { patterns: [/^creer/i, /^create/i, /^ajouter/i, /^add/i, /^nouveau/i, /^new/i, /^enregistrer/i, /^register/i], method: "POST" },
    { patterns: [/^modifier/i, /^update/i, /^edit/i, /^changer/i, /^change/i, /^maj/i], method: "PUT" },
    { patterns: [/^supprimer/i, /^delete/i, /^remove/i, /^annuler/i, /^cancel/i], method: "DELETE" },
    { patterns: [/^activer/i, /^activate/i, /^enable/i], method: "PATCH", pathSuffix: "/activate" },
    { patterns: [/^desactiver/i, /^deactivate/i, /^disable/i, /^bloquer/i, /^block/i], method: "PATCH", pathSuffix: "/deactivate" },
    { patterns: [/^valider/i, /^validate/i, /^confirm/i, /^confirmer/i], method: "PATCH", pathSuffix: "/validate" },
    { patterns: [/^renouveler/i, /^renew/i], method: "PATCH", pathSuffix: "/renew" },
    { patterns: [/^opposer/i, /^oppose/i], method: "PATCH", pathSuffix: "/oppose" },
    { patterns: [/^virement/i, /^transfer/i, /^virer/i], method: "POST", pathSuffix: "/transfer" },
    { patterns: [/^retrait/i, /^withdraw/i], method: "POST", pathSuffix: "/withdraw" },
    { patterns: [/^depot/i, /^deposit/i], method: "POST", pathSuffix: "/deposit" },
    { patterns: [/^payer/i, /^pay/i, /^payment/i], method: "POST", pathSuffix: "/payment" },
  ];

  let method = "POST";
  let pathSuffix = "";

  for (const mapping of verbMap) {
    if (mapping.patterns.some(p => p.test(lower))) {
      method = mapping.method;
      pathSuffix = mapping.pathSuffix || "";
      break;
    }
  }

  // Build the full path
  const basePath = `/api/v1/${pluralize(domain.toLowerCase())}`;
  const hasId = detectIdParam(uc);
  const idParam = hasId ? `/{${getIdParamName(uc)}}` : "";

  return {
    path: `${basePath}${idParam}${pathSuffix}`,
    method,
    subPath: `${idParam}${pathSuffix}`,
  };
}

// R2: PathVariable detection
export function detectIdParam(uc: UseCaseIR): boolean {
  const name = uc.className.toLowerCase();
  // Operations that typically need an ID parameter
  if (/^(consulter|get|modifier|update|supprimer|delete|activer|desactiver|bloquer|valider|renouveler|opposer)/i.test(name)) {
    return true;
  }
  // Check if VoIn has an ID-like field
  if (uc.voInType && uc.voInType !== "Void") {
    return true; // Most operations with input need an identifier
  }
  return false;
}

export function getIdParamName(uc: UseCaseIR): string {
  const domain = (uc.domain || "").toLowerCase();
  if (domain.includes("carte") || domain.includes("card")) return "numCarte";
  if (domain.includes("compte") || domain.includes("account")) return "numCompte";
  if (domain.includes("client") || domain.includes("customer")) return "clientId";
  if (domain.includes("virement") || domain.includes("transfer")) return "virementId";
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
