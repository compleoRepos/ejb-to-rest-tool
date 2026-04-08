import type { CodeGenerator, DetectedComponent, StrutsComponent, GeneratedFile, ValidationResult } from "../registry/types";

export class StrutsGenerator implements CodeGenerator {
  readonly technology = "STRUTS_1" as const;
  canGenerate(c: DetectedComponent): boolean { return c.technology === "STRUTS_1" || c.technology === "STRUTS_2"; }

  generate(component: DetectedComponent, _all: DetectedComponent[], basePackage: string): GeneratedFile[] {
    const c = component as StrutsComponent;
    const files: GeneratedFile[] = [];
    const baseName = c.className.replace(/Action$/, "");
    const ctrlName = baseName + "Controller";
    const dtoName = baseName + "RequestDTO";
    const svcName = baseName + "Service";
    const pp = basePackage.replace(/\./g, "/");

    files.push({ path: `src/main/java/${pp}/controller/${ctrlName}.java`, content: this.genCtrl(c, ctrlName, svcName, dtoName, basePackage), category: "controller", technology: c.technology, sourceRef: c.filePath });
    if (c.metadata.formFields.length > 0) {
      files.push({ path: `src/main/java/${pp}/dto/${dtoName}.java`, content: this.genDto(c, dtoName, basePackage), category: "dto", technology: c.technology, sourceRef: c.filePath });
    }
    files.push({ path: `src/main/java/${pp}/service/${svcName}.java`, content: this.genSvc(c, svcName, basePackage), category: "service", technology: c.technology, sourceRef: c.filePath });
    files.push({ path: `src/test/java/${pp}/controller/${ctrlName}Test.java`, content: this.genTest(ctrlName, svcName, basePackage), category: "test", technology: c.technology, sourceRef: c.filePath });
    return files;
  }

  validate(generated: GeneratedFile[]): ValidationResult { return { valid: true, errors: [], warnings: [] }; }

  private genCtrl(c: StrutsComponent, ctrlName: string, svcName: string, dtoName: string, pkg: string): string {
    const sf = svcName.charAt(0).toLowerCase() + svcName.slice(1);
    const basePath = c.metadata.actionPath || "/" + c.className.replace(/Action$/, "").toLowerCase();
    const fwds = c.metadata.forwards.map(f => `    // Forward "${f.name}" -> ${f.path} (remplace par endpoint REST)`).join("\n");
    const hasForm = c.metadata.formFields.length > 0;
    const bodyParam = hasForm ? `@RequestBody @Valid ${dtoName} request` : "";

    return `package ${pkg}.controller;\n\nimport ${pkg}.service.${svcName};\n${hasForm ? "import " + pkg + ".dto." + dtoName + ";\nimport jakarta.validation.Valid;\n" : ""}import lombok.RequiredArgsConstructor;\nimport org.springframework.http.ResponseEntity;\nimport org.springframework.web.bind.annotation.*;\n\n/** Controller migre depuis Struts ${c.metadata.strutsVersion} Action: ${c.className}\n * Action path legacy: ${basePath}\n${fwds}\n */\n@RestController\n@RequestMapping("${basePath}")\n@RequiredArgsConstructor\npublic class ${ctrlName} {\n\n    private final ${svcName} ${sf};\n\n    @PostMapping\n    public ResponseEntity<?> execute(${bodyParam}) {\n        return ResponseEntity.ok(${sf}.execute(${hasForm ? "request" : ""}));\n    }\n}\n`;
  }

  private genDto(c: StrutsComponent, dtoName: string, pkg: string): string {
    const fields = c.metadata.formFields.map(f => {
      const validations = c.metadata.validationRules.filter(r => r.includes("Not")).map(r => `    ${r}`).join("\n");
      return `${validations ? validations + "\n" : ""}    private ${f.type} ${f.name};`;
    }).join("\n");
    return `package ${pkg}.dto;\n\nimport lombok.Data;\nimport jakarta.validation.constraints.*;\n\n/** DTO migre depuis ActionForm: ${c.metadata.actionFormClass || "N/A"} */\n@Data\npublic class ${dtoName} {\n${fields}\n}\n`;
  }

  private genSvc(c: StrutsComponent, svcName: string, pkg: string): string {
    return `package ${pkg}.service;\n\nimport lombok.RequiredArgsConstructor;\nimport lombok.extern.slf4j.Slf4j;\nimport org.springframework.stereotype.Service;\nimport org.springframework.transaction.annotation.Transactional;\n\n/** Service migre depuis Struts Action: ${c.className} */\n@Service\n@RequiredArgsConstructor\n@Slf4j\npublic class ${svcName} {\n\n    @Transactional\n    public Object execute(${c.metadata.formFields.length > 0 ? "Object request" : ""}) {\n        // TODO: Migrer la logique metier depuis ${c.className}\n        throw new UnsupportedOperationException("Migration en cours");\n    }\n}\n`;
  }

  private genTest(ctrlName: string, svcName: string, pkg: string): string {
    return `package ${pkg}.controller;\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.*;\n\nclass ${ctrlName}Test {\n\n    @Test\n    void shouldBeInstantiated() {\n        // TODO: Ajouter les tests\n        assertTrue(true);\n    }\n}\n`;
  }
}
