/**
 * DTO Generator — Generates Request/Response DTOs with Bean Validation.
 * Rules: R9 (strict types), R10 (Bean Validation inference).
 * Extracted from spring-generator.ts (v5.5).
 */

import type { DtoIR, EnumIR } from "../java-parser";
import { type GeneratedFile, inferBeanValidation, mapToSpringType } from "./shared";

export function generateDto(basePackage: string, basePath: string, dto: DtoIR, enums: EnumIR[], allDtos?: DtoIR[]): GeneratedFile {
  const enumNames = new Set(enums.map(e => e.className));
  // Build a mapping of original DTO names to their generated names
  const dtoNameMap = new Map<string, string>();
  if (allDtos) {
    for (const d of allDtos) {
      const generated = d.className
        .replace(/VoIn$/, "RequestDTO")
        .replace(/VoOut$/, "ResponseDTO")
        .replace(/Dto$/, "DTO");
      if (generated !== d.className) {
        dtoNameMap.set(d.className, generated);
      }
    }
  }

  const imports = new Set<string>();
  imports.add("import lombok.Data;");
  imports.add("import lombok.NoArgsConstructor;");
  imports.add("import lombok.AllArgsConstructor;");
  imports.add("import lombok.Builder;");

  const isRequest = dto.direction === "in";
  const newClassName = dto.className
    .replace(/VoIn$/, "RequestDTO")
    .replace(/VoOut$/, "ResponseDTO")
    .replace(/Dto$/, "DTO");

  const fieldLines: string[] = [];
  for (const field of dto.fields) {
    const annotations = isRequest ? inferBeanValidation(field, imports) : [];
    let inferredType = field.type;
    if (field.type === "String" && /^date/i.test(field.name)) {
      inferredType = "LocalDate";
    }
    // Normalize DTO type references (e.g., ReviewDto → ReviewDTO)
    inferredType = normalizeDtoTypeRefs(inferredType, dtoNameMap);
    const javaType = mapToSpringType(inferredType, field.isEnum, enumNames, imports);
    for (const a of annotations) fieldLines.push(a);
    fieldLines.push(`    private ${javaType} ${field.name};`);
    fieldLines.push("");
  }

  return {
    path: `${basePath}/dto/${newClassName}.java`,
    category: "dto",
    content: `package ${basePackage}.dto;

${[...imports].sort().join("\n")}

/**
 * ${isRequest ? "Request" : "Response"} DTO for ${dto.className}.
 * Auto-generated from legacy ${dto.className}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ${newClassName} {

${fieldLines.join("\n")}
}
`,
  };
}

/**
 * Normalize DTO type references in field types.
 * Handles both simple types (ReviewDto → ReviewDTO) and generic types (Set<ReviewDto> → Set<ReviewDTO>).
 */
function normalizeDtoTypeRefs(type: string, dtoNameMap: Map<string, string>): string {
  if (dtoNameMap.size === 0) return type;
  // Check if it's a generic type
  const genericMatch = type.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    const container = genericMatch[1];
    const inner = genericMatch[2];
    // Handle multi-type generics (Map<K, V>)
    const parts = inner.split(',').map(p => p.trim());
    const normalizedParts = parts.map(p => dtoNameMap.get(p) || p);
    return `${container}<${normalizedParts.join(', ')}>`;
  }
  // Simple type
  return dtoNameMap.get(type) || type;
}
