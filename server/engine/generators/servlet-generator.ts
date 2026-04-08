import type { CodeGenerator, DetectedComponent, ServletComponent, GeneratedFile, ValidationResult } from "../registry/types";

export class ServletGenerator implements CodeGenerator {
  readonly technology = "SERVLET" as const;
  canGenerate(c: DetectedComponent): boolean { return c.technology === "SERVLET"; }

  generate(component: DetectedComponent, _all: DetectedComponent[], basePackage: string): GeneratedFile[] {
    const c = component as ServletComponent;
    const files: GeneratedFile[] = [];
    const ctrl = c.className.replace(/Servlet$/, "") + "Controller";
    const svc = c.className.replace(/Servlet$/, "") + "Service";
    const basePath = this.inferBasePath(c);
    const pp = basePackage.replace(/\./g, "/");

    files.push({ path: `src/main/java/${pp}/controller/${ctrl}.java`, content: this.genCtrl(c, ctrl, svc, basePath, basePackage), category: "controller", technology: "SERVLET", sourceRef: c.filePath });
    files.push({ path: `src/main/java/${pp}/service/${svc}.java`, content: this.genSvc(c, svc, basePackage), category: "service", technology: "SERVLET", sourceRef: c.filePath });
    if (c.metadata.requestParams.length > 0) {
      const dto = c.className.replace(/Servlet$/, "") + "RequestDTO";
      files.push({ path: `src/main/java/${pp}/dto/${dto}.java`, content: this.genDto(c, dto, basePackage), category: "dto", technology: "SERVLET", sourceRef: c.filePath });
    }
    files.push({ path: `src/test/java/${pp}/controller/${ctrl}Test.java`, content: this.genTest(ctrl, svc, basePath, basePackage), category: "test", technology: "SERVLET", sourceRef: c.filePath });
    return files;
  }

  validate(generated: GeneratedFile[]): ValidationResult {
    const errors: { file: string; message: string; severity: "error" | "warning" }[] = [];
    const warnings: string[] = [];
    return { valid: true, errors, warnings };
  }

  private inferBasePath(c: ServletComponent): string {
    if (c.metadata.urlPatterns.length > 0) return c.metadata.urlPatterns[0].replace(/\/\*$/, "").replace(/\/$/, "") || "/api";
    return "/api/" + c.className.replace(/Servlet$/, "").toLowerCase() + "s";
  }

  private mn(doMethod: string): string { return doMethod.replace(/^do/, "handle"); }

  private genCtrl(c: ServletComponent, ctrl: string, svc: string, basePath: string, pkg: string): string {
    const sf = svc.charAt(0).toLowerCase() + svc.slice(1);
    const methods = c.metadata.methods.map(m => {
      const map = m.httpVerb === "GET" ? "@GetMapping" : m.httpVerb === "POST" ? "@PostMapping" : m.httpVerb === "PUT" ? "@PutMapping" : "@DeleteMapping";
      const params = c.metadata.requestParams.map(p => "@RequestParam String " + p.name).join(", ");
      const args = c.metadata.requestParams.map(p => p.name).join(", ");
      return `    /** Migre depuis ${c.className}.${m.name} */\n    ${map}\n    public ResponseEntity<?> ${this.mn(m.name)}(${params}) {\n        return ResponseEntity.ok(${sf}.${this.mn(m.name)}(${args}));\n    }`;
    }).join("\n\n");

    return `package ${pkg}.controller;\n\nimport ${pkg}.service.${svc};\nimport lombok.RequiredArgsConstructor;\nimport org.springframework.http.ResponseEntity;\nimport org.springframework.web.bind.annotation.*;\nimport io.swagger.v3.oas.annotations.tags.Tag;\n\n/** Controller REST migre depuis ${c.className}. URL legacy: ${c.metadata.urlPatterns.join(", ") || "N/A"} */\n@RestController\n@RequestMapping("${basePath}")\n@RequiredArgsConstructor\n@Tag(name = "${ctrl}")\npublic class ${ctrl} {\n\n    private final ${svc} ${sf};\n\n${methods}\n}\n`;
  }

  private genSvc(c: ServletComponent, svc: string, pkg: string): string {
    const methods = c.metadata.methods.map(m => {
      const isRead = m.httpVerb === "GET";
      const params = c.metadata.requestParams.map(p => "String " + p.name).join(", ");
      return `    @Transactional${isRead ? "(readOnly = true)" : ""}\n    public Object ${this.mn(m.name)}(${params}) {\n        // TODO: Migrer la logique metier de ${c.className}.${m.name}\n        throw new UnsupportedOperationException("Migration en cours");\n    }`;
    }).join("\n\n");

    let notes = "";
    if (c.metadata.usesSession) notes += "\n * NOTE: Le servlet original utilisait HttpSession - remplacer par un mecanisme stateless.";
    if (c.metadata.usesForward) notes += "\n * NOTE: Le servlet original utilisait RequestDispatcher.forward - remplacer par des appels REST.";

    return `package ${pkg}.service;\n\nimport lombok.RequiredArgsConstructor;\nimport lombok.extern.slf4j.Slf4j;\nimport org.springframework.stereotype.Service;\nimport org.springframework.transaction.annotation.Transactional;\n\n/** Service migre depuis ${c.className}.${notes} */\n@Service\n@RequiredArgsConstructor\n@Slf4j\npublic class ${svc} {\n\n${methods}\n}\n`;
  }

  private genDto(c: ServletComponent, dto: string, pkg: string): string {
    const fields = c.metadata.requestParams.map(p => `    private String ${p.name};`).join("\n");
    return `package ${pkg}.dto;\n\nimport lombok.Data;\nimport jakarta.validation.constraints.NotBlank;\n\n@Data\npublic class ${dto} {\n${fields}\n}\n`;
  }

  private genTest(ctrl: string, svc: string, basePath: string, pkg: string): string {
    return `package ${pkg}.controller;\n\nimport org.junit.jupiter.api.Test;\nimport org.springframework.beans.factory.annotation.Autowired;\nimport org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;\nimport org.springframework.boot.test.mock.bean.MockBean;\nimport org.springframework.test.web.servlet.MockMvc;\nimport ${pkg}.service.${svc};\n\nimport static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;\nimport static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;\n\n@WebMvcTest(${ctrl}.class)\nclass ${ctrl}Test {\n\n    @Autowired\n    private MockMvc mockMvc;\n\n    @MockBean\n    private ${svc} service;\n\n    @Test\n    void shouldReturn200() throws Exception {\n        mockMvc.perform(get("${basePath}"))\n            .andExpect(status().isOk());\n    }\n\n    @Test\n    void shouldReturn404WhenNotFound() throws Exception {\n        mockMvc.perform(get("${basePath}/nonexistent"))\n            .andExpect(status().isNotFound());\n    }\n\n    @Test\n    void shouldReturn400WhenInvalidInput() throws Exception {\n        mockMvc.perform(post("${basePath}").content("{}"))\n            .andExpect(status().isBadRequest());\n    }\n}\n`;
  }
}
