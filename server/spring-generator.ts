/**
 * Spring Boot Code Generator — Generates a complete Spring Boot 3.2 project
 * from the EJB Project IR (Intermediate Representation).
 *
 * Generates: Controllers, Services, DTOs, Tests, Enums, Exceptions,
 * Validators, Config, Cloud (Docker, K8s), pom.xml, application.yml,
 * and a MIGRATION_REPORT.md.
 *
 * @author Hamza NORDINE
 */

import type {
  ProjectIR, UseCaseIR, DtoIR, DtoFieldIR, ServiceIR,
  EnumIR, ExceptionIR, ValidatorIR, RemoteInterfaceIR,
} from "./java-parser";

export interface GeneratedFile {
  path: string;
  content: string;
  category: "controller" | "service" | "dto" | "test" | "enum" | "exception" |
    "validator" | "config" | "cloud" | "pom" | "report" | "main" | "other";
}

export interface GenerationResult {
  files: GeneratedFile[];
  stats: GenerationStats;
  warnings: string[];
}

export interface GenerationStats {
  totalFiles: number;
  controllers: number;
  services: number;
  dtos: number;
  tests: number;
  enums: number;
  exceptions: number;
  validators: number;
  configFiles: number;
  cloudFiles: number;
  totalLinesGenerated: number;
}

// ─── Main Generator ─────────────────────────────────────────────────────────

export function generateSpringBootProject(ir: ProjectIR): GenerationResult {
  const files: GeneratedFile[] = [];
  const warnings: string[] = [];

  const basePackage = ir.groupId ? `${ir.groupId}.${ir.artifactId.replace(/-/g, "")}` : "com.example.app";
  const basePath = `src/main/java/${basePackage.replace(/\./g, "/")}`;
  const testPath = `src/test/java/${basePackage.replace(/\./g, "/")}`;

  // Group UseCases by domain
  const domainMap = new Map<string, UseCaseIR[]>();
  for (const uc of ir.useCases) {
    const domain = uc.domain || "general";
    if (!domainMap.has(domain)) domainMap.set(domain, []);
    domainMap.get(domain)!.push(uc);
  }

  // Build DTO lookup
  const dtoMap = new Map<string, DtoIR>();
  for (const dto of ir.dtos) {
    dtoMap.set(dto.className, dto);
  }

  // 1. Generate Main Application
  files.push(generateMainApplication(basePackage, basePath, ir));

  // 2. Generate DTOs (Request/Response)
  for (const dto of ir.dtos) {
    files.push(generateDto(basePackage, basePath, dto, ir.enums));
  }

  // 3. Generate Enums
  for (const en of ir.enums) {
    files.push(generateEnum(basePackage, basePath, en));
  }

  // 4. Generate Exceptions
  for (const ex of ir.exceptions) {
    files.push(generateException(basePackage, basePath, ex));
  }
  // Always generate GlobalExceptionHandler
  files.push(generateGlobalExceptionHandler(basePackage, basePath, ir.exceptions));

  // 5. Generate Validators
  for (const val of ir.validators) {
    files.push(generateValidator(basePackage, basePath, val));
  }

  // 6. Generate Services (one per domain)
  for (const [domain, useCases] of domainMap) {
    files.push(generateDomainService(basePackage, basePath, domain, useCases, dtoMap, ir));
  }

  // 7. Generate Controllers (one per domain)
  for (const [domain, useCases] of domainMap) {
    files.push(generateDomainController(basePackage, basePath, domain, useCases, dtoMap));
  }

  // 8. Generate Tests (one per controller)
  for (const [domain, useCases] of domainMap) {
    files.push(generateDomainControllerTest(basePackage, testPath, domain, useCases, dtoMap));
  }

  // 9. Generate Remote Service adapters
  for (const remote of ir.remoteInterfaces) {
    files.push(generateRemoteServiceAdapter(basePackage, basePath, remote));
  }

  // 10. Generate Config files
  files.push(generateApplicationYml(ir));
  files.push(generateApplicationProperties(ir));

  // 11. Generate Cloud files
  files.push(generateDockerfile(ir));
  files.push(generateDockerCompose(ir));
  files.push(generateK8sDeployment(ir));
  files.push(generateK8sService(ir));

  // 12. Generate pom.xml
  files.push(generatePomXml(ir, basePackage));

  // 13. Generate Migration Report
  files.push(generateMigrationReport(ir, domainMap, dtoMap));

  // Compute stats
  const stats: GenerationStats = {
    totalFiles: files.length,
    controllers: files.filter(f => f.category === "controller").length,
    services: files.filter(f => f.category === "service").length,
    dtos: files.filter(f => f.category === "dto").length,
    tests: files.filter(f => f.category === "test").length,
    enums: files.filter(f => f.category === "enum").length,
    exceptions: files.filter(f => f.category === "exception").length,
    validators: files.filter(f => f.category === "validator").length,
    configFiles: files.filter(f => f.category === "config").length,
    cloudFiles: files.filter(f => f.category === "cloud").length,
    totalLinesGenerated: files.reduce((sum, f) => sum + f.content.split("\n").length, 0),
  };

  return { files, stats, warnings };
}

// ─── Main Application ───────────────────────────────────────────────────────

function generateMainApplication(basePackage: string, basePath: string, ir: ProjectIR): GeneratedFile {
  const appName = toPascalCase(ir.artifactId) + "Application";
  return {
    path: `${basePath}/${appName}.java`,
    category: "main",
    content: `package ${basePackage};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * ${ir.projectName || ir.artifactId} — Spring Boot 3.2 Application.
 * Auto-generated from EJB legacy project by Compleo Modernizer.
 */
@SpringBootApplication
public class ${appName} {

    public static void main(String[] args) {
        SpringApplication.run(${appName}.class, args);
    }
}
`,
  };
}

// ─── DTO Generator ──────────────────────────────────────────────────────────

function generateDto(basePackage: string, basePath: string, dto: DtoIR, enums: EnumIR[]): GeneratedFile {
  const enumNames = new Set(enums.map(e => e.className));
  const imports = new Set<string>();
  imports.add("import lombok.Data;");
  imports.add("import lombok.NoArgsConstructor;");
  imports.add("import lombok.AllArgsConstructor;");

  // Determine if Request or Response
  const isRequest = dto.direction === "in";
  const suffix = isRequest ? "Request" : (dto.direction === "out" ? "Response" : "");
  const newClassName = dto.className.replace(/VoIn$/, "Request").replace(/VoOut$/, "Response").replace(/Dto$/, "DTO");

  const fieldLines: string[] = [];
  for (const field of dto.fields) {
    const annotations: string[] = [];

    if (field.required && isRequest) {
      if (field.type === "String") {
        imports.add("import jakarta.validation.constraints.NotBlank;");
        annotations.push("    @NotBlank");
      } else {
        imports.add("import jakarta.validation.constraints.NotNull;");
        annotations.push("    @NotNull");
      }
    }

    for (const va of field.validationAnnotations) {
      if (va.startsWith("ValidRIB") || va.startsWith("ValidIBAN")) {
        annotations.push(`    @${va}`);
      }
    }

    const javaType = mapToSpringType(field.type, field.isEnum, enumNames, imports);
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
@NoArgsConstructor
@AllArgsConstructor
public class ${newClassName} {

${fieldLines.join("\n")}
}
`,
  };
}

function mapToSpringType(rawType: string, isEnum: boolean, enumNames: Set<string>, imports: Set<string>): string {
  if (isEnum || enumNames.has(rawType)) return rawType;

  const typeMap: Record<string, { type: string; import?: string }> = {
    "String": { type: "String" },
    "int": { type: "int" },
    "Integer": { type: "Integer" },
    "long": { type: "long" },
    "Long": { type: "Long" },
    "double": { type: "double" },
    "Double": { type: "Double" },
    "float": { type: "float" },
    "Float": { type: "Float" },
    "boolean": { type: "boolean" },
    "Boolean": { type: "Boolean" },
    "BigDecimal": { type: "BigDecimal", import: "import java.math.BigDecimal;" },
    "BigInteger": { type: "BigInteger", import: "import java.math.BigInteger;" },
    "LocalDate": { type: "LocalDate", import: "import java.time.LocalDate;" },
    "LocalDateTime": { type: "LocalDateTime", import: "import java.time.LocalDateTime;" },
    "Date": { type: "LocalDateTime", import: "import java.time.LocalDateTime;" },
    "byte[]": { type: "byte[]" },
  };

  // Handle generics: List<X>, Set<X>, Map<K,V>
  const genericMatch = rawType.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    const container = genericMatch[1];
    const innerRaw = genericMatch[2];

    if (container === "List" || container === "ArrayList" || container === "LinkedList") {
      imports.add("import java.util.List;");
      const innerResolved = mapToSpringType(innerRaw.trim(), false, enumNames, imports);
      return `List<${innerResolved}>`;
    }
    if (container === "Set" || container === "HashSet" || container === "TreeSet") {
      imports.add("import java.util.Set;");
      const innerResolved = mapToSpringType(innerRaw.trim(), false, enumNames, imports);
      return `Set<${innerResolved}>`;
    }
    if (container === "Map" || container === "HashMap" || container === "TreeMap") {
      imports.add("import java.util.Map;");
      const parts = innerRaw.split(",").map(p => p.trim());
      if (parts.length === 2) {
        const k = mapToSpringType(parts[0], false, enumNames, imports);
        const v = mapToSpringType(parts[1], false, enumNames, imports);
        return `Map<${k}, ${v}>`;
      }
    }
    // Unknown generic — preserve as-is
    return rawType;
  }

  // Handle raw collection types without generics (fallback)
  if (rawType === "List" || rawType === "ArrayList") {
    imports.add("import java.util.List;");
    return "List<String>"; // Fallback
  }
  if (rawType === "Set" || rawType === "HashSet") {
    imports.add("import java.util.Set;");
    return "Set<String>";
  }
  if (rawType === "Map" || rawType === "HashMap") {
    imports.add("import java.util.Map;");
    return "Map<String, String>";
  }

  const baseType = rawType.replace(/\[\]$/, "").trim();
  const mapping = typeMap[baseType];
  if (mapping) {
    if (mapping.import) imports.add(mapping.import);
    if (rawType.endsWith("[]")) return mapping.type + "[]";
    return mapping.type;
  }

  // RULE: Never emit "Object" — preserve original type name
  // Unknown project types are preserved as-is (e.g., MagixResponse)
  return rawType;
}

// ─── Enum Generator ─────────────────────────────────────────────────────────

function generateEnum(basePackage: string, basePath: string, en: EnumIR): GeneratedFile {
  const values = en.values.map(v => `    ${v}`).join(",\n");
  return {
    path: `${basePath}/enums/${en.className}.java`,
    category: "enum",
    content: `package ${basePackage}.enums;

/**
 * Enum ${en.className}.
 * Preserved from legacy project.
 */
public enum ${en.className} {
${values}
}
`,
  };
}

// ─── Exception Generator ────────────────────────────────────────────────────

function generateException(basePackage: string, basePath: string, ex: ExceptionIR): GeneratedFile {
  return {
    path: `${basePath}/exception/${ex.className}.java`,
    category: "exception",
    content: `package ${basePackage}.exception;

/**
 * ${ex.className} — Business exception.
 * Migrated from legacy ${ex.extendsClass}.
 */
public class ${ex.className} extends RuntimeException {

    public ${ex.className}() {
        super();
    }

    public ${ex.className}(String message) {
        super(message);
    }

    public ${ex.className}(String message, Throwable cause) {
        super(message, cause);
    }
}
`,
  };
}

function generateGlobalExceptionHandler(basePackage: string, basePath: string, exceptions: ExceptionIR[]): GeneratedFile {
  const handlers = exceptions.map(ex => `
    @ExceptionHandler(${ex.className}.class)
    public ResponseEntity<ErrorResponse> handle${ex.className}(${ex.className} ex) {
        log.warn("Business exception: {}", ex.getMessage());
        return ResponseEntity.badRequest()
            .body(new ErrorResponse("BUSINESS_ERROR", ex.getMessage()));
    }`).join("\n");

  return {
    path: `${basePath}/exception/GlobalExceptionHandler.java`,
    category: "exception",
    content: `package ${basePackage}.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    public record ErrorResponse(String code, String message) {}
${handlers}

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneral(Exception ex) {
        log.error("Unexpected error", ex);
        return ResponseEntity.internalServerError()
            .body(new ErrorResponse("INTERNAL_ERROR", "An unexpected error occurred"));
    }
}
`,
  };
}

// ─── Validator Generator ────────────────────────────────────────────────────

function generateValidator(basePackage: string, basePath: string, val: ValidatorIR): GeneratedFile {
  if (val.className.endsWith("Validator")) {
    return {
      path: `${basePath}/validation/${val.className}.java`,
      category: "validator",
      content: `package ${basePackage}.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * ${val.className} — Custom validator for @${val.annotationName}.
 * Migrated from legacy project.
 */
public class ${val.className} implements ConstraintValidator<${val.annotationName}, String> {

    @Override
    public void initialize(${val.annotationName} constraintAnnotation) {
        // No-op
    }

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isBlank()) return true;
        // TODO: Implement validation logic from legacy code
        return value.length() >= 10;
    }
}
`,
    };
  }

  // Annotation
  return {
    path: `${basePath}/validation/${val.className}.java`,
    category: "validator",
    content: `package ${basePackage}.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.*;

/**
 * @${val.className} — Custom validation annotation.
 * Migrated from legacy project.
 */
@Documented
@Constraint(validatedBy = ${val.className.replace("Valid", "")}Validator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface ${val.className} {
    String message() default "Invalid value";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
`,
  };
}

// ─── Domain Service Generator ───────────────────────────────────────────────

function generateDomainService(
  basePackage: string, basePath: string, domain: string,
  useCases: UseCaseIR[], dtoMap: Map<string, DtoIR>, ir: ProjectIR
): GeneratedFile {
  const serviceName = toPascalCase(domain) + "Service";
  const imports = new Set<string>();
  imports.add("import lombok.RequiredArgsConstructor;");
  imports.add("import lombok.extern.slf4j.Slf4j;");
  imports.add("import org.springframework.stereotype.Service;");
  imports.add("import org.springframework.transaction.annotation.Transactional;");

  const methods: string[] = [];

  for (const uc of useCases) {
    const methodName = toMethodName(uc.className);
    const reqDto = dtoMap.get(uc.voInType);
    const resDto = dtoMap.get(uc.voOutType);

    const reqType = reqDto ? reqDto.className.replace(/VoIn$/, "Request").replace(/VoOut$/, "Response") : "Void";
    const resType = resDto ? resDto.className.replace(/VoIn$/, "Request").replace(/VoOut$/, "Response") : "Void";

    if (reqDto) imports.add(`import ${basePackage}.dto.${reqType};`);
    if (resDto) imports.add(`import ${basePackage}.dto.${resType};`);

    // Add transaction annotation if present
    let txAnnotation = "";
    if (uc.transactional) {
      if (uc.transactional.readOnly) {
        txAnnotation = "    @Transactional(readOnly = true)\n";
      } else {
        txAnnotation = "    @Transactional\n";
      }
    }

    // Generate method body based on UseCase logic
    const paramType = reqType !== "Void" ? `${reqType} request` : "";
    const returnType = resType !== "Void" ? resType : "void";

    methods.push(`
${txAnnotation}    /**
     * ${uc.className} — ${uc.bianDomain || domain} / ${uc.bianAction || methodName}.
     * Migrated from legacy UseCase: ${uc.className}
     */
    public ${returnType} ${methodName}(${paramType}) {
        log.info("=== Starting ${methodName} ===");
${generateServiceMethodBody(uc, reqDto, resDto, reqType, resType)}
        log.info("=== Ending ${methodName} ===");
${returnType !== "void" ? "        return response;" : ""}
    }`);
  }

  // Collect all injected services
  const allInjected = new Set<string>();
  for (const uc of useCases) {
    for (const svc of uc.injectedServices) {
      allInjected.add(svc.type);
    }
  }

  return {
    path: `${basePath}/service/${serviceName}.java`,
    category: "service",
    content: `package ${basePackage}.service;

${[...imports].sort().join("\n")}

/**
 * ${serviceName} — Domain service for ${domain}.
 * Contains ${useCases.length} migrated use case(s).
 * Auto-generated from EJB legacy project by Compleo Modernizer.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ${serviceName} {

    // TODO: Inject required dependencies
${[...allInjected].map(s => `    // private final ${s} ${s.charAt(0).toLowerCase() + s.slice(1)};`).join("\n")}
${methods.join("\n")}
}
`,
  };
}

function generateServiceMethodBody(
  uc: UseCaseIR, reqDto: DtoIR | undefined, resDto: DtoIR | undefined,
  reqType: string, resType: string
): string {
  const lines: string[] = [];

  if (resDto && resType !== "Void") {
    lines.push(`        ${resType} response = new ${resType}();`);

    // Map fields from request to response where names match
    if (reqDto) {
      for (const outField of resDto.fields) {
        const inField = reqDto.fields.find(f => f.name === outField.name);
        if (inField) {
          const getter = `request.get${capitalize(inField.name)}()`;
          lines.push(`        response.set${capitalize(outField.name)}(${getter});`);
        }
      }
    }

    // Set standard response fields
    for (const field of resDto.fields) {
      if (field.name === "codeRetour") {
        lines.push(`        response.setCodeRetour("00"); // OK`);
      } else if (field.name === "messageRetour") {
        lines.push(`        response.setMessageRetour("Operation completed successfully");`);
      }
    }
  }

  // Add TODO for business logic
  lines.push(`        // TODO: Implement business logic from legacy ${uc.className}`);

  return lines.join("\n");
}

// ─── Domain Controller Generator ────────────────────────────────────────────

function generateDomainController(
  basePackage: string, basePath: string, domain: string,
  useCases: UseCaseIR[], dtoMap: Map<string, DtoIR>
): GeneratedFile {
  const controllerName = toPascalCase(domain) + "Controller";
  const serviceName = toPascalCase(domain) + "Service";
  const serviceVar = domain + "Service";
  const imports = new Set<string>();
  imports.add("import lombok.RequiredArgsConstructor;");
  imports.add("import lombok.extern.slf4j.Slf4j;");
  imports.add("import org.springframework.http.ResponseEntity;");
  imports.add("import org.springframework.web.bind.annotation.*;");
  imports.add(`import ${basePackage}.service.${serviceName};`);

  const endpoints: string[] = [];

  for (const uc of useCases) {
    const methodName = toMethodName(uc.className);
    const reqDto = dtoMap.get(uc.voInType);
    const resDto = dtoMap.get(uc.voOutType);

    const reqType = reqDto ? reqDto.className.replace(/VoIn$/, "Request").replace(/VoOut$/, "Response") : null;
    const resType = resDto ? resDto.className.replace(/VoIn$/, "Request").replace(/VoOut$/, "Response") : "Void";

    if (reqType) imports.add(`import ${basePackage}.dto.${reqType};`);
    if (resType !== "Void") imports.add(`import ${basePackage}.dto.${resType};`);
    if (reqType) imports.add("import jakarta.validation.Valid;");

    const httpAnnotation = getHttpAnnotation(uc.httpMethod, methodName);
    const param = reqType ? `@Valid @RequestBody ${reqType} request` : "";
    const returnGeneric = resType !== "Void" ? resType : "Void";
    const serviceCall = reqType
      ? `${serviceVar}.${methodName}(request)`
      : `${serviceVar}.${methodName}()`;

    endpoints.push(`
    /**
     * ${uc.httpMethod} ${uc.restPath}
     * ${uc.bianDomain ? `BIAN: ${uc.bianDomain} / ${uc.bianAction}` : `UseCase: ${uc.className}`}
     */
    ${httpAnnotation}
    public ResponseEntity<${returnGeneric}> ${methodName}(${param}) {
        log.info("${uc.httpMethod} ${uc.restPath}");
        ${resType !== "Void" ? `${resType} result = ${serviceCall};` : `${serviceCall};`}
        return ResponseEntity.ok(${resType !== "Void" ? "result" : "null"});
    }`);
  }

  return {
    path: `${basePath}/controller/${controllerName}.java`,
    category: "controller",
    content: `package ${basePackage}.controller;

${[...imports].sort().join("\n")}

/**
 * ${controllerName} — REST API for ${domain} domain.
 * ${useCases.length} endpoint(s) migrated from EJB UseCases.
 * Auto-generated by Compleo Modernizer.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/${domain}")
@RequiredArgsConstructor
public class ${controllerName} {

    private final ${serviceName} ${serviceVar};
${endpoints.join("\n")}
}
`,
  };
}

function getHttpAnnotation(method: string, name: string): string {
  const kebab = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  switch (method) {
    case "GET": return `@GetMapping("/${kebab}")`;
    case "POST": return `@PostMapping("/${kebab}")`;
    case "PUT": return `@PutMapping("/${kebab}")`;
    case "DELETE": return `@DeleteMapping("/${kebab}")`;
    default: return `@PostMapping("/${kebab}")`;
  }
}

// ─── Test Generator ─────────────────────────────────────────────────────────

function generateDomainControllerTest(
  basePackage: string, testPath: string, domain: string,
  useCases: UseCaseIR[], dtoMap: Map<string, DtoIR>
): GeneratedFile {
  const controllerName = toPascalCase(domain) + "Controller";
  const serviceName = toPascalCase(domain) + "Service";

  const testMethods: string[] = [];

  for (const uc of useCases) {
    const methodName = toMethodName(uc.className);
    const reqDto = dtoMap.get(uc.voInType);
    const resDto = dtoMap.get(uc.voOutType);
    const reqType = reqDto ? reqDto.className.replace(/VoIn$/, "Request").replace(/VoOut$/, "Response") : null;

    const httpMethod = uc.httpMethod.toLowerCase();
    const kebab = methodName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    const url = `/api/v1/${domain}/${kebab}`;

    // Happy path test
    testMethods.push(`
    @Test
    @DisplayName("${uc.httpMethod} ${url} — happy path")
    void ${methodName}_shouldReturnOk() throws Exception {
        mockMvc.perform(${httpMethod}("${url}")${reqType ? `\n                .contentType(MediaType.APPLICATION_JSON)\n                .content("{}")` : ""})
                .andExpect(status().isOk());
    }`);

    // Validation error test (for POST/PUT with body)
    if (reqType && (uc.httpMethod === "POST" || uc.httpMethod === "PUT")) {
      testMethods.push(`
    @Test
    @DisplayName("${uc.httpMethod} ${url} — validation error")
    void ${methodName}_shouldReturnBadRequest_whenInvalid() throws Exception {
        mockMvc.perform(${httpMethod}("${url}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
                .andExpect(status().is4xxClientError());
    }`);
    }
  }

  return {
    path: `${testPath}/controller/${controllerName}Test.java`,
    category: "test",
    content: `package ${basePackage}.controller;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.bean.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import ${basePackage}.service.${serviceName};

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Tests for ${controllerName}.
 * Auto-generated by Compleo Modernizer.
 */
@WebMvcTest(${controllerName}.class)
class ${controllerName}Test {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ${serviceName} ${domain}Service;
${testMethods.join("\n")}
}
`,
  };
}

// ─── Remote Service Adapter ─────────────────────────────────────────────────

function generateRemoteServiceAdapter(basePackage: string, basePath: string, remote: RemoteInterfaceIR): GeneratedFile {
  const adapterName = remote.className.replace("Remote", "Adapter");
  const adapterImports = new Set<string>();
  const methods = remote.methods.map(m => {
    // Map parameter types through the Spring type mapper
    const params = m.parameters.map(p => {
      const mappedType = mapToSpringType(p.type, false, new Set(), adapterImports);
      return `${mappedType} ${p.name}`;
    }).join(", ");
    // Map return type
    const mappedReturn = mapToSpringType(m.returnType, false, new Set(), adapterImports);
    const roles = m.rolesAllowed.length > 0
      ? `\n    @PreAuthorize("hasAnyRole(${m.rolesAllowed.map(r => `'${r}'`).join(", ")})")`
      : "";
    return `${roles}
    public ${mappedReturn} ${m.name}(${params}) {
        // TODO: Implement ${m.name} — migrated from @Remote ${remote.className}
        throw new UnsupportedOperationException("Not yet implemented");
    }`;
  }).join("\n\n");

  return {
    path: `${basePath}/adapter/${adapterName}.java`,
    category: "service",
    content: `package ${basePackage}.adapter;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Component;

/**
 * ${adapterName} — Adapter for legacy @Remote interface ${remote.className}.
 * ${remote.methods.length} method(s) to implement.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ${adapterName} {

${methods}
}
`,
  };
}

// ─── Config Generators ──────────────────────────────────────────────────────

function generateApplicationYml(ir: ProjectIR): GeneratedFile {
  return {
    path: "src/main/resources/application.yml",
    category: "config",
    content: `# ${ir.projectName || ir.artifactId} — Spring Boot Configuration
# Auto-generated by Compleo Modernizer

spring:
  application:
    name: ${ir.artifactId}
  datasource:
    url: \${DATABASE_URL:jdbc:mysql://localhost:3306/${ir.artifactId.replace(/-/g, "_")}}
    username: \${DATABASE_USER:root}
    password: \${DATABASE_PASSWORD:}
    driver-class-name: com.mysql.cj.jdbc.Driver
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
    properties:
      hibernate:
        dialect: org.hibernate.dialect.MySQLDialect
        format_sql: true

server:
  port: \${PORT:8080}
  servlet:
    context-path: /

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics
  endpoint:
    health:
      show-details: when_authorized

logging:
  level:
    root: INFO
    ${ir.groupId || "com.example"}: DEBUG
`,
  };
}

function generateApplicationProperties(ir: ProjectIR): GeneratedFile {
  return {
    path: "src/main/resources/application.properties",
    category: "config",
    content: `# ${ir.projectName || ir.artifactId} — Spring Boot Properties
# Auto-generated by Compleo Modernizer
spring.application.name=${ir.artifactId}
`,
  };
}

function generateDockerfile(ir: ProjectIR): GeneratedFile {
  return {
    path: "Dockerfile",
    category: "cloud",
    content: `# ${ir.projectName || ir.artifactId} — Multi-stage Docker build
# Auto-generated by Compleo Modernizer

# Stage 1: Build
FROM eclipse-temurin:17-jdk-alpine AS builder
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN apk add --no-cache maven && mvn clean package -DskipTests

# Stage 2: Runtime
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar

# Security: non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
`,
  };
}

function generateDockerCompose(ir: ProjectIR): GeneratedFile {
  const serviceName = ir.artifactId;
  return {
    path: "docker-compose.yml",
    category: "cloud",
    content: `# ${ir.projectName || ir.artifactId} — Docker Compose
# Auto-generated by Compleo Modernizer
version: '3.8'

services:
  ${serviceName}:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=docker
      - DATABASE_URL=jdbc:mysql://mysql:3306/${serviceName.replace(/-/g, "_")}
      - DATABASE_USER=root
      - DATABASE_PASSWORD=root
    depends_on:
      mysql:
        condition: service_healthy

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: ${serviceName.replace(/-/g, "_")}
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mysql-data:
`,
  };
}

function generateK8sDeployment(ir: ProjectIR): GeneratedFile {
  return {
    path: "k8s/deployment.yaml",
    category: "cloud",
    content: `# ${ir.projectName || ir.artifactId} — Kubernetes Deployment
# Auto-generated by Compleo Modernizer
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${ir.artifactId}
  labels:
    app: ${ir.artifactId}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${ir.artifactId}
  template:
    metadata:
      labels:
        app: ${ir.artifactId}
    spec:
      containers:
        - name: ${ir.artifactId}
          image: ${ir.artifactId}:latest
          ports:
            - containerPort: 8080
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: "kubernetes"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: ${ir.artifactId}-secrets
                  key: database-url
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /actuator/health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /actuator/health
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 5
`,
  };
}

function generateK8sService(ir: ProjectIR): GeneratedFile {
  return {
    path: "k8s/service.yaml",
    category: "cloud",
    content: `# ${ir.projectName || ir.artifactId} — Kubernetes Service
# Auto-generated by Compleo Modernizer
apiVersion: v1
kind: Service
metadata:
  name: ${ir.artifactId}
spec:
  selector:
    app: ${ir.artifactId}
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
  type: ClusterIP
`,
  };
}

// ─── POM.xml Generator ──────────────────────────────────────────────────────

function generatePomXml(ir: ProjectIR, basePackage: string): GeneratedFile {
  return {
    path: "pom.xml",
    category: "pom",
    content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.5</version>
        <relativePath/>
    </parent>

    <groupId>${ir.groupId || "com.example"}</groupId>
    <artifactId>${ir.artifactId}</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <name>${ir.projectName || ir.artifactId}</name>
    <description>Modernized from EJB to Spring Boot 3.2 by Compleo Modernizer</description>

    <properties>
        <java.version>17</java.version>
    </properties>

    <dependencies>
        <!-- Spring Boot Starters -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>

        <!-- Database -->
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
        </dependency>

        <!-- Lombok -->
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>

        <!-- Test -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
`,
  };
}

// ─── Migration Report Generator ─────────────────────────────────────────────

function generateMigrationReport(
  ir: ProjectIR, domainMap: Map<string, UseCaseIR[]>, dtoMap: Map<string, DtoIR>
): GeneratedFile {
  const now = new Date().toISOString().split("T")[0];

  let useCaseTable = "| UseCase | Domain | HTTP | Endpoint | VoIn → Request | VoOut → Response |\n";
  useCaseTable += "|---------|--------|------|----------|----------------|------------------|\n";
  for (const uc of ir.useCases) {
    const reqName = uc.voInType.replace(/VoIn$/, "Request");
    const resName = uc.voOutType.replace(/VoOut$/, "Response");
    useCaseTable += `| ${uc.className} | ${uc.domain} | ${uc.httpMethod} | ${uc.restPath} | ${uc.voInType} → ${reqName} | ${uc.voOutType} → ${resName} |\n`;
  }

  let dtoTable = "| DTO Legacy | DTO Spring | Direction | Fields | Required |\n";
  dtoTable += "|------------|------------|-----------|--------|----------|\n";
  for (const dto of ir.dtos) {
    const newName = dto.className.replace(/VoIn$/, "Request").replace(/VoOut$/, "Response");
    const reqCount = dto.fields.filter(f => f.required).length;
    dtoTable += `| ${dto.className} | ${newName} | ${dto.direction} | ${dto.fields.length} | ${reqCount} |\n`;
  }

  const warnings = ir.warnings.length > 0
    ? ir.warnings.map(w => `- ⚠️ ${w}`).join("\n")
    : "No warnings detected.";

  return {
    path: "MIGRATION_REPORT.md",
    category: "report",
    content: `# Migration Report — ${ir.projectName || ir.artifactId}

**Generated by:** Compleo Modernizer v1.0
**Date:** ${now}
**Author:** Hamza NORDINE

## Executive Summary

This report documents the automated migration of the legacy EJB project **${ir.projectName || ir.artifactId}** (v${ir.version}) to a modern Spring Boot 3.2 application.

| Metric | Value |
|--------|-------|
| Source Files Analyzed | ${ir.stats.totalFiles} |
| Total Lines of Code | ${ir.stats.totalLines} |
| UseCases Migrated | ${ir.stats.useCaseCount} |
| DTOs Converted | ${ir.stats.dtoCount} |
| Services Generated | ${ir.stats.serviceCount} |
| Domains Identified | ${ir.stats.domainCount} |
| Enums Preserved | ${ir.stats.enumCount} |
| Exceptions Migrated | ${ir.stats.exceptionCount} |
| Validators Migrated | ${ir.stats.validatorCount} |
| Remote Interfaces Adapted | ${ir.stats.remoteInterfaceCount} |

## Technology Migration

| Legacy | Modern |
|--------|--------|
| EJB 3.x | Spring Boot 3.2 |
| @UseCase + BaseUseCase | @RestController + @Service |
| ValueObject / VoIn / VoOut | Lombok @Data DTOs |
| JAXB @XmlElement | Jakarta Validation |
| @Transactional (JTA) | @Transactional (Spring) |
| FwkRollbackException | @RestControllerAdvice |
| EaiLog | Slf4j @Slf4j |
| Maven EJB Plugin | Spring Boot Maven Plugin |
| JUnit 4 | JUnit 5 + MockMvc |

## UseCase → REST Endpoint Mapping

${useCaseTable}

## DTO Mapping

${dtoTable}

## Domains

${[...domainMap.entries()].map(([d, ucs]) => `- **${d}**: ${ucs.length} endpoint(s) — ${ucs.map(u => u.className).join(", ")}`).join("\n")}

## Warnings

${warnings}

## Next Steps

1. Implement business logic in generated Service methods (marked with TODO)
2. Configure database connection in application.yml
3. Run tests: \`mvn test\`
4. Build Docker image: \`docker build -t ${ir.artifactId} .\`
5. Deploy to Kubernetes: \`kubectl apply -f k8s/\`

## Files Generated

| Category | Count |
|----------|-------|
| Controllers | ${[...domainMap.keys()].length} |
| Services | ${[...domainMap.keys()].length} |
| DTOs | ${ir.dtos.length} |
| Tests | ${[...domainMap.keys()].length} |
| Enums | ${ir.enums.length} |
| Exceptions | ${ir.exceptions.length + 1} |
| Validators | ${ir.validators.length} |
| Config | 2 |
| Cloud | 4 |
| Total | ~${ir.dtos.length + ir.enums.length + ir.exceptions.length + ir.validators.length + [...domainMap.keys()].length * 3 + 8} |
`,
  };
}

// ─── Utility Functions ──────────────────────────────────────────────────────

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function toMethodName(className: string): string {
  // ActiverCarteUC -> activerCarte
  const name = className.replace(/UC$/, "");
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
