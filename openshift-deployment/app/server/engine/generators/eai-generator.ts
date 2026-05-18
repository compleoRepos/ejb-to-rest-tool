import type { CodeGenerator, DetectedComponent, EaiComponent, GeneratedFile, ValidationResult } from "../registry/types";

export class EaiGenerator implements CodeGenerator {
  readonly technology = "EAI_CUSTOM" as const;
  canGenerate(c: DetectedComponent): boolean { return c.technology === "EAI_CUSTOM"; }

  generate(component: DetectedComponent, _all: DetectedComponent[], basePackage: string): GeneratedFile[] {
    const c = component as EaiComponent;
    const files: GeneratedFile[] = [];
    const pp = basePackage.replace(/\./g, "/");
    const baseName = c.metadata.useCaseName.replace(/UC$/, "");
    const ctrlName = baseName + "Controller";
    const svcName = baseName + "Service";

    files.push({ path: `src/main/java/${pp}/controller/${ctrlName}.java`, content: this.genCtrl(c, ctrlName, svcName, basePackage), category: "controller", technology: "EAI_CUSTOM", sourceRef: c.filePath });
    files.push({ path: `src/main/java/${pp}/service/${svcName}.java`, content: this.genSvc(c, svcName, basePackage), category: "service", technology: "EAI_CUSTOM", sourceRef: c.filePath });
    return files;
  }

  validate(generated: GeneratedFile[]): ValidationResult { return { valid: true, errors: [], warnings: [] }; }

  private genCtrl(c: EaiComponent, ctrlName: string, svcName: string, pkg: string): string {
    const sf = svcName.charAt(0).toLowerCase() + svcName.slice(1);
    const path = "/api/" + c.metadata.domain.toLowerCase() + "/" + c.metadata.useCaseName.replace(/UC$/, "").toLowerCase();
    const voIn = c.metadata.voInType !== "Void" ? c.metadata.voInType : "";
    const voOut = c.metadata.voOutType !== "Void" ? c.metadata.voOutType : "Void";
    const bodyParam = voIn ? `@RequestBody ${voIn} request` : "";
    const callArg = voIn ? "request" : "";

    return `package ${pkg}.controller;\n\nimport ${pkg}.service.${svcName};\nimport lombok.RequiredArgsConstructor;\nimport org.springframework.http.ResponseEntity;\nimport org.springframework.web.bind.annotation.*;\nimport io.swagger.v3.oas.annotations.Operation;\n\n/** Controller migre depuis EAI UseCase: ${c.metadata.useCaseName}\n * Domaine: ${c.metadata.domain}\n * ${c.metadata.description || ""}\n */\n@RestController\n@RequestMapping("${path}")\n@RequiredArgsConstructor\npublic class ${ctrlName} {\n\n    private final ${svcName} ${sf};\n\n    @Operation(summary = "${c.metadata.description || c.metadata.useCaseName}")\n    @PostMapping\n    public ResponseEntity<${voOut}> execute(${bodyParam}) {\n        return ResponseEntity.ok(${sf}.execute(${callArg}));\n    }\n}\n`;
  }

  private genSvc(c: EaiComponent, svcName: string, pkg: string): string {
    const voIn = c.metadata.voInType !== "Void" ? c.metadata.voInType : "";
    const voOut = c.metadata.voOutType !== "Void" ? c.metadata.voOutType : "void";
    const param = voIn ? `${voIn} request` : "";
    const deps = c.metadata.injectedServices.map(s => `    // Dependance: ${s}`).join("\n");

    return `package ${pkg}.service;\n\nimport lombok.RequiredArgsConstructor;\nimport lombok.extern.slf4j.Slf4j;\nimport org.springframework.stereotype.Service;\nimport org.springframework.transaction.annotation.Transactional;\n\n/** Service migre depuis EAI UseCase: ${c.metadata.useCaseName}\n * Domaine: ${c.metadata.domain}\n */\n@Service\n@RequiredArgsConstructor\n@Slf4j\npublic class ${svcName} {\n\n${deps}\n\n    @Transactional\n    public ${voOut} execute(${param}) {\n        // TODO: Migrer la logique metier depuis ${c.metadata.useCaseName}\n        throw new UnsupportedOperationException("Migration en cours");\n    }\n}\n`;
  }
}
