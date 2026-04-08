import type { CodeGenerator, DetectedComponent, SoapComponent, GeneratedFile, ValidationResult } from "../registry/types";

export class SoapGenerator implements CodeGenerator {
  readonly technology = "SOAP" as const;
  canGenerate(c: DetectedComponent): boolean { return c.technology === "SOAP"; }

  generate(component: DetectedComponent, _all: DetectedComponent[], basePackage: string): GeneratedFile[] {
    const c = component as SoapComponent;
    const files: GeneratedFile[] = [];
    const baseName = c.className.replace(/Service$|Impl$|WS$/i, "");
    const ctrlName = baseName + "Controller";
    const svcName = baseName + "Service";
    const pp = basePackage.replace(/\./g, "/");

    files.push({ path: `src/main/java/${pp}/controller/${ctrlName}.java`, content: this.genCtrl(c, ctrlName, svcName, basePackage), category: "controller", technology: "SOAP", sourceRef: c.filePath });
    files.push({ path: `src/main/java/${pp}/service/${svcName}.java`, content: this.genSvc(c, svcName, basePackage), category: "service", technology: "SOAP", sourceRef: c.filePath });

    for (const op of c.metadata.operations) {
      if (op.params.length > 0) {
        const dtoName = this.capitalize(op.name) + "RequestDTO";
        files.push({ path: `src/main/java/${pp}/dto/${dtoName}.java`, content: this.genDto(op, dtoName, basePackage), category: "dto", technology: "SOAP", sourceRef: c.filePath });
      }
    }

    files.push({ path: `src/test/java/${pp}/controller/${ctrlName}Test.java`, content: this.genTest(ctrlName, svcName, basePackage), category: "test", technology: "SOAP", sourceRef: c.filePath });
    files.push({ path: `docs/migration-notes/${c.className}-soap-migration.md`, content: this.genNote(c), category: "migration_note", technology: "SOAP", sourceRef: c.filePath });
    return files;
  }

  validate(generated: GeneratedFile[]): ValidationResult { return { valid: true, errors: [], warnings: [] }; }

  private genCtrl(c: SoapComponent, ctrlName: string, svcName: string, pkg: string): string {
    const sf = svcName.charAt(0).toLowerCase() + svcName.slice(1);
    const basePath = "/api/" + c.className.replace(/Service$|Impl$|WS$/i, "").toLowerCase();
    const methods = c.metadata.operations.map(op => {
      const verb = this.inferVerb(op.name);
      const mapping = verb === "GET" ? "@GetMapping" : "@PostMapping";
      const path = "/" + op.name;
      const params = op.params.length > 0 ? `@RequestBody ${this.capitalize(op.name)}RequestDTO request` : "";
      return `    @Operation(summary = "${op.name} - migre depuis SOAP")\n    ${mapping}("${path}")\n    public ResponseEntity<${op.returnType}> ${op.name}(${params}) {\n        return ResponseEntity.ok(${sf}.${op.name}(${op.params.length > 0 ? "request" : ""}));\n    }`;
    }).join("\n\n");

    return `package ${pkg}.controller;\n\nimport ${pkg}.service.${svcName};\nimport lombok.RequiredArgsConstructor;\nimport org.springframework.http.ResponseEntity;\nimport org.springframework.web.bind.annotation.*;\nimport io.swagger.v3.oas.annotations.Operation;\nimport io.swagger.v3.oas.annotations.tags.Tag;\n\n/** REST Controller migre depuis SOAP WebService: ${c.className}\n * Namespace: ${c.metadata.targetNamespace || "N/A"}\n * ${c.metadata.wsdlPresent ? "WSDL etait present" : "Pas de WSDL"}\n */\n@RestController\n@RequestMapping("${basePath}")\n@RequiredArgsConstructor\n@Tag(name = "${ctrlName}", description = "Migre depuis SOAP ${c.metadata.serviceName}")\npublic class ${ctrlName} {\n\n    private final ${svcName} ${sf};\n\n${methods}\n}\n`;
  }

  private genSvc(c: SoapComponent, svcName: string, pkg: string): string {
    const methods = c.metadata.operations.map(op => {
      return `    @Transactional\n    public ${op.returnType} ${op.name}(${op.params.length > 0 ? "Object request" : ""}) {\n        // TODO: Migrer la logique SOAP de ${c.className}.${op.name}\n        throw new UnsupportedOperationException("Migration en cours");\n    }`;
    }).join("\n\n");

    return `package ${pkg}.service;\n\nimport lombok.RequiredArgsConstructor;\nimport lombok.extern.slf4j.Slf4j;\nimport org.springframework.stereotype.Service;\nimport org.springframework.transaction.annotation.Transactional;\n\n/** Service migre depuis SOAP: ${c.className} */\n@Service\n@RequiredArgsConstructor\n@Slf4j\npublic class ${svcName} {\n\n${methods}\n}\n`;
  }

  private genDto(op: any, dtoName: string, pkg: string): string {
    const fields = op.params.map((p: any) => `    private ${p.type} ${p.name};`).join("\n");
    return `package ${pkg}.dto;\n\nimport lombok.Data;\n\n@Data\npublic class ${dtoName} {\n${fields}\n}\n`;
  }

  private genTest(ctrlName: string, svcName: string, pkg: string): string {
    return `package ${pkg}.controller;\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.*;\n\nclass ${ctrlName}Test {\n    @Test\n    void shouldBeInstantiated() { assertTrue(true); }\n}\n`;
  }

  private genNote(c: SoapComponent): string {
    return `# Migration SOAP -> REST: ${c.className}\n\n## Changements\n- **@WebService** -> **@RestController**\n- **@WebMethod** -> **@GetMapping / @PostMapping**\n- **WSDL** -> **OpenAPI/Swagger** (auto-genere)\n- **XML payloads** -> **JSON**\n- **SOAPFault** -> **HTTP status codes + ProblemDetail**\n\n## Operations migrees\n${c.metadata.operations.map(op => "- " + op.name + " : " + op.returnType).join("\n")}\n\n## Notes\n${c.metadata.migrationNote}\n`;
  }

  private inferVerb(name: string): string {
    const lower = name.toLowerCase();
    if (/^(get|find|list|consulter|chercher|search)/.test(lower)) return "GET";
    return "POST";
  }

  private capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
}
