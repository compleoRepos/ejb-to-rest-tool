/**
 * envelope-replacer.ts — Remplace le pattern Envelope XML par des DTOs Spring typés.
 *
 * Pattern legacy :
 *   Envelope envIn → envIn.getNodeAsString("flux/idClient")
 *   Envelope envOut → envOut.setNodeValue("flux/result", value)
 *
 * Pattern Spring :
 *   RequestDTO avec @RequestBody → dto.getIdClient()
 *   ResponseDTO avec @Builder     → ResponseDTO.builder().result(value).build()
 *
 * Le replacer analyse le corps des handlers pour :
 * 1. Extraire tous les getNodeAsString("flux/xxx") → champs du RequestDTO
 * 2. Extraire tous les setNodeValue("flux/xxx", v) → champs du ResponseDTO
 * 3. Générer les DTOs Request/Response correspondants
 * 4. Réécrire le corps de la méthode avec les DTOs
 *
 * @author Compleo
 * @since v8.3
 */

import type { GeneratedFile } from "../../spring/shared";

// ─── Types publics ──────────────────────────────────────────────────────────

export interface EnvelopeField {
  /** Chemin XPath (ex: "flux/idClient") */
  xpath: string;
  /** Nom du champ Java (ex: "idClient") */
  fieldName: string;
  /** Type Java inféré (ex: "String") */
  fieldType: string;
  /** Direction : input ou output */
  direction: "input" | "output";
}

export interface EnvelopeAnalysis {
  /** Nom du handler */
  handlerName: string;
  /** Champs d'entrée (getNodeAsString) */
  inputFields: EnvelopeField[];
  /** Champs de sortie (setNodeValue) */
  outputFields: EnvelopeField[];
  /** Nom du RequestDTO généré */
  requestDtoName: string;
  /** Nom du ResponseDTO généré */
  responseDtoName: string;
}

// ─── Analyse des Envelopes ──────────────────────────────────────────────────

/**
 * Analyser le corps d'un handler pour extraire les champs Envelope.
 */
export function analyzeEnvelope(handlerName: string, sourceCode: string): EnvelopeAnalysis {
  const inputFields = extractInputFields(sourceCode);
  const outputFields = extractOutputFields(sourceCode);

  // Dériver le nom du handler sans "Handler"
  const baseName = handlerName.replace(/Handler$/, "");

  return {
    handlerName,
    inputFields,
    outputFields,
    requestDtoName: baseName + "RequestDTO",
    responseDtoName: baseName + "ResponseDTO",
  };
}

/**
 * Générer les DTOs Request/Response à partir de l'analyse Envelope.
 */
export function generateEnvelopeDtos(
  analysis: EnvelopeAnalysis,
  basePackage: string,
  basePath: string
): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  if (analysis.inputFields.length > 0) {
    files.push({
      path: `${basePath}/dto/${analysis.requestDtoName}.java`,
      content: generateRequestDto(analysis, basePackage),
      category: "dto",
    });
  }

  if (analysis.outputFields.length > 0) {
    files.push({
      path: `${basePath}/dto/${analysis.responseDtoName}.java`,
      content: generateResponseDto(analysis, basePackage),
      category: "dto",
    });
  }

  return files;
}

/**
 * Réécrire le corps d'une méthode handler en remplaçant les appels Envelope
 * par des accès DTO typés.
 */
export function rewriteHandlerBody(
  body: string,
  analysis: EnvelopeAnalysis
): string {
  let rewritten = body;

  // Remplacer les getNodeAsString("flux/xxx") par request.getXxx()
  for (const field of analysis.inputFields) {
    const getterName = "get" + capitalize(field.fieldName);
    // Pattern: envIn.getNodeAsString("flux/xxx") ou env.getNodeAsString("flux/xxx")
    const pattern = new RegExp(
      `\\w+\\.getNodeAsString\\s*\\(\\s*"${escapeRegex(field.xpath)}"\\s*\\)`,
      "g"
    );
    rewritten = rewritten.replace(pattern, `request.${getterName}()`);
  }

  // Remplacer les setNodeValue("flux/xxx", value) par des commentaires
  // (le ResponseDTO sera construit dans le service)
  for (const field of analysis.outputFields) {
    const pattern = new RegExp(
      `\\w+\\.setNodeValue\\s*\\(\\s*"${escapeRegex(field.xpath)}"\\s*,\\s*[^)]+\\)\\s*;`,
      "g"
    );
    rewritten = rewritten.replace(
      pattern,
      `// → response.${field.fieldName} = ... ; // Migré depuis Envelope`
    );
  }

  // Remplacer les "new Envelope()" par des commentaires
  rewritten = rewritten.replace(
    /Envelope\s+\w+\s*=\s*new\s+Envelope\s*\(\s*\)\s*;/g,
    `// Envelope supprimée — utiliser ${analysis.responseDtoName}.builder()...build()`
  );

  // Remplacer les "return envOut" par un return DTO
  rewritten = rewritten.replace(
    /return\s+\w+\s*;\s*$/m,
    `return response; // Retourner ${analysis.responseDtoName}`
  );

  return rewritten;
}

// ─── Extraction des champs ──────────────────────────────────────────────────

function extractInputFields(source: string): EnvelopeField[] {
  const fields: EnvelopeField[] = [];
  const seen = new Set<string>();

  // Pattern: envIn.getNodeAsString("flux/xxx") ou getNodeAsString("xxx/yyy")
  const regex = /getNodeAsString\s*\(\s*"([^"]+)"\s*\)/g;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const xpath = match[1];
    if (seen.has(xpath)) continue;
    seen.add(xpath);

    const fieldName = xpathToFieldName(xpath);
    const fieldType = inferFieldType(source, xpath, fieldName);

    fields.push({
      xpath,
      fieldName,
      fieldType,
      direction: "input",
    });
  }

  return fields;
}

function extractOutputFields(source: string): EnvelopeField[] {
  const fields: EnvelopeField[] = [];
  const seen = new Set<string>();

  // Pattern: envOut.setNodeValue("flux/xxx", value)
  const regex = /setNodeValue\s*\(\s*"([^"]+)"\s*,/g;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const xpath = match[1];
    if (seen.has(xpath)) continue;
    seen.add(xpath);

    const fieldName = xpathToFieldName(xpath);

    fields.push({
      xpath,
      fieldName,
      fieldType: "String", // Default, most Envelope values are strings
      direction: "output",
    });
  }

  return fields;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convertir un chemin XPath en nom de champ Java.
 * "flux/idClient" → "idClient"
 * "flux/nom" → "nom"
 * "object/messageParams/active" → "active"
 */
function xpathToFieldName(xpath: string): string {
  const parts = xpath.split("/");
  const lastPart = parts[parts.length - 1];
  // Nettoyer les caractères non-Java
  return lastPart.replace(/[^a-zA-Z0-9]/g, "");
}

/**
 * Inférer le type Java d'un champ Envelope à partir du contexte d'utilisation.
 */
function inferFieldType(source: string, xpath: string, fieldName: string): string {
  // Chercher des patterns d'utilisation pour inférer le type
  const lowerName = fieldName.toLowerCase();

  // Montant, solde → BigDecimal
  if (/montant|solde|somme|plafond|amount/i.test(lowerName)) return "BigDecimal";

  // ID, sequence, count → Long
  if (/^id[A-Z]|^seq|count|nombre/i.test(lowerName)) return "Long";

  // Boolean patterns
  if (/^is[A-Z]|^has[A-Z]|active|enabled|flag/i.test(lowerName)) return "Boolean";

  // Date patterns
  if (/date|time|timestamp/i.test(lowerName)) return "String"; // Keep as String for safety

  // Default: String (Envelope is XML-based, most values are strings)
  return "String";
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Génération DTOs ────────────────────────────────────────────────────────

function generateRequestDto(analysis: EnvelopeAnalysis, basePackage: string): string {
  const fields = analysis.inputFields
    .map(f => {
      const annotation = f.fieldType === "BigDecimal"
        ? "    @jakarta.validation.constraints.NotNull\n"
        : "    @jakarta.validation.constraints.NotBlank\n";
      return `${annotation}    private ${f.fieldType} ${f.fieldName};`;
    })
    .join("\n\n");

  const imports = new Set<string>();
  imports.add("import lombok.Data;");
  imports.add("import lombok.Builder;");
  imports.add("import lombok.NoArgsConstructor;");
  imports.add("import lombok.AllArgsConstructor;");
  if (analysis.inputFields.some(f => f.fieldType === "BigDecimal")) {
    imports.add("import java.math.BigDecimal;");
  }

  return `package ${basePackage}.dto;

${[...imports].sort().join("\n")}

/**
 * ${analysis.requestDtoName} — DTO de requête.
 * Généré depuis les appels Envelope.getNodeAsString() du handler ${analysis.handlerName}.
 *
 * @author Compleo v8.3
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ${analysis.requestDtoName} {

${fields}
}
`;
}

function generateResponseDto(analysis: EnvelopeAnalysis, basePackage: string): string {
  const fields = analysis.outputFields
    .map(f => `    private ${f.fieldType} ${f.fieldName};`)
    .join("\n\n");

  return `package ${basePackage}.dto;

import lombok.Data;
import lombok.Builder;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

/**
 * ${analysis.responseDtoName} — DTO de réponse.
 * Généré depuis les appels Envelope.setNodeValue() du handler ${analysis.handlerName}.
 *
 * @author Compleo v8.3
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ${analysis.responseDtoName} {

${fields}
}
`;
}
