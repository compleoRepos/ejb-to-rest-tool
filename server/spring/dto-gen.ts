/**
 * DTO Generator — Generates Request/Response DTOs with Bean Validation.
 * Rules: R9 (strict types), R10 (Bean Validation inference).
 * Extracted from spring-generator.ts (v5.5).
 */

import type { DtoIR, EnumIR } from "../java-parser";
import { type GeneratedFile, inferBeanValidation, mapToSpringType } from "./shared";

export function generateDto(basePackage: string, basePath: string, dto: DtoIR, enums: EnumIR[]): GeneratedFile {
  const enumNames = new Set(enums.map(e => e.className));
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
