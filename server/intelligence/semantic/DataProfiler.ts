/**
 * DataProfiler — Analyse les champs d'une classe Java pour en déduire
 * les contraintes de validation, le type OpenAPI, et les annotations Spring.
 * 100% déterministe, 0 LLM.
 *
 * @author Hamza NORDINE
 */

export interface FieldProfile {
  fieldName: string;
  javaType: string;
  openApiType: string;
  openApiFormat?: string;
  nullable: boolean;
  required: boolean;
  validations: ValidationRule[];
  annotations: string[];
  isSensitive: boolean;
  sensitiveReason?: string;
  description: string;
}

export interface ValidationRule {
  annotation: string;
  params?: Record<string, string | number>;
  reason: string;
}

export interface DataProfile {
  className: string;
  fields: FieldProfile[];
  totalFields: number;
  sensitiveFields: number;
  requiredFields: number;
  hasValidation: boolean;
  suggestedAnnotations: string[];
}

export interface FieldContext {
  name: string;
  type: string;
  annotations: string[];
  modifiers: string[];
}

// ── Type mapping Java → OpenAPI ────────────────────────────────

const TYPE_MAPPING: Record<string, { type: string; format?: string }> = {
  // Primitives
  "int": { type: "integer", format: "int32" },
  "long": { type: "integer", format: "int64" },
  "float": { type: "number", format: "float" },
  "double": { type: "number", format: "double" },
  "boolean": { type: "boolean" },
  "byte": { type: "string", format: "byte" },
  "char": { type: "string" },
  "short": { type: "integer", format: "int32" },
  // Wrappers
  "Integer": { type: "integer", format: "int32" },
  "Long": { type: "integer", format: "int64" },
  "Float": { type: "number", format: "float" },
  "Double": { type: "number", format: "double" },
  "Boolean": { type: "boolean" },
  "Byte": { type: "string", format: "byte" },
  "Character": { type: "string" },
  "Short": { type: "integer", format: "int32" },
  // Common types
  "String": { type: "string" },
  "BigDecimal": { type: "number", format: "decimal" },
  "BigInteger": { type: "integer", format: "int64" },
  "Date": { type: "string", format: "date-time" },
  "LocalDate": { type: "string", format: "date" },
  "LocalDateTime": { type: "string", format: "date-time" },
  "Instant": { type: "string", format: "date-time" },
  "ZonedDateTime": { type: "string", format: "date-time" },
  "UUID": { type: "string", format: "uuid" },
  "byte[]": { type: "string", format: "binary" },
};

// ── Sensitive field patterns ───────────────────────────────────

const SENSITIVE_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /password|motDePasse|mdp|pwd/i, reason: "Mot de passe" },
  { pattern: /pin|codePin|codeSecret/i, reason: "Code PIN/secret" },
  { pattern: /cvv|cvc|cryptogramme/i, reason: "Cryptogramme carte" },
  { pattern: /pan|numCarte|cardNumber/i, reason: "Numéro de carte bancaire" },
  { pattern: /iban|rib|bban/i, reason: "Coordonnées bancaires" },
  { pattern: /cin|cni|passport|numIdentite/i, reason: "Pièce d'identité" },
  { pattern: /token|secret|apiKey/i, reason: "Token/clé secrète" },
  { pattern: /ssn|numSecu|securiteSociale/i, reason: "Numéro de sécurité sociale" },
  { pattern: /otp|codeOtp|codeVerification/i, reason: "Code OTP" },
];

// ── Validation inference patterns ──────────────────────────────

interface ValidationPattern {
  fieldPattern: RegExp;
  typePattern?: RegExp;
  validations: ValidationRule[];
}

const VALIDATION_PATTERNS: ValidationPattern[] = [
  {
    fieldPattern: /email|mail|courriel/i,
    validations: [
      { annotation: "@Email", reason: "Champ email détecté" },
      { annotation: "@NotBlank", reason: "Email obligatoire" },
      { annotation: "@Size", params: { max: 255 }, reason: "Longueur max email" },
    ],
  },
  {
    fieldPattern: /telephone|phone|tel|mobile|gsm/i,
    validations: [
      { annotation: "@Pattern", params: { regexp: "^\\+?[0-9]{8,15}$" }, reason: "Format téléphone" },
      { annotation: "@NotBlank", reason: "Téléphone obligatoire" },
    ],
  },
  {
    fieldPattern: /iban/i,
    validations: [
      { annotation: "@Pattern", params: { regexp: "^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$" }, reason: "Format IBAN" },
      { annotation: "@NotBlank", reason: "IBAN obligatoire" },
    ],
  },
  {
    fieldPattern: /montant|amount|solde|balance|prix|price/i,
    typePattern: /BigDecimal|double|Double|float|Float/,
    validations: [
      { annotation: "@NotNull", reason: "Montant obligatoire" },
      { annotation: "@DecimalMin", params: { value: "0.00" }, reason: "Montant positif" },
      { annotation: "@Digits", params: { integer: 15, fraction: 2 }, reason: "Précision monétaire" },
    ],
  },
  {
    fieldPattern: /taux|rate|pourcentage|percentage/i,
    validations: [
      { annotation: "@NotNull", reason: "Taux obligatoire" },
      { annotation: "@DecimalMin", params: { value: "0.00" }, reason: "Taux positif" },
      { annotation: "@DecimalMax", params: { value: "100.00" }, reason: "Taux max 100%" },
    ],
  },
  {
    fieldPattern: /date/i,
    validations: [
      { annotation: "@NotNull", reason: "Date obligatoire" },
    ],
  },
  {
    fieldPattern: /nom|name|prenom|firstName|lastName/i,
    validations: [
      { annotation: "@NotBlank", reason: "Nom obligatoire" },
      { annotation: "@Size", params: { min: 1, max: 100 }, reason: "Longueur nom" },
    ],
  },
  {
    fieldPattern: /code|reference|ref|numero|num/i,
    validations: [
      { annotation: "@NotBlank", reason: "Code/référence obligatoire" },
      { annotation: "@Size", params: { max: 50 }, reason: "Longueur code" },
    ],
  },
  {
    fieldPattern: /adresse|address/i,
    validations: [
      { annotation: "@Size", params: { max: 500 }, reason: "Longueur adresse" },
    ],
  },
  {
    fieldPattern: /description|commentaire|comment|libelle|motif/i,
    validations: [
      { annotation: "@Size", params: { max: 1000 }, reason: "Longueur texte libre" },
    ],
  },
  {
    fieldPattern: /devise|currency/i,
    validations: [
      { annotation: "@NotBlank", reason: "Devise obligatoire" },
      { annotation: "@Size", params: { min: 3, max: 3 }, reason: "Code devise ISO 4217" },
    ],
  },
  {
    fieldPattern: /duree|duration|mois|months/i,
    typePattern: /int|Integer|long|Long/,
    validations: [
      { annotation: "@NotNull", reason: "Durée obligatoire" },
      { annotation: "@Min", params: { value: 1 }, reason: "Durée minimum 1" },
    ],
  },
];

// ── DataProfiler ───────────────────────────────────────────────

export class DataProfiler {
  /**
   * Profile tous les champs d'une classe.
   */
  profileClass(className: string, fields: FieldContext[]): DataProfile {
    const profiles = fields.map((f) => this.profileField(f));

    return {
      className,
      fields: profiles,
      totalFields: profiles.length,
      sensitiveFields: profiles.filter((p) => p.isSensitive).length,
      requiredFields: profiles.filter((p) => p.required).length,
      hasValidation: profiles.some((p) => p.validations.length > 0),
      suggestedAnnotations: this.suggestClassAnnotations(profiles),
    };
  }

  /**
   * Profile un champ individuel.
   */
  profileField(field: FieldContext): FieldProfile {
    const typeInfo = this.mapType(field.type);
    const validations = this.inferValidations(field);
    const sensitive = this.checkSensitivity(field.name);
    const nullable = this.isNullable(field);
    const required = this.isRequired(field, validations);

    return {
      fieldName: field.name,
      javaType: field.type,
      openApiType: typeInfo.type,
      openApiFormat: typeInfo.format,
      nullable,
      required,
      validations,
      annotations: this.generateAnnotations(validations, sensitive.isSensitive),
      isSensitive: sensitive.isSensitive,
      sensitiveReason: sensitive.reason,
      description: this.generateDescription(field.name, field.type),
    };
  }

  private mapType(javaType: string): { type: string; format?: string } {
    // Handle generics: List<String> → array of string
    const listMatch = javaType.match(/^(?:List|Set|Collection)<(.+)>$/);
    if (listMatch) {
      const inner = this.mapType(listMatch[1]);
      return { type: "array", format: inner.type };
    }

    // Handle Map
    if (javaType.startsWith("Map<")) {
      return { type: "object" };
    }

    // Direct mapping
    const mapped = TYPE_MAPPING[javaType];
    if (mapped) return mapped;

    // Enum or complex type
    return { type: "string" };
  }

  private inferValidations(field: FieldContext): ValidationRule[] {
    const validations: ValidationRule[] = [];

    // Check existing annotations first
    const hasNotNull = field.annotations.some((a) => a.includes("@NotNull") || a.includes("@NotBlank") || a.includes("@NotEmpty"));
    if (hasNotNull) {
      return validations; // Already has validation annotations
    }

    // Pattern-based inference
    for (const vp of VALIDATION_PATTERNS) {
      if (vp.fieldPattern.test(field.name)) {
        if (vp.typePattern && !vp.typePattern.test(field.type)) continue;
        validations.push(...vp.validations);
      }
    }

    return validations;
  }

  private checkSensitivity(fieldName: string): { isSensitive: boolean; reason?: string } {
    for (const sp of SENSITIVE_PATTERNS) {
      if (sp.pattern.test(fieldName)) {
        return { isSensitive: true, reason: sp.reason };
      }
    }
    return { isSensitive: false };
  }

  private isNullable(field: FieldContext): boolean {
    // Primitives are never nullable
    if (/^(int|long|float|double|boolean|byte|char|short)$/.test(field.type)) {
      return false;
    }
    // Check for @NotNull annotation
    if (field.annotations.some((a) => a.includes("@NotNull"))) {
      return false;
    }
    return true;
  }

  private isRequired(field: FieldContext, validations: ValidationRule[]): boolean {
    if (field.annotations.some((a) => a.includes("@NotNull") || a.includes("@NotBlank") || a.includes("@NotEmpty"))) {
      return true;
    }
    return validations.some((v) => v.annotation === "@NotNull" || v.annotation === "@NotBlank");
  }

  private generateAnnotations(validations: ValidationRule[], isSensitive: boolean): string[] {
    const annotations: string[] = [];
    for (const v of validations) {
      if (v.params) {
        const params = Object.entries(v.params)
          .map(([k, val]) => `${k} = ${typeof val === "string" ? `"${val}"` : val}`)
          .join(", ");
        annotations.push(`${v.annotation}(${params})`);
      } else {
        annotations.push(v.annotation);
      }
    }
    if (isSensitive) {
      annotations.push("@JsonIgnore // Sensitive field");
    }
    return annotations;
  }

  private generateDescription(fieldName: string, javaType: string): string {
    // Convert camelCase to human-readable
    const words = fieldName
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .toLowerCase();

    const typeLabel = TYPE_MAPPING[javaType]?.type || "object";
    return `${words} (${typeLabel})`;
  }

  private suggestClassAnnotations(profiles: FieldProfile[]): string[] {
    const annotations: string[] = [];
    if (profiles.some((p) => p.validations.length > 0)) {
      annotations.push("@Validated");
    }
    if (profiles.some((p) => p.isSensitive)) {
      annotations.push("// Contains sensitive fields — apply field-level security");
    }
    return annotations;
  }
}
