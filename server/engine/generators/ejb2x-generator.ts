import type { CodeGenerator, DetectedComponent, Ejb2xComponent, GeneratedFile, ValidationResult } from "../registry/types";

export class Ejb2xGenerator implements CodeGenerator {
  readonly technology = "EJB_2X" as const;
  canGenerate(c: DetectedComponent): boolean { return c.technology === "EJB_2X"; }

  generate(component: DetectedComponent, _all: DetectedComponent[], basePackage: string): GeneratedFile[] {
    const c = component as Ejb2xComponent;
    const files: GeneratedFile[] = [];
    const svcName = c.className.replace(/Bean$/, "") + "Service";
    const ctrlName = c.className.replace(/Bean$/, "") + "Controller";
    const pp = basePackage.replace(/\./g, "/");

    files.push({ path: `src/main/java/${pp}/service/${svcName}.java`, content: this.genSvc(c, svcName, basePackage), category: "service", technology: "EJB_2X", sourceRef: c.filePath });
    files.push({ path: `src/main/java/${pp}/controller/${ctrlName}.java`, content: this.genCtrl(c, ctrlName, svcName, basePackage), category: "controller", technology: "EJB_2X", sourceRef: c.filePath });
    files.push({ path: `src/test/java/${pp}/service/${svcName}Test.java`, content: this.genTest(svcName, basePackage), category: "test", technology: "EJB_2X", sourceRef: c.filePath });

    // Migration note for JNDI removal
    files.push({ path: `docs/migration-notes/${c.className}-migration.md`, content: this.genNote(c), category: "migration_note", technology: "EJB_2X", sourceRef: c.filePath });
    return files;
  }

  validate(generated: GeneratedFile[]): ValidationResult {
    return { valid: true, errors: [], warnings: [] };
  }

  private genSvc(c: Ejb2xComponent, svcName: string, pkg: string): string {
    const methods = c.metadata.businessMethods.map(m => {
      const params = m.params.map(p => p.type + " " + p.name).join(", ");
      return `    @Transactional\n    public ${m.returnType} ${m.name}(${params}) {\n        // TODO: Migrer la logique metier depuis ${c.className}.${m.name}\n        // Ancien EJB 2.x SessionBean - supprimer les callbacks de cycle de vie\n        throw new UnsupportedOperationException("Migration en cours");\n    }`;
    }).join("\n\n");

    return `package ${pkg}.service;\n\nimport lombok.RequiredArgsConstructor;\nimport lombok.extern.slf4j.Slf4j;\nimport org.springframework.stereotype.Service;\nimport org.springframework.transaction.annotation.Transactional;\n\n/**\n * Service migre depuis EJB 2.x SessionBean: ${c.className}\n * Interface Remote: ${c.metadata.remoteInterface || "N/A"}\n * Interface Home: ${c.metadata.homeInterface || "N/A"}\n * Les callbacks ejbCreate/ejbRemove/ejbActivate/ejbPassivate sont supprimes.\n * Le lookup JNDI est remplace par l'injection Spring.\n */\n@Service\n@RequiredArgsConstructor\n@Slf4j\npublic class ${svcName} {\n\n${methods}\n}\n`;
  }

  private genCtrl(c: Ejb2xComponent, ctrlName: string, svcName: string, pkg: string): string {
    const sf = svcName.charAt(0).toLowerCase() + svcName.slice(1);
    const methods = c.metadata.businessMethods.map(m => {
      const verb = this.inferVerb(m.name);
      const mapping = verb === "GET" ? "@GetMapping" : verb === "POST" ? "@PostMapping" : verb === "PUT" ? "@PutMapping" : "@DeleteMapping";
      const path = "/" + m.name.replace(/^(get|find|list|create|update|delete|supprimer|modifier|ajouter|consulter)/, "").toLowerCase();
      return `    ${mapping}("${path}")\n    public ResponseEntity<?> ${m.name}() {\n        return ResponseEntity.ok(${sf}.${m.name}());\n    }`;
    }).join("\n\n");

    return `package ${pkg}.controller;\n\nimport ${pkg}.service.${svcName};\nimport lombok.RequiredArgsConstructor;\nimport org.springframework.http.ResponseEntity;\nimport org.springframework.web.bind.annotation.*;\n\n@RestController\n@RequestMapping("/api/${c.className.replace(/Bean$/, "").toLowerCase()}")\n@RequiredArgsConstructor\npublic class ${ctrlName} {\n\n    private final ${svcName} ${sf};\n\n${methods}\n}\n`;
  }

  private genTest(svcName: string, pkg: string): string {
    return `package ${pkg}.service;\n\nimport org.junit.jupiter.api.Test;\nimport org.junit.jupiter.api.extension.ExtendWith;\nimport org.mockito.InjectMocks;\nimport org.mockito.junit.jupiter.MockitoExtension;\nimport static org.junit.jupiter.api.Assertions.*;\n\n@ExtendWith(MockitoExtension.class)\nclass ${svcName}Test {\n\n    @InjectMocks\n    private ${svcName} service;\n\n    @Test\n    void shouldBeInstantiated() {\n        assertNotNull(service);\n    }\n\n    @Test\n    void shouldThrowUnsupportedForUnmigratedMethods() {\n        assertThrows(UnsupportedOperationException.class, () -> {\n            // TODO: Appeler une methode metier\n        });\n    }\n}\n`;
  }

  private genNote(c: Ejb2xComponent): string {
    return `# Migration EJB 2.x: ${c.className}\n\n## Changements\n- **SessionBean** -> **@Service Spring**\n- **Interface Remote** (${c.metadata.remoteInterface || "N/A"}) -> Supprimee (appels locaux)\n- **Interface Home** (${c.metadata.homeInterface || "N/A"}) -> Supprimee (injection Spring)\n- **JNDI Lookup** -> **@Autowired / constructeur**\n- **ejb-jar.xml** -> Supprime (annotations Spring)\n\n## Callbacks supprimes\n- ejbCreate() -> @PostConstruct (si necessaire)\n- ejbRemove() -> @PreDestroy (si necessaire)\n- ejbActivate() / ejbPassivate() -> Supprimes (stateless)\n- setSessionContext() -> Supprime\n\n## Methodes metier\n${c.metadata.businessMethods.map(m => "- " + m.name + "(" + m.params.map(p => p.type).join(", ") + ") : " + m.returnType).join("\n")}\n`;
  }

  private inferVerb(name: string): string {
    const lower = name.toLowerCase();
    if (/^(get|find|list|consulter|chercher)/.test(lower)) return "GET";
    if (/^(delete|supprimer|remove)/.test(lower)) return "DELETE";
    if (/^(update|modifier|maj)/.test(lower)) return "PUT";
    return "POST";
  }
}
