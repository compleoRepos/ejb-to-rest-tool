/**
 * usecase-dto-generator.ts — v8.5
 * Génère des RequestDTO/ResponseDTO typés pour chaque UseCase
 * qui n'a pas de DTO explicite dans le dtoMap.
 *
 * Analyse le rawSource du UseCase pour extraire les champs d'entrée/sortie
 * et inférer les types Java à partir des noms et des patterns d'accès.
 *
 * @author Hamza NORDINE
 */

import type { UseCaseIR, DtoIR, DtoFieldIR } from "../../java-parser";
import type { GeneratedFile } from "../../spring/shared";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GeneratedDtoResult {
  /** DtoIR ajoutés au dtoMap (clé = className original, ex: "ConsulterSoldeVoIn") */
  newDtos: DtoIR[];
  /** Fichiers Java générés pour les DTOs */
  files: GeneratedFile[];
  /** Statistiques */
  stats: {
    useCasesAnalyzed: number;
    dtosGenerated: number;
    fieldsExtracted: number;
  };
}

interface ExtractedField {
  name: string;
  type: string;
  source: string; // ex: "voIn.getNodeAsString", "voOut.setXxx", "method-param"
}

// ─── Inférence de type par nom de champ ─────────────────────────────────────

const TYPE_INFERENCE_RULES: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /^date|Date$|^dt/i, type: "LocalDate" },
  { pattern: /DateTime$|Timestamp$/i, type: "LocalDateTime" },
  { pattern: /^montant|^solde|^amount|^balance|^prix|^tarif|^frais|^commission|^taux/i, type: "BigDecimal" },
  { pattern: /^id[A-Z]|Id$|^num[A-Z]|^numero|^identifiant/i, type: "Long" },
  { pattern: /^code[A-Z]|Code$|^ref[A-Z]|^reference|^libelle|^nom|^prenom|^adresse|^email|^tel|^rib|^iban/i, type: "String" },
  { pattern: /^count|^nb[A-Z]|^nombre|^total[A-Z]|^index|^rang|^ordre/i, type: "Integer" },
  { pattern: /^flag|^is[A-Z]|^has[A-Z]|^est[A-Z]|^actif|^valide|^bloque/i, type: "Boolean" },
  { pattern: /^liste|^list|List$/i, type: "List<String>" },
];

function inferTypeFromName(fieldName: string): string {
  for (const rule of TYPE_INFERENCE_RULES) {
    if (rule.pattern.test(fieldName)) return rule.type;
  }
  return "String"; // fallback sûr
}

// ─── Extraction des champs depuis le rawSource ──────────────────────────────

/**
 * Extraire les champs d'entrée (Request) depuis le code source legacy.
 * Patterns détectés :
 *   - voIn.getXxx() / voIn.get("xxx")
 *   - voIn.getNodeAsString("xxx") / getNodeAsInt / getNodeAsLong / getNodeAsDate / getNodeAsBigDecimal
 *   - envelope.getNodeAsString("xxx")
 *   - request.getXxx()
 *   - Paramètres de méthode execute(Type name, ...)
 */
export function extractInputFields(rawSource: string): ExtractedField[] {
  if (!rawSource) return [];
  const fields = new Map<string, ExtractedField>();

  // Pattern 1: voIn.getNodeAsXxx("fieldName") — type explicite
  const nodeGetterRegex = /(?:voIn|vo_in|input|envelope(?:In)?)\s*\.\s*getNodeAs(\w+)\s*\(\s*"(\w+)"\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = nodeGetterRegex.exec(rawSource)) !== null) {
    const typeHint = match[1]; // String, Int, Long, Date, BigDecimal, etc.
    const fieldName = match[2];
    const javaType = mapNodeTypeToJava(typeHint);
    if (!fields.has(fieldName)) {
      fields.set(fieldName, { name: fieldName, type: javaType, source: `getNodeAs${typeHint}` });
    }
  }

  // Pattern 2: voIn.getXxx() — getter standard (type inféré du nom)
  const getterRegex = /(?:voIn|vo_in|input|request)\s*\.\s*get([A-Z]\w*)\s*\(\s*\)/g;
  while ((match = getterRegex.exec(rawSource)) !== null) {
    const rawName = match[1];
    const fieldName = rawName.charAt(0).toLowerCase() + rawName.slice(1);
    if (!fields.has(fieldName) && !isJavaBuiltinGetter(rawName)) {
      fields.set(fieldName, { name: fieldName, type: inferTypeFromName(fieldName), source: "getter" });
    }
  }

  // Pattern 3: voIn.get("fieldName") — map-style access
  const mapGetRegex = /(?:voIn|vo_in|input|envelope(?:In)?)\s*\.\s*get\s*\(\s*"(\w+)"\s*\)/g;
  while ((match = mapGetRegex.exec(rawSource)) !== null) {
    const fieldName = match[1];
    if (!fields.has(fieldName)) {
      fields.set(fieldName, { name: fieldName, type: inferTypeFromName(fieldName), source: "map-get" });
    }
  }

  // Pattern 4: Paramètres de la méthode execute/process/handle
  const methodParamRegex = /(?:public\s+\w+\s+(?:execute|process|handle|traiter)\w*\s*\()([^)]+)\)/g;
  while ((match = methodParamRegex.exec(rawSource)) !== null) {
    const paramsStr = match[1];
    // Ignorer si c'est juste ValueObject voIn
    if (/^\s*ValueObject\s+\w+\s*$/.test(paramsStr)) continue;
    if (/^\s*Envelope\s+\w+\s*$/.test(paramsStr)) continue;

    const params = paramsStr.split(",").map(p => p.trim()).filter(p => p.length > 0);
    for (const param of params) {
      const parts = param.split(/\s+/);
      if (parts.length >= 2) {
        const type = parts[parts.length - 2];
        const name = parts[parts.length - 1];
        if (type !== "ValueObject" && type !== "Envelope" && !isJavaAnnotation(type)) {
          if (!fields.has(name)) {
            fields.set(name, { name, type: mapLegacyTypeToSpring(type), source: "method-param" });
          }
        }
      }
    }
  }

  return [...fields.values()];
}

/**
 * Extraire les champs de sortie (Response) depuis le code source legacy.
 * Patterns détectés :
 *   - voOut.setXxx(value) / voOut.set("xxx", value)
 *   - voOut.setNodeValue("xxx", value)
 *   - result.setXxx(value) / response.setXxx(value)
 *   - builder.xxx(value)
 *   - envelope.setNodeValue("xxx", value)
 */
export function extractOutputFields(rawSource: string): ExtractedField[] {
  if (!rawSource) return [];
  const fields = new Map<string, ExtractedField>();

  // Pattern 1: voOut.setNodeValue("fieldName", value) — type inféré
  const nodeSetterRegex = /(?:voOut|vo_out|output|result|response|envelope(?:Out)?)\s*\.\s*setNodeValue\s*\(\s*"(\w+)"\s*,/g;
  let match: RegExpExecArray | null;
  while ((match = nodeSetterRegex.exec(rawSource)) !== null) {
    const fieldName = match[1];
    if (!fields.has(fieldName)) {
      fields.set(fieldName, { name: fieldName, type: inferTypeFromName(fieldName), source: "setNodeValue" });
    }
  }

  // Pattern 2: voOut.setXxx(value) — setter standard
  const setterRegex = /(?:voOut|vo_out|output|result|response)\s*\.\s*set([A-Z]\w*)\s*\(/g;
  while ((match = setterRegex.exec(rawSource)) !== null) {
    const rawName = match[1];
    const fieldName = rawName.charAt(0).toLowerCase() + rawName.slice(1);
    if (!fields.has(fieldName) && !isJavaBuiltinSetter(rawName)) {
      fields.set(fieldName, { name: fieldName, type: inferTypeFromName(fieldName), source: "setter" });
    }
  }

  // Pattern 3: voOut.set("fieldName", value) — map-style set
  const mapSetRegex = /(?:voOut|vo_out|output|envelope(?:Out)?)\s*\.\s*set\s*\(\s*"(\w+)"\s*,/g;
  while ((match = mapSetRegex.exec(rawSource)) !== null) {
    const fieldName = match[1];
    if (!fields.has(fieldName)) {
      fields.set(fieldName, { name: fieldName, type: inferTypeFromName(fieldName), source: "map-set" });
    }
  }

  // Pattern 4: builder.fieldName(value) — builder pattern (named or chained)
  const builderRegex = /(?:builder|responseBuilder|\w+\.builder\(\))\s*\.\s*([a-z]\w*)\s*\(/g;
  while ((match = builderRegex.exec(rawSource)) !== null) {
    const fieldName = match[1];
    if (!["build", "toString", "hashCode", "equals", "clone"].includes(fieldName)) {
      if (!fields.has(fieldName)) {
        fields.set(fieldName, { name: fieldName, type: inferTypeFromName(fieldName), source: "builder" });
      }
    }
  }

  // Pattern 4b: chained builder calls — .xxx(value)\n.yyy(value) after a .builder() block
  // Detect all .fieldName( patterns that appear inside a builder chain
  if (/\.builder\(\)/.test(rawSource)) {
    const chainedRegex = /\)\s*\.\s*([a-z]\w*)\s*\(/g;
    while ((match = chainedRegex.exec(rawSource)) !== null) {
      const fieldName = match[1];
      if (!["build", "toString", "hashCode", "equals", "clone", "builder"].includes(fieldName)) {
        if (!fields.has(fieldName)) {
          fields.set(fieldName, { name: fieldName, type: inferTypeFromName(fieldName), source: "builder" });
        }
      }
    }
  }

  // Ajouter les champs standard de réponse s'ils ne sont pas déjà présents
  if (!fields.has("codeRetour")) {
    fields.set("codeRetour", { name: "codeRetour", type: "String", source: "standard" });
  }
  if (!fields.has("messageRetour")) {
    fields.set("messageRetour", { name: "messageRetour", type: "String", source: "standard" });
  }

  return [...fields.values()];
}

// ─── Génération des DTOs ────────────────────────────────────────────────────

/**
 * Dériver le nom de base du UseCase pour nommer les DTOs.
 * Ex: "ConsulterSoldeUC" → "ConsulterSolde"
 *     "CompteEJB_consulterSolde" → "ConsulterSolde"
 *     "TraitementMadHandler" → "TraitementMad"
 *     "InitierVirementHandler_initierVirement" → "InitierVirement"
 */
export function deriveBaseName(className: string): string {
  // Handler avec méthode : "XxxHandler_methodName" → capitalize(methodName)
  if (className.includes("_")) {
    const parts = className.split("_");
    const methodName = parts.slice(1).join("_");
    return methodName.charAt(0).toUpperCase() + methodName.slice(1);
  }

  // Suffixes à retirer
  return className
    .replace(/UC$/, "")
    .replace(/UseCase$/, "")
    .replace(/Handler$/, "")
    .replace(/EJB$/, "")
    .replace(/Bean$/, "")
    .replace(/Service$/, "");
}

/**
 * Générer les DTOs manquants pour les UseCases sans DTO explicite.
 * Retourne les DtoIR à ajouter au dtoMap et les fichiers Java générés.
 */
export function generateMissingDtos(
  useCases: UseCaseIR[],
  dtoMap: Map<string, DtoIR>,
  basePackage: string,
  basePath: string
): GeneratedDtoResult {
  const newDtos: DtoIR[] = [];
  const files: GeneratedFile[] = [];
  let fieldsExtracted = 0;
  let useCasesAnalyzed = 0;

  // Types génériques/legacy qui nécessitent un remplacement par un DTO typé
  const GENERIC_TYPES = new Set(["", "Object", "ValueObject", "Envelope", "Void", "void", "HashMap"]);

  for (const uc of useCases) {
    // Skip si le UseCase a déjà des DTOs dans le dtoMap
    const hasReqDto = uc.voInType && dtoMap.has(uc.voInType);
    const hasResDto = uc.voOutType && dtoMap.has(uc.voOutType);

    // Skip si les deux DTOs existent déjà
    if (hasReqDto && hasResDto) continue;

    // v8.5 FIX: Skip si voOutType est un type concret (pas générique)
    // Ex: voOutType="List<String>" → ne pas générer de ResponseDTO
    const voOutIsGeneric = GENERIC_TYPES.has(uc.voOutType || "");
    const voInIsGeneric = GENERIC_TYPES.has(uc.voInType || "");

    // Si le voOutType est concret et pas dans le dtoMap, c'est un type inféré (ex: List<String>)
    // On ne doit PAS le remplacer par un DTO généré
    if (!hasResDto && !voOutIsGeneric && uc.voOutType) continue;
    if (!hasReqDto && !voInIsGeneric && uc.voInType) continue;

    // v8.5 FIX: Skip si le UseCase a des methodParameters explicites
    // (les paramètres sont déjà propagés directement par service-gen)
    if (uc.methodParameters && uc.methodParameters.length > 0) continue;

    // v8.5 FIX: Skip si le rawSource contient un type retour concret (pas ValueObject/Object)
    // Ex: "public AuthResponseDTO handlePostConnexion(...)" → le type est déjà inféré
    if (uc.rawSource && hasConcreteReturnType(uc.rawSource)) continue;

    // Skip si pas de rawSource pour analyser
    if (!uc.rawSource || uc.rawSource.length < 30) continue;

    useCasesAnalyzed++;
    const baseName = deriveBaseName(uc.className);

    // ─── Générer RequestDTO si manquant ───
    if (!hasReqDto) {
      const inputFields = extractInputFields(uc.rawSource);
      if (inputFields.length > 0) {
        const reqClassName = `${baseName}RequestDTO`;
        const reqDtoIR: DtoIR = {
          className: reqClassName,
          packageName: `${basePackage}.dto`,
          direction: "in",
          xmlRootElement: "",
          implementsInterfaces: [],
          sourceFile: `generated-v8.5/${reqClassName}.java`,
          fields: inputFields.map(f => ({
            name: f.name,
            type: f.type,
            resolvedType: f.type,
            required: /^id|^code|^num|^reference|^rib|^iban|^nom/i.test(f.name),
            xmlElement: false,
            validationAnnotations: [],
            isEnum: false,
            isList: f.type.startsWith("List<"),
          })),
        };

        // Enregistrer dans le dtoMap avec la clé voInType originale
        const voInKey = uc.voInType || `${uc.className}_VoIn`;
        dtoMap.set(voInKey, reqDtoIR);
        // Aussi avec le nouveau nom pour les lookups par nom
        dtoMap.set(reqClassName, reqDtoIR);
        newDtos.push(reqDtoIR);

        // Mettre à jour le voInType du UseCase pour pointer vers le nouveau DTO
        (uc as any).voInType = voInKey;

        // Générer le fichier Java
        files.push(generateDtoFile(basePackage, basePath, reqDtoIR, true));
        fieldsExtracted += inputFields.length;
      }
    }

    // ─── Générer ResponseDTO si manquant ───
    if (!hasResDto) {
      const outputFields = extractOutputFields(uc.rawSource);
      if (outputFields.length > 0) {
        const resClassName = `${baseName}ResponseDTO`;
        const resDtoIR: DtoIR = {
          className: resClassName,
          packageName: `${basePackage}.dto`,
          direction: "out",
          xmlRootElement: "",
          implementsInterfaces: [],
          sourceFile: `generated-v8.5/${resClassName}.java`,
          fields: outputFields.map(f => ({
            name: f.name,
            type: f.type,
            resolvedType: f.type,
            required: false,
            xmlElement: false,
            validationAnnotations: [],
            isEnum: false,
            isList: f.type.startsWith("List<"),
          })),
        };

        // Enregistrer dans le dtoMap
        const voOutKey = uc.voOutType || `${uc.className}_VoOut`;
        dtoMap.set(voOutKey, resDtoIR);
        dtoMap.set(resClassName, resDtoIR);
        newDtos.push(resDtoIR);

        // Mettre à jour le voOutType du UseCase
        (uc as any).voOutType = voOutKey;

        // Générer le fichier Java
        files.push(generateDtoFile(basePackage, basePath, resDtoIR, false));
        fieldsExtracted += outputFields.length;
      }
    }
  }

  return {
    newDtos,
    files,
    stats: {
      useCasesAnalyzed,
      dtosGenerated: newDtos.length,
      fieldsExtracted,
    },
  };
}

// ─── Génération du fichier Java DTO ─────────────────────────────────────────

function generateDtoFile(
  basePackage: string,
  basePath: string,
  dto: DtoIR,
  isRequest: boolean
): GeneratedFile {
  const imports = new Set<string>();
  imports.add("import lombok.Data;");
  imports.add("import lombok.NoArgsConstructor;");
  imports.add("import lombok.AllArgsConstructor;");
  imports.add("import lombok.Builder;");

  const fieldLines: string[] = [];
  for (const field of dto.fields) {
    const javaType = resolveImports(field.type, imports);

    // Bean Validation pour les RequestDTO
    if (isRequest) {
      if (field.name === "codeRetour" || field.name === "messageRetour") continue; // pas dans request
      const validations = inferValidation(field.name, field.type, imports);
      for (const v of validations) fieldLines.push(`    ${v}`);
    }

    fieldLines.push(`    private ${javaType} ${field.name};`);
    fieldLines.push("");
  }

  return {
    path: `${basePath}/dto/${dto.className}.java`,
    category: "dto",
    content: `package ${basePackage}.dto;

${[...imports].sort().join("\n")}

/**
 * ${isRequest ? "Request" : "Response"} DTO for ${dto.className.replace(/(?:Request|Response)DTO$/, "")}.
 * Auto-generated from legacy source analysis by Compleo v8.5.
 * Fields extracted from ValueObject/Envelope access patterns.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ${dto.className} {

${fieldLines.join("\n")}
}
`,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapNodeTypeToJava(typeHint: string): string {
  const map: Record<string, string> = {
    String: "String",
    Int: "Integer",
    Integer: "Integer",
    Long: "Long",
    Double: "Double",
    Float: "Float",
    Boolean: "Boolean",
    Date: "LocalDate",
    BigDecimal: "BigDecimal",
    BigInteger: "BigInteger",
  };
  return map[typeHint] || "String";
}

function mapLegacyTypeToSpring(type: string): string {
  const map: Record<string, string> = {
    ValueObject: "Object",
    Envelope: "Object",
    int: "Integer",
    long: "Long",
    double: "Double",
    float: "Float",
    boolean: "Boolean",
    char: "Character",
  };
  return map[type] || type;
}

function isJavaBuiltinGetter(name: string): boolean {
  return ["Class", "HashCode", "String"].includes(name);
}

function isJavaBuiltinSetter(name: string): boolean {
  return false; // setters are almost always domain-specific
}

function isJavaAnnotation(token: string): boolean {
  return token.startsWith("@");
}

function resolveImports(type: string, imports: Set<string>): string {
  if (type === "BigDecimal") imports.add("import java.math.BigDecimal;");
  if (type === "BigInteger") imports.add("import java.math.BigInteger;");
  if (type === "LocalDate") imports.add("import java.time.LocalDate;");
  if (type === "LocalDateTime") imports.add("import java.time.LocalDateTime;");
  if (type === "Instant") imports.add("import java.time.Instant;");
  if (type.startsWith("List<")) imports.add("import java.util.List;");
  if (type.startsWith("Set<")) imports.add("import java.util.Set;");
  if (type.startsWith("Map<")) imports.add("import java.util.Map;");
  return type;
}

function inferValidation(fieldName: string, fieldType: string, imports: Set<string>): string[] {
  const annotations: string[] = [];

  // @NotNull pour les champs obligatoires
  if (/^id|^code|^num|^reference|^rib|^iban|^nom/i.test(fieldName)) {
    imports.add("import jakarta.validation.constraints.NotNull;");
    annotations.push("@NotNull");
  }

  // @NotBlank pour les String obligatoires
  if (fieldType === "String" && /^code|^nom|^reference|^rib|^iban/i.test(fieldName)) {
    imports.add("import jakarta.validation.constraints.NotBlank;");
    annotations.push("@NotBlank");
  }

  // @Positive pour les montants
  if (fieldType === "BigDecimal" && /montant|solde|amount|balance|prix|tarif/i.test(fieldName)) {
    imports.add("import jakarta.validation.constraints.Positive;");
    annotations.push("@Positive");
  }

  // @Size pour les codes
  if (fieldType === "String" && /^code/i.test(fieldName)) {
    imports.add("import jakarta.validation.constraints.Size;");
    annotations.push("@Size(max = 20)");
  }

  return annotations;
}

/**
 * Vérifie si le rawSource contient un type retour concret (pas ValueObject/Object/Envelope/void).
 * Ex: "public AuthResponseDTO handlePostConnexion(...)" → true
 * Ex: "public ValueObject execute(ValueObject voIn)" → false
 * Ex: "public List<String> getCartesActives(...)" → true
 */
function hasConcreteReturnType(rawSource: string): boolean {
  // Chercher le pattern "public <ReturnType> <methodName>("
  const methodRegex = /public\s+(\w[\w<>,\s]*?)\s+\w+\s*\(/;
  const match = methodRegex.exec(rawSource);
  if (!match) return false;

  const returnType = match[1].trim();
  const GENERIC_RETURN_TYPES = new Set([
    "void", "Void", "Object", "ValueObject", "Envelope", "HashMap",
  ]);

  return !GENERIC_RETURN_TYPES.has(returnType);
}
