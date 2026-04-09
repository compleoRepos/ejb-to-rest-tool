/**
 * Générateur Spring Boot depuis ServletComponent.
 * v5.10.0: Multi-route support — génère un endpoint par sous-route détectée.
 *
 * @author Hamza NORDINE
 */
import type { CodeGenerator, DetectedComponent, ServletComponent, GeneratedFile, ValidationResult, DetectedMethod } from "../registry/types";

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
    files.push({ path: `src/test/java/${pp}/controller/${ctrl}Test.java`, content: this.genTest(ctrl, svc, basePath, c.metadata.methods, basePackage), category: "test", technology: "SERVLET", sourceRef: c.filePath });
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

  /**
   * Nettoie un nom de méthode pour qu'il soit un identifiant Java valide.
   * Supprime les caractères invalides (/, -, .) et convertit en camelCase.
   * v5.10.1: FIX 4b — évite les noms comme handlePost/api/connexion.
   */
  private sanitizeJavaMethodName(name: string): string {
    // Si le nom contient des / ou des caractères non-Java, le nettoyer
    if (/[^a-zA-Z0-9_]/.test(name)) {
      return name
        .replace(/^\/+/, "")          // Supprimer slashes de début
        .split(/[\/\-.]/)              // Découper par / - .
        .filter(s => s.length > 0)     // Enlever les parties vides
        .filter(s => !/^v\d+$/.test(s))   // Enlever "v1", "v2"
        .filter(s => !/^\{.*\}$/.test(s)) // Enlever les {params}
        .filter(s => s !== "api")          // Enlever "api"
        .map((s, i) => i === 0
          ? s.charAt(0).toLowerCase() + s.slice(1)  // Premier segment en lowerCamelCase
          : s.charAt(0).toUpperCase() + s.slice(1))  // Suivants en UpperCamelCase
        .join("")
        .replace(/[^a-zA-Z0-9_]/g, "") // Supprimer tout caractère restant invalide
        || "handle";
    }
    return name;
  }

  /**
   * Détermine si une méthode a un urlPattern (multi-route).
   */
  private hasSubRoute(m: DetectedMethod): boolean {
    return !!m.urlPattern && m.urlPattern.length > 0;
  }

  private genCtrl(c: ServletComponent, ctrl: string, svc: string, basePath: string, pkg: string): string {
    const sf = svc.charAt(0).toLowerCase() + svc.slice(1);

    const methods = c.metadata.methods.map(m => {
      const map = m.httpVerb === "GET" ? "@GetMapping" : m.httpVerb === "POST" ? "@PostMapping" : m.httpVerb === "PUT" ? "@PutMapping" : "@DeleteMapping";
      const subPath = this.hasSubRoute(m) ? `("${m.urlPattern}")` : "";
      const params = c.metadata.requestParams.map(p => "@RequestParam String " + p.name).join(", ");
      const args = c.metadata.requestParams.map(p => p.name).join(", ");
      const rawHandlerName = this.hasSubRoute(m) ? m.name : this.mn(m.name);
      const handlerName = this.sanitizeJavaMethodName(rawHandlerName);

      return `    /** Migré depuis ${c.className}.${m.name}${m.urlPattern ? ` — route: ${m.urlPattern}` : ""} */
    ${map}${subPath}
    public ResponseEntity<?> ${handlerName}(${params}) {
        return ResponseEntity.ok(${sf}.${handlerName}(${args}));
    }`;
    }).join("\n\n");

    return `package ${pkg}.controller;

import ${pkg}.service.${svc};
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.tags.Tag;

/** Controller REST migré depuis ${c.className}. URL legacy: ${c.metadata.urlPatterns.join(", ") || "N/A"} */
@RestController
@RequestMapping("${basePath}")
@RequiredArgsConstructor
@Tag(name = "${ctrl}")
public class ${ctrl} {

    private final ${svc} ${sf};

${methods}
}
`;
  }

  private genSvc(c: ServletComponent, svc: string, pkg: string): string {
    const methods = c.metadata.methods.map(m => {
      const isRead = m.httpVerb === "GET";
      const params = c.metadata.requestParams.map(p => "String " + p.name).join(", ");
        const rawHandlerName = m.urlPattern ? m.name : this.mn(m.name);
      const handlerName = this.sanitizeJavaMethodName(rawHandlerName);

      return `    @Transactional${isRead ? "(readOnly = true)" : ""}
    public Object ${handlerName}(${params}) {
        // TODO: Migrer la logique métier de ${c.className}.${m.name}${m.urlPattern ? ` (route: ${m.urlPattern})` : ""}
        throw new UnsupportedOperationException("Migration en cours");
    }`;
    }).join("\n\n");

    let notes = "";
    if (c.metadata.usesSession) notes += "\n * NOTE: Le servlet original utilisait HttpSession — remplacer par un mécanisme stateless.";
    if (c.metadata.usesForward) notes += "\n * NOTE: Le servlet original utilisait RequestDispatcher.forward — remplacer par des appels REST.";

    return `package ${pkg}.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Service migré depuis ${c.className}.${notes} */
@Service
@RequiredArgsConstructor
@Slf4j
public class ${svc} {

${methods}
}
`;
  }

  private genDto(c: ServletComponent, dto: string, pkg: string): string {
    const fields = c.metadata.requestParams.map(p => `    private String ${p.name};`).join("\n");
    return `package ${pkg}.dto;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;

@Data
public class ${dto} {
${fields}
}
`;
  }

  private genTest(ctrl: string, svc: string, basePath: string, methods: DetectedMethod[], pkg: string): string {
    // Generate specific test methods for each endpoint
    const testMethods = methods.map((m, idx) => {
      const route = m.urlPattern ? basePath + m.urlPattern : basePath;
      const verb = m.httpVerb?.toLowerCase() || "get";
      const rawHandlerName = m.urlPattern ? m.name : this.mn(m.name);
      const handlerName = this.sanitizeJavaMethodName(rawHandlerName);

      return `    @Test
    void shouldReturn200For${handlerName.charAt(0).toUpperCase() + handlerName.slice(1)}() throws Exception {
        mockMvc.perform(${verb}("${route}"))
            .andExpect(status().isOk());
    }`;
    }).join("\n\n");

    return `package ${pkg}.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.bean.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import ${pkg}.service.${svc};

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(${ctrl}.class)
class ${ctrl}Test {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ${svc} service;

${testMethods}
}
`;
  }
}
