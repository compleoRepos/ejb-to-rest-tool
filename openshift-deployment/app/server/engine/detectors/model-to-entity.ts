/**
 * model-to-entity.ts — Scanner tous les packages pour les Models et les classifier
 * en entités JPA vs DTOs Spring.
 *
 * Pattern cible :
 *   package Model/ → CompteClient, MadBeneficiaire, MadMad, Categorie, etc.
 *   package DTO/Request/ → Auth, Emission, Annulation, etc.
 *   package DTO/Response/ → AuthResponse, MADCoreDTO, etc.
 *
 * Classification :
 *   - Entité JPA : classe avec des champs qui correspondent à des colonnes DB
 *     (référencée dans HibernateDao, a des getters/setters, pas de pattern DTO)
 *   - DTO : classe dans un package DTO/, Request/, Response/, ou avec suffixe DTO/Request/Response
 *
 * @author Compleo
 * @since v8.3
 */

import type { GeneratedFile } from "../../spring/shared";

// ─── Types publics ──────────────────────────────────────────────────────────

export interface ModelClassification {
  /** Nom de la classe */
  className: string;
  /** Package d'origine */
  packageName: string;
  /** Classification : entity ou dto */
  type: "entity" | "dto" | "enum" | "unknown";
  /** Champs détectés */
  fields: ModelField[];
  /** Table SQL associée (pour les entités) */
  tableName: string;
  /** Chemin du fichier source */
  sourceFile: string;
}

export interface ModelField {
  /** Nom du champ */
  name: string;
  /** Type Java */
  type: string;
  /** Colonne SQL associée (si détectée) */
  columnName: string;
  /** Est-ce un ID ? */
  isId: boolean;
}

export interface ModelScanResult {
  /** Toutes les classes scannées */
  models: ModelClassification[];
  /** Entités JPA détectées */
  entities: ModelClassification[];
  /** DTOs détectés */
  dtos: ModelClassification[];
  /** Enums détectés */
  enums: ModelClassification[];
}

// ─── Mapping classe → table ─────────────────────────────────────────────────

const CLASS_TABLE_MAP: Record<string, string> = {
  "CompteClient":       "COMPTE_CLIENT",
  "MadBeneficiaire":    "MAD_BENEFICIAIRE",
  "MadMad":             "MAD_MAD",
  "Categorie":          "CATEGORIE",
  "MadPlafondMontant":  "MAD_PLAFOND",
  "MadData":            "MAD_DATA",
  "MadEtat":            "MAD_ETAT",
  "MadOrdonnateur":     "MAD_ORDONNATEUR",
  "MontantControl":     "MONTANT_CONTROL",
  "TransactionData":    "TRANSACTION_DATA",
  "TransactionLock":    "TRANSACTION_LOCK",
  "objetRetourSolde":   "SOLDE",
};

// ─── Classes connues comme entités (référencées dans HibernateDao) ──────────

const KNOWN_ENTITIES = new Set([
  "CompteClient", "MadBeneficiaire", "MadMad", "Categorie",
  "MadPlafondMontant", "MadData", "MadEtat", "MadOrdonnateur",
  "MontantControl", "objetRetourSolde", "TransactionData", "TransactionLock",
]);

// ─── Classes connues comme DTOs ─────────────────────────────────────────────

const KNOWN_DTOS = new Set([
  "Auth", "Emission", "Annulation", "Consultation", "ConsultationEligibilite",
  "MADList", "Beneficiaire", "TestRequest",
  "AuthResponse", "AnnulationResponse", "EmissionResponse", "MADCoreDTO",
  "EligilibiteCanalResponse", "JwtAuthResponse", "GenericResponse",
  "MadCoreToken", "TestResponse", "Canal", "Emetteur", "Entete",
  "PushNotificationMessageParams",
]);

// ─── Scanner principal ──────────────────────────────────────────────────────

/**
 * Scanner tous les fichiers Java et classifier les Models en entités/DTOs.
 */
export function scanModels(files: { path: string; content: string }[]): ModelScanResult {
  const models: ModelClassification[] = [];

  for (const file of files) {
    if (!file.path.endsWith(".java")) continue;

    const className = extractClassName(file.content, file.path);
    if (!className) continue;

    const packageName = extractPackage(file.content);

    // Classifier
    const type = classifyModel(className, packageName, file.content);
    if (type === "unknown") continue; // Pas un model/DTO

    const fields = extractFields(file.content);
    const tableName = CLASS_TABLE_MAP[className] ?? "";

    models.push({
      className,
      packageName,
      type,
      fields,
      tableName,
      sourceFile: file.path,
    });
  }

  return {
    models,
    entities: models.filter(m => m.type === "entity"),
    dtos: models.filter(m => m.type === "dto"),
    enums: models.filter(m => m.type === "enum"),
  };
}

/**
 * Générer les fichiers JPA Entity à partir des entités détectées.
 */
export function generateEntities(
  scanResult: ModelScanResult,
  basePackage: string,
  basePath: string
): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  for (const entity of scanResult.entities) {
    files.push({
      path: `${basePath}/entity/${entity.className}.java`,
      content: generateEntityFile(entity, basePackage),
      category: "entity",
    });
  }

  return files;
}

// ─── Classification ─────────────────────────────────────────────────────────

function classifyModel(className: string, packageName: string, source: string): "entity" | "dto" | "enum" | "unknown" {
  // Enum
  if (/public\s+enum\s+/.test(source)) return "enum";

  // DTO patterns
  if (KNOWN_DTOS.has(className)) return "dto";
  if (/\bDTO\b|Request|Response/.test(packageName)) return "dto";
  if (/DTO$|Request$|Response$/.test(className)) return "dto";

  // Entity patterns
  if (KNOWN_ENTITIES.has(className)) return "entity";
  if (/\bModel\b|model|entity/.test(packageName)) {
    // Vérifier que c'est bien une classe avec des champs
    if (/(private|protected)\s+\w+\s+\w+\s*;/.test(source)) return "entity";
  }

  // Fallback: classe avec des champs privés dans un package Model
  if (/Model/.test(packageName) && /(private|protected)\s+\w+\s+\w+\s*;/.test(source)) {
    return "entity";
  }

  return "unknown";
}

// ─── Extraction ─────────────────────────────────────────────────────────────

function extractClassName(content: string, path: string): string {
  const match = content.match(/public\s+(?:abstract\s+)?(?:class|interface|enum)\s+(\w+)/);
  if (match) return match[1];
  const parts = path.split("/");
  return parts[parts.length - 1].replace(".java", "");
}

function extractPackage(content: string): string {
  const match = content.match(/package\s+([\w.]+)\s*;/);
  return match ? match[1] : "";
}

function extractFields(source: string): ModelField[] {
  const fields: ModelField[] = [];
  const fieldRegex = /(?:private|protected)\s+([\w<>,\s\[\]]+?)\s+(\w+)\s*(?:=\s*[^;]+)?;/g;
  let match;

  while ((match = fieldRegex.exec(source)) !== null) {
    const type = match[1].trim();
    const name = match[2];

    // Skip static fields
    if (/\bstatic\b/.test(source.substring(Math.max(0, match.index - 20), match.index))) continue;

    // Inférer le nom de colonne
    const columnName = toSnakeCase(name).toUpperCase();

    // Détecter les IDs
    const isId = /^id$|^id[A-Z]|Id$/.test(name) || name === "reference" || name === "seq";

    fields.push({ name, type, columnName, isId });
  }

  return fields;
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

// ─── Génération Entity JPA ──────────────────────────────────────────────────

function generateEntityFile(entity: ModelClassification, basePackage: string): string {
  const tableName = entity.tableName || toSnakeCase(entity.className).toUpperCase();

  const idField = entity.fields.find(f => f.isId);
  const idFieldName = idField?.name ?? "id";
  const idFieldType = idField?.type ?? "Long";

  // v12.7: Deduplicate fields by name (keep first occurrence)
  // Also filter out serialVersionUID and static/final fields
  const seenFieldNames = new Set<string>();
  const EXCLUDED_FIELDS = new Set(['serialVersionUID', 'serialversionuid']);
  const uniqueFields = entity.fields.filter(f => {
    if (seenFieldNames.has(f.name)) return false;
    if (EXCLUDED_FIELDS.has(f.name)) return false;
    seenFieldNames.add(f.name);
    return true;
  });

  // v12.7: Only the first @Id field gets @Id + @GeneratedValue; others are regular columns
  let idAlreadyAssigned = false;
  const fieldsCode = uniqueFields
    .map(f => {
      const annotations: string[] = [];
      if (f.isId && !idAlreadyAssigned) {
        annotations.push("    @Id");
        annotations.push("    @GeneratedValue(strategy = GenerationType.IDENTITY)");
        idAlreadyAssigned = true;
      }
      annotations.push(`    @Column(name = "${f.columnName}")`);
      // Remove 'final' from field type (incompatible with @NoArgsConstructor/@Builder)
      const cleanType = mapJpaType(f.type).replace(/\bfinal\s+/, '');
      return `${annotations.join("\n")}\n    private ${cleanType} ${f.name};`;
    })
    .join("\n\n");

  // v12.7: Collect additional imports based on field types
  const additionalImports: string[] = [];
  const allFieldTypes = uniqueFields.map(f => mapJpaType(f.type));
  if (allFieldTypes.includes("LocalDateTime")) additionalImports.push("import java.time.LocalDateTime;");
  if (allFieldTypes.includes("LocalDate")) additionalImports.push("import java.time.LocalDate;");
  if (allFieldTypes.includes("BigDecimal")) additionalImports.push("import java.math.BigDecimal;");
  if (allFieldTypes.includes("BigInteger")) additionalImports.push("import java.math.BigInteger;");
  const extraImports = additionalImports.length > 0 ? additionalImports.join("\n") + "\n" : "";

  return `package ${basePackage}.entity;

import jakarta.persistence.*;
${extraImports}import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;

/**
 * ${entity.className} — Entité JPA.
 * Table: ${tableName}
 * Migrée depuis le package Model legacy.
 *
 * @author Compleo v8.3
 */
@Data
@Entity
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "${tableName}")
public class ${entity.className} {

${fieldsCode}
}
`;
}

function mapJpaType(type: string): string {
  // Map legacy types to JPA-compatible types
  return type
    .replace(/^int$/, "Integer")
    .replace(/^long$/, "Long")
    .replace(/^double$/, "Double")
    .replace(/^boolean$/, "Boolean")
    .replace(/^float$/, "Float")
    .replace(/^DateTime$/, "LocalDateTime")
    .replace(/^Timestamp$/, "LocalDateTime")
    .replace(/^java\.sql\.Timestamp$/, "LocalDateTime")
    .replace(/^java\.util\.Date$/, "LocalDateTime")
    .replace(/^Date$/, "LocalDate");
}
