/**
 * Java Legacy Modernizer Platform — Générateur de code étendu.
 * Transforme toutes les technologies legacy détectées en code moderne :
 * - Servlets → Spring REST Controllers
 * - Struts → Spring MVC Controllers
 * - SOAP → REST API (OpenAPI)
 * - JDBC → Spring Data JPA Repositories
 * - Hibernate legacy → Spring Data JPA
 * - JMS/MQ → Kafka (Spring Kafka)
 * - Batch → Spring Batch
 * - EJB → Spring Services + WebClient
 *
 * @author Hamza NORDINE
 * @version 2.0.0
 */

import type {
  ExtendedAnalysisReport,
  ServletDetection,
  SoapDetection,
  JdbcDetection,
  HibernateDetection,
  BatchDetection,
  StrutsDetection,
  TechnologyDetection,
  LegacyTechnology,
} from "./legacy-analyzer";

// ============================================================
// Types
// ============================================================

export interface GeneratedFile {
  fileName: string;
  path: string;
  content: string;
  type: "controller" | "service" | "repository" | "dto" | "config" | "kafka" | "batch" | "test" | "cloud" | "exception" | "util" | "client" | "gateway";
  technology: string;
}

export interface ExtendedGenerationResult {
  files: GeneratedFile[];
  projectStructure: string;
  technologyMapping: TechnologyMappingEntry[];
}

export interface TechnologyMappingEntry {
  legacy: string;
  modern: string;
  filesGenerated: number;
  status: "complete" | "partial" | "manual";
}

// ============================================================
// Main Generation Function
// ============================================================

export function generateExtendedModernCode(
  report: ExtendedAnalysisReport,
  basePackage: string = "com.bank.modern"
): ExtendedGenerationResult {
  const files: GeneratedFile[] = [];
  const packagePath = basePackage.replace(/\./g, "/");
  const generatedPaths = new Set<string>();
  const technologyMapping: TechnologyMappingEntry[] = [];

  // 1. Servlets → Spring REST Controllers
  if (report.servletDetections.length > 0) {
    const servletFiles = generateServletToRest(report.servletDetections, basePackage, packagePath);
    for (const f of servletFiles) {
      if (!generatedPaths.has(f.path)) { files.push(f); generatedPaths.add(f.path); }
    }
    technologyMapping.push({
      legacy: "Servlets (HttpServlet)",
      modern: "Spring REST Controllers (@RestController)",
      filesGenerated: servletFiles.length,
      status: "complete",
    });
  }

  // 2. Struts → Spring MVC Controllers
  if (report.strutsDetections.length > 0) {
    const strutsFiles = generateStrutsToSpringMvc(report.strutsDetections, basePackage, packagePath);
    for (const f of strutsFiles) {
      if (!generatedPaths.has(f.path)) { files.push(f); generatedPaths.add(f.path); }
    }
    technologyMapping.push({
      legacy: "Struts (Action/ActionForm)",
      modern: "Spring MVC Controllers (@Controller)",
      filesGenerated: strutsFiles.length,
      status: "complete",
    });
  }

  // 3. SOAP → REST API
  if (report.soapDetections.length > 0) {
    const soapFiles = generateSoapToRest(report.soapDetections, basePackage, packagePath, report.className);
    for (const f of soapFiles) {
      if (!generatedPaths.has(f.path)) { files.push(f); generatedPaths.add(f.path); }
    }
    technologyMapping.push({
      legacy: "SOAP Web Services (JAX-WS)",
      modern: "REST API (Spring Web + OpenAPI)",
      filesGenerated: soapFiles.length,
      status: "complete",
    });
  }

  // 4. JDBC → Spring Data JPA
  if (report.jdbcDetections.length > 0) {
    const jdbcFiles = generateJdbcToJpa(report.jdbcDetections, basePackage, packagePath, report.className);
    for (const f of jdbcFiles) {
      if (!generatedPaths.has(f.path)) { files.push(f); generatedPaths.add(f.path); }
    }
    technologyMapping.push({
      legacy: "JDBC (Statement/PreparedStatement)",
      modern: "Spring Data JPA (Repository)",
      filesGenerated: jdbcFiles.length,
      status: "complete",
    });
  }

  // 5. Hibernate legacy → Spring Data JPA
  if (report.hibernateDetections.length > 0) {
    const hibFiles = generateHibernateToJpa(report.hibernateDetections, basePackage, packagePath, report.className);
    for (const f of hibFiles) {
      if (!generatedPaths.has(f.path)) { files.push(f); generatedPaths.add(f.path); }
    }
    technologyMapping.push({
      legacy: "Hibernate (Session/Criteria)",
      modern: "Spring Data JPA (Repository + Specifications)",
      filesGenerated: hibFiles.length,
      status: "complete",
    });
  }

  // 6. JMS/MQ → Kafka
  if (report.jmsDetections.length > 0) {
    const jmsFiles = generateJmsToKafka(report.jmsDetections, basePackage, packagePath, report.className);
    for (const f of jmsFiles) {
      if (!generatedPaths.has(f.path)) { files.push(f); generatedPaths.add(f.path); }
    }
    technologyMapping.push({
      legacy: "JMS / IBM MQ",
      modern: "Apache Kafka (Spring Kafka)",
      filesGenerated: jmsFiles.length,
      status: "complete",
    });
  }

  // 7. Batch → Spring Batch
  if (report.batchDetections.length > 0) {
    const batchFiles = generateBatchToSpringBatch(report.batchDetections, basePackage, packagePath, report.className);
    for (const f of batchFiles) {
      if (!generatedPaths.has(f.path)) { files.push(f); generatedPaths.add(f.path); }
    }
    technologyMapping.push({
      legacy: "Java Batch (JSR 352)",
      modern: "Spring Batch",
      filesGenerated: batchFiles.length,
      status: "complete",
    });
  }

  // 8. EJB → Spring Services + WebClient (existing logic, simplified here)
  if (report.ejbDetections.length > 0) {
    const ejbFiles = generateEjbToSpring(report.ejbDetections, basePackage, packagePath, report.className);
    for (const f of ejbFiles) {
      if (!generatedPaths.has(f.path)) { files.push(f); generatedPaths.add(f.path); }
    }
    technologyMapping.push({
      legacy: "EJB (@Stateless/@Stateful/JNDI)",
      modern: "Spring Boot Services + WebClient",
      filesGenerated: ejbFiles.length,
      status: "complete",
    });
  }

  // 9. Common infrastructure files
  const infraFiles = generateInfrastructure(basePackage, packagePath, report);
  for (const f of infraFiles) {
    if (!generatedPaths.has(f.path)) { files.push(f); generatedPaths.add(f.path); }
  }

  const projectStructure = buildProjectStructure(files);

  return { files, projectStructure, technologyMapping };
}

// ============================================================
// Servlet → Spring REST Controller
// ============================================================

function generateServletToRest(
  detections: ServletDetection[],
  basePackage: string,
  packagePath: string
): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  for (const servlet of detections) {
    const controllerName = servlet.className.replace(/Servlet$/, "") + "Controller";
    const basePath = servlet.urlPattern.replace(/\/\*$/, "") || "/api";

    let code = `package ${basePackage}.controller;\n\n`;
    code += `import ${basePackage}.dto.*;\n`;
    code += `import ${basePackage}.service.*;\n`;
    code += `import io.swagger.v3.oas.annotations.Operation;\n`;
    code += `import io.swagger.v3.oas.annotations.tags.Tag;\n`;
    code += `import lombok.RequiredArgsConstructor;\n`;
    code += `import lombok.extern.slf4j.Slf4j;\n`;
    code += `import org.springframework.http.ResponseEntity;\n`;
    code += `import org.springframework.web.bind.annotation.*;\n\n`;
    code += `/**\n`;
    code += ` * REST Controller remplacant le Servlet ${servlet.className}.\n`;
    code += ` * URL pattern original : ${servlet.urlPattern}\n`;
    code += ` *\n`;
    code += ` * @author Hamza NORDINE\n`;
    code += ` */\n`;
    code += `@RestController\n`;
    code += `@RequestMapping("${basePath}")\n`;
    code += `@Tag(name = "${controllerName}", description = "API migree depuis ${servlet.className}")\n`;
    code += `@Slf4j\n`;
    code += `@RequiredArgsConstructor\n`;
    code += `public class ${controllerName} {\n\n`;

    for (const method of servlet.httpMethods) {
      switch (method) {
        case "GET":
          code += `    @GetMapping\n`;
          code += `    @Operation(summary = "GET - Migre depuis doGet()")\n`;
          code += `    public ResponseEntity<?> handleGet(\n`;
          code += `            @RequestParam(required = false) Map<String, String> params) {\n`;
          code += `        log.info("GET ${basePath} avec params: {}", params);\n`;
          code += `        // TODO: Migrer la logique de doGet()\n`;
          code += `        return ResponseEntity.ok().build();\n`;
          code += `    }\n\n`;
          break;
        case "POST":
          code += `    @PostMapping\n`;
          code += `    @Operation(summary = "POST - Migre depuis doPost()")\n`;
          code += `    public ResponseEntity<?> handlePost(\n`;
          code += `            @RequestBody Map<String, Object> body) {\n`;
          code += `        log.info("POST ${basePath}");\n`;
          code += `        // TODO: Migrer la logique de doPost()\n`;
          code += `        return ResponseEntity.ok().build();\n`;
          code += `    }\n\n`;
          break;
        case "PUT":
          code += `    @PutMapping("/{id}")\n`;
          code += `    @Operation(summary = "PUT - Migre depuis doPut()")\n`;
          code += `    public ResponseEntity<?> handlePut(\n`;
          code += `            @PathVariable Long id,\n`;
          code += `            @RequestBody Map<String, Object> body) {\n`;
          code += `        log.info("PUT ${basePath}/{}", id);\n`;
          code += `        // TODO: Migrer la logique de doPut()\n`;
          code += `        return ResponseEntity.ok().build();\n`;
          code += `    }\n\n`;
          break;
        case "DELETE":
          code += `    @DeleteMapping("/{id}")\n`;
          code += `    @Operation(summary = "DELETE - Migre depuis doDelete()")\n`;
          code += `    public ResponseEntity<?> handleDelete(@PathVariable Long id) {\n`;
          code += `        log.info("DELETE ${basePath}/{}", id);\n`;
          code += `        // TODO: Migrer la logique de doDelete()\n`;
          code += `        return ResponseEntity.noContent().build();\n`;
          code += `    }\n\n`;
          break;
      }
    }

    code += `}\n`;

    files.push({
      fileName: `${controllerName}.java`,
      path: `src/main/java/${packagePath}/controller/${controllerName}.java`,
      content: code,
      type: "controller",
      technology: "servlet",
    });
  }

  return files;
}

// ============================================================
// Struts → Spring MVC Controller
// ============================================================

function generateStrutsToSpringMvc(
  detections: StrutsDetection[],
  basePackage: string,
  packagePath: string
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const processedClasses = new Set<string>();

  for (const struts of detections) {
    if (struts.type !== "action" || processedClasses.has(struts.className)) continue;
    processedClasses.add(struts.className);

    const controllerName = struts.className.replace(/Action$/, "") + "Controller";
    const basePath = struts.path || `/api/${camelToKebab(struts.className.replace(/Action$/, ""))}`;

    let code = `package ${basePackage}.controller;\n\n`;
    code += `import ${basePackage}.dto.*;\n`;
    code += `import ${basePackage}.service.*;\n`;
    code += `import io.swagger.v3.oas.annotations.Operation;\n`;
    code += `import io.swagger.v3.oas.annotations.tags.Tag;\n`;
    code += `import lombok.RequiredArgsConstructor;\n`;
    code += `import lombok.extern.slf4j.Slf4j;\n`;
    code += `import org.springframework.http.ResponseEntity;\n`;
    code += `import org.springframework.web.bind.annotation.*;\n\n`;
    code += `/**\n`;
    code += ` * Spring MVC Controller remplacant l'Action Struts ${struts.className}.\n`;
    code += ` * Path original : ${struts.path || "N/A"}\n`;
    code += ` *\n`;
    code += ` * @author Hamza NORDINE\n`;
    code += ` */\n`;
    code += `@RestController\n`;
    code += `@RequestMapping("${basePath}")\n`;
    code += `@Tag(name = "${controllerName}", description = "Migre depuis Struts Action ${struts.className}")\n`;
    code += `@Slf4j\n`;
    code += `@RequiredArgsConstructor\n`;
    code += `public class ${controllerName} {\n\n`;
    code += `    /**\n`;
    code += `     * Remplace la methode execute() de l'Action Struts.\n`;
    code += `     */\n`;
    code += `    @PostMapping\n`;
    code += `    @Operation(summary = "Execute - Migre depuis ${struts.className}.execute()")\n`;
    code += `    public ResponseEntity<?> execute(@RequestBody Map<String, Object> formData) {\n`;
    code += `        log.info("Execute ${controllerName} avec donnees: {}", formData);\n`;
    code += `        // TODO: Migrer la logique de execute() depuis ${struts.className}\n`;
    code += `        // Les ActionForward sont remplaces par des ResponseEntity\n`;
    code += `        return ResponseEntity.ok().build();\n`;
    code += `    }\n\n`;
    code += `    @GetMapping\n`;
    code += `    @Operation(summary = "Display - Page d'affichage")\n`;
    code += `    public ResponseEntity<?> display() {\n`;
    code += `        log.info("Display ${controllerName}");\n`;
    code += `        // TODO: Migrer la logique d'affichage\n`;
    code += `        return ResponseEntity.ok().build();\n`;
    code += `    }\n`;
    code += `}\n`;

    files.push({
      fileName: `${controllerName}.java`,
      path: `src/main/java/${packagePath}/controller/${controllerName}.java`,
      content: code,
      type: "controller",
      technology: "struts",
    });
  }

  return files;
}

// ============================================================
// SOAP → REST API
// ============================================================

function generateSoapToRest(
  detections: SoapDetection[],
  basePackage: string,
  packagePath: string,
  className: string
): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Group by service
  const serviceOps = new Map<string, SoapDetection[]>();
  for (const det of detections) {
    const svc = det.serviceName || className;
    const existing = serviceOps.get(svc) || [];
    existing.push(det);
    serviceOps.set(svc, existing);
  }

  for (const [serviceName, ops] of Array.from(serviceOps.entries())) {
    const controllerName = serviceName.replace(/Service$/, "").replace(/WS$/, "") + "RestController";
    const basePath = `/api/v1/${camelToKebab(serviceName.replace(/Service$/, "").replace(/WS$/, ""))}`;

    let code = `package ${basePackage}.controller;\n\n`;
    code += `import ${basePackage}.dto.*;\n`;
    code += `import ${basePackage}.service.*;\n`;
    code += `import io.swagger.v3.oas.annotations.Operation;\n`;
    code += `import io.swagger.v3.oas.annotations.tags.Tag;\n`;
    code += `import jakarta.validation.Valid;\n`;
    code += `import lombok.RequiredArgsConstructor;\n`;
    code += `import lombok.extern.slf4j.Slf4j;\n`;
    code += `import org.springframework.http.ResponseEntity;\n`;
    code += `import org.springframework.web.bind.annotation.*;\n\n`;
    code += `/**\n`;
    code += ` * REST Controller remplacant le Web Service SOAP ${serviceName}.\n`;
    code += ` * Les operations SOAP sont converties en endpoints REST.\n`;
    code += ` *\n`;
    code += ` * @author Hamza NORDINE\n`;
    code += ` */\n`;
    code += `@RestController\n`;
    code += `@RequestMapping("${basePath}")\n`;
    code += `@Tag(name = "${controllerName}", description = "REST API migree depuis SOAP ${serviceName}")\n`;
    code += `@Slf4j\n`;
    code += `@RequiredArgsConstructor\n`;
    code += `public class ${controllerName} {\n\n`;

    const methods = ops.filter(o => o.type === "method");
    if (methods.length > 0) {
      for (const op of methods) {
        const methodName = op.operationName || "execute";
        const httpMethod = inferHttpMethodFromSoap(methodName);
        const endpoint = camelToKebab(methodName);

        code += `    @${httpMethod === "GET" ? "GetMapping" : "PostMapping"}("/${endpoint}")\n`;
        code += `    @Operation(summary = "${methodName} - Migre depuis SOAP operation")\n`;
        code += `    public ResponseEntity<?> ${methodName}(`;
        if (httpMethod !== "GET") {
          code += `@Valid @RequestBody Map<String, Object> request`;
        }
        code += `) {\n`;
        code += `        log.info("${httpMethod} ${basePath}/${endpoint}");\n`;
        code += `        // TODO: Migrer la logique SOAP de ${op.operationName}\n`;
        code += `        // Les types JAXB sont remplaces par des DTOs Jackson\n`;
        code += `        return ResponseEntity.ok().build();\n`;
        code += `    }\n\n`;
      }
    } else {
      code += `    // TODO: Ajouter les endpoints REST correspondant aux operations SOAP\n`;
    }

    code += `}\n`;

    files.push({
      fileName: `${controllerName}.java`,
      path: `src/main/java/${packagePath}/controller/${controllerName}.java`,
      content: code,
      type: "controller",
      technology: "soap",
    });

    // Generate OpenAPI config
    const openApiConfig = generateOpenApiConfig(serviceName, basePath, basePackage, packagePath);
    files.push(openApiConfig);
  }

  return files;
}

function generateOpenApiConfig(serviceName: string, basePath: string, basePackage: string, packagePath: string): GeneratedFile {
  let code = `package ${basePackage}.config;\n\n`;
  code += `import io.swagger.v3.oas.models.OpenAPI;\n`;
  code += `import io.swagger.v3.oas.models.info.Info;\n`;
  code += `import io.swagger.v3.oas.models.info.Contact;\n`;
  code += `import org.springframework.context.annotation.Bean;\n`;
  code += `import org.springframework.context.annotation.Configuration;\n\n`;
  code += `/**\n`;
  code += ` * Configuration OpenAPI/Swagger remplacant le WSDL de ${serviceName}.\n`;
  code += ` *\n`;
  code += ` * @author Hamza NORDINE\n`;
  code += ` */\n`;
  code += `@Configuration\n`;
  code += `public class OpenApiConfig {\n\n`;
  code += `    @Bean\n`;
  code += `    public OpenAPI customOpenAPI() {\n`;
  code += `        return new OpenAPI()\n`;
  code += `                .info(new Info()\n`;
  code += `                        .title("${serviceName} REST API")\n`;
  code += `                        .version("1.0.0")\n`;
  code += `                        .description("API REST migree depuis le service SOAP ${serviceName}")\n`;
  code += `                        .contact(new Contact()\n`;
  code += `                                .name("Hamza NORDINE")\n`;
  code += `                                .email("hamza.nordine@compleo.com")));\n`;
  code += `    }\n`;
  code += `}\n`;

  return {
    fileName: "OpenApiConfig.java",
    path: `src/main/java/${packagePath}/config/OpenApiConfig.java`,
    content: code,
    type: "config",
    technology: "soap",
  };
}

// ============================================================
// JDBC → Spring Data JPA
// ============================================================

function generateJdbcToJpa(
  detections: JdbcDetection[],
  basePackage: string,
  packagePath: string,
  className: string
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const entityName = className.replace(/DAO$/, "").replace(/Repository$/, "").replace(/Service$/, "");
  const repoName = entityName + "Repository";

  // Entity
  let entityCode = `package ${basePackage}.entity;\n\n`;
  entityCode += `import jakarta.persistence.*;\n`;
  entityCode += `import lombok.*;\n`;
  entityCode += `import org.springframework.data.annotation.CreatedDate;\n`;
  entityCode += `import org.springframework.data.annotation.LastModifiedDate;\n`;
  entityCode += `import org.springframework.data.jpa.domain.support.AuditingEntityListener;\n\n`;
  entityCode += `import java.time.LocalDateTime;\n\n`;
  entityCode += `/**\n`;
  entityCode += ` * Entite JPA remplacant les requetes JDBC manuelles de ${className}.\n`;
  entityCode += ` *\n`;
  entityCode += ` * @author Hamza NORDINE\n`;
  entityCode += ` */\n`;
  entityCode += `@Entity\n`;
  entityCode += `@Table(name = "${camelToSnake(entityName)}")\n`;
  entityCode += `@EntityListeners(AuditingEntityListener.class)\n`;
  entityCode += `@Data\n`;
  entityCode += `@Builder\n`;
  entityCode += `@NoArgsConstructor\n`;
  entityCode += `@AllArgsConstructor\n`;
  entityCode += `public class ${entityName} {\n\n`;
  entityCode += `    @Id\n`;
  entityCode += `    @GeneratedValue(strategy = GenerationType.IDENTITY)\n`;
  entityCode += `    private Long id;\n\n`;

  // Extract columns from SQL queries
  const columns = extractColumnsFromSql(detections);
  for (const col of columns) {
    entityCode += `    @Column(name = "${col.snakeName}")\n`;
    entityCode += `    private ${col.javaType} ${col.camelName};\n\n`;
  }

  entityCode += `    @CreatedDate\n`;
  entityCode += `    @Column(name = "created_at", updatable = false)\n`;
  entityCode += `    private LocalDateTime createdAt;\n\n`;
  entityCode += `    @LastModifiedDate\n`;
  entityCode += `    @Column(name = "updated_at")\n`;
  entityCode += `    private LocalDateTime updatedAt;\n`;
  entityCode += `}\n`;

  files.push({
    fileName: `${entityName}.java`,
    path: `src/main/java/${packagePath}/entity/${entityName}.java`,
    content: entityCode,
    type: "repository",
    technology: "jdbc",
  });

  // Repository
  let repoCode = `package ${basePackage}.repository;\n\n`;
  repoCode += `import ${basePackage}.entity.${entityName};\n`;
  repoCode += `import org.springframework.data.jpa.repository.JpaRepository;\n`;
  repoCode += `import org.springframework.data.jpa.repository.JpaSpecificationExecutor;\n`;
  repoCode += `import org.springframework.data.jpa.repository.Query;\n`;
  repoCode += `import org.springframework.stereotype.Repository;\n\n`;
  repoCode += `import java.util.List;\n`;
  repoCode += `import java.util.Optional;\n\n`;
  repoCode += `/**\n`;
  repoCode += ` * Repository Spring Data JPA remplacant les requetes JDBC de ${className}.\n`;
  repoCode += ` *\n`;
  repoCode += ` * @author Hamza NORDINE\n`;
  repoCode += ` */\n`;
  repoCode += `@Repository\n`;
  repoCode += `public interface ${repoName} extends JpaRepository<${entityName}, Long>, JpaSpecificationExecutor<${entityName}> {\n\n`;

  // Generate query methods from detected SQL
  const queries = detections.filter(d => d.sql);
  for (const q of queries) {
    if (q.sql.toLowerCase().includes("select")) {
      const whereMatch = q.sql.match(/where\s+(\w+)\s*=/i);
      if (whereMatch) {
        const param = snakeToCamel(whereMatch[1]);
        repoCode += `    /**\n`;
        repoCode += `     * Remplace : ${q.sql.substring(0, 60)}...\n`;
        repoCode += `     */\n`;
        repoCode += `    Optional<${entityName}> findBy${capitalize(param)}(String ${param});\n\n`;
      }
    }
  }

  repoCode += `    // TODO: Ajouter les methodes de requete correspondant aux SQL detectes\n`;
  repoCode += `}\n`;

  files.push({
    fileName: `${repoName}.java`,
    path: `src/main/java/${packagePath}/repository/${repoName}.java`,
    content: repoCode,
    type: "repository",
    technology: "jdbc",
  });

  // Service
  const serviceName = entityName + "Service";
  let svcCode = `package ${basePackage}.service;\n\n`;
  svcCode += `import ${basePackage}.entity.${entityName};\n`;
  svcCode += `import ${basePackage}.repository.${repoName};\n`;
  svcCode += `import lombok.RequiredArgsConstructor;\n`;
  svcCode += `import lombok.extern.slf4j.Slf4j;\n`;
  svcCode += `import org.springframework.stereotype.Service;\n`;
  svcCode += `import org.springframework.transaction.annotation.Transactional;\n\n`;
  svcCode += `import java.util.List;\n`;
  svcCode += `import java.util.Optional;\n\n`;
  svcCode += `/**\n`;
  svcCode += ` * Service remplacant la couche JDBC de ${className}.\n`;
  svcCode += ` *\n`;
  svcCode += ` * @author Hamza NORDINE\n`;
  svcCode += ` */\n`;
  svcCode += `@Service\n`;
  svcCode += `@Slf4j\n`;
  svcCode += `@RequiredArgsConstructor\n`;
  svcCode += `@Transactional\n`;
  svcCode += `public class ${serviceName} {\n\n`;
  svcCode += `    private final ${repoName} repository;\n\n`;
  svcCode += `    @Transactional(readOnly = true)\n`;
  svcCode += `    public List<${entityName}> findAll() {\n`;
  svcCode += `        return repository.findAll();\n`;
  svcCode += `    }\n\n`;
  svcCode += `    @Transactional(readOnly = true)\n`;
  svcCode += `    public Optional<${entityName}> findById(Long id) {\n`;
  svcCode += `        return repository.findById(id);\n`;
  svcCode += `    }\n\n`;
  svcCode += `    public ${entityName} save(${entityName} entity) {\n`;
  svcCode += `        log.info("Sauvegarde de ${entityName}: {}", entity);\n`;
  svcCode += `        return repository.save(entity);\n`;
  svcCode += `    }\n\n`;
  svcCode += `    public void deleteById(Long id) {\n`;
  svcCode += `        log.info("Suppression de ${entityName} id={}", id);\n`;
  svcCode += `        repository.deleteById(id);\n`;
  svcCode += `    }\n`;
  svcCode += `}\n`;

  files.push({
    fileName: `${serviceName}.java`,
    path: `src/main/java/${packagePath}/service/${serviceName}.java`,
    content: svcCode,
    type: "service",
    technology: "jdbc",
  });

  return files;
}

function extractColumnsFromSql(detections: JdbcDetection[]): { snakeName: string; camelName: string; javaType: string }[] {
  const columns: { snakeName: string; camelName: string; javaType: string }[] = [];
  const seen = new Set<string>();

  for (const det of detections) {
    if (!det.sql) continue;
    // Extract column names from SELECT
    const selectMatch = det.sql.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectMatch && selectMatch[1] !== "*") {
      const cols = selectMatch[1].split(",").map(c => c.trim().split(/\s+as\s+/i).pop()?.trim() || "");
      for (const col of cols) {
        const clean = col.replace(/[^a-zA-Z0-9_]/g, "");
        if (clean && !seen.has(clean.toLowerCase())) {
          seen.add(clean.toLowerCase());
          columns.push({
            snakeName: clean.toLowerCase(),
            camelName: snakeToCamel(clean),
            javaType: "String",
          });
        }
      }
    }
  }

  if (columns.length === 0) {
    columns.push({ snakeName: "name", camelName: "name", javaType: "String" });
    columns.push({ snakeName: "status", camelName: "status", javaType: "String" });
  }

  return columns;
}

// ============================================================
// Hibernate → Spring Data JPA
// ============================================================

function generateHibernateToJpa(
  detections: HibernateDetection[],
  basePackage: string,
  packagePath: string,
  className: string
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const entityName = className.replace(/DAO$/, "").replace(/Repository$/, "").replace(/Impl$/, "");
  const repoName = entityName + "Repository";

  let repoCode = `package ${basePackage}.repository;\n\n`;
  repoCode += `import ${basePackage}.entity.${entityName};\n`;
  repoCode += `import org.springframework.data.jpa.repository.JpaRepository;\n`;
  repoCode += `import org.springframework.data.jpa.repository.JpaSpecificationExecutor;\n`;
  repoCode += `import org.springframework.data.jpa.repository.Query;\n`;
  repoCode += `import org.springframework.data.repository.query.Param;\n`;
  repoCode += `import org.springframework.stereotype.Repository;\n\n`;
  repoCode += `import java.util.List;\n`;
  repoCode += `import java.util.Optional;\n\n`;
  repoCode += `/**\n`;
  repoCode += ` * Repository Spring Data JPA remplacant le DAO Hibernate ${className}.\n`;
  repoCode += ` * Les Criteria API sont remplacees par JpaSpecificationExecutor.\n`;
  repoCode += ` * Les HQL sont converties en @Query JPQL.\n`;
  repoCode += ` *\n`;
  repoCode += ` * @author Hamza NORDINE\n`;
  repoCode += ` */\n`;
  repoCode += `@Repository\n`;
  repoCode += `public interface ${repoName} extends JpaRepository<${entityName}, Long>, JpaSpecificationExecutor<${entityName}> {\n\n`;

  // Convert HQL queries to JPQL @Query
  const hqlQueries = detections.filter(d => d.type === "hql" && d.query);
  for (const hql of hqlQueries) {
    repoCode += `    /**\n`;
    repoCode += `     * Migre depuis HQL: ${hql.query.substring(0, 60)}\n`;
    repoCode += `     */\n`;
    repoCode += `    @Query("${hql.query}")\n`;
    repoCode += `    List<${entityName}> findByCustomQuery();\n\n`;
  }

  // Convert Criteria to Specification note
  const criteriaDetections = detections.filter(d => d.type === "criteria");
  if (criteriaDetections.length > 0) {
    repoCode += `    // Les Criteria Hibernate sont migrees vers JpaSpecificationExecutor.\n`;
    repoCode += `    // Utiliser Specification<${entityName}> pour les requetes dynamiques.\n`;
    repoCode += `    // Exemple : repository.findAll(Specification.where(spec1).and(spec2));\n\n`;
  }

  repoCode += `}\n`;

  files.push({
    fileName: `${repoName}.java`,
    path: `src/main/java/${packagePath}/repository/${repoName}.java`,
    content: repoCode,
    type: "repository",
    technology: "hibernate",
  });

  // Specification class for Criteria replacement
  if (criteriaDetections.length > 0) {
    let specCode = `package ${basePackage}.repository;\n\n`;
    specCode += `import ${basePackage}.entity.${entityName};\n`;
    specCode += `import org.springframework.data.jpa.domain.Specification;\n\n`;
    specCode += `/**\n`;
    specCode += ` * Specifications remplacant les Criteria Hibernate de ${className}.\n`;
    specCode += ` *\n`;
    specCode += ` * @author Hamza NORDINE\n`;
    specCode += ` */\n`;
    specCode += `public class ${entityName}Specifications {\n\n`;
    specCode += `    private ${entityName}Specifications() {}\n\n`;
    specCode += `    public static Specification<${entityName}> hasStatus(String status) {\n`;
    specCode += `        return (root, query, cb) -> cb.equal(root.get("status"), status);\n`;
    specCode += `    }\n\n`;
    specCode += `    public static Specification<${entityName}> nameLike(String name) {\n`;
    specCode += `        return (root, query, cb) -> cb.like(root.get("name"), "%" + name + "%");\n`;
    specCode += `    }\n\n`;
    specCode += `    // TODO: Ajouter les specifications correspondant aux Criteria detectes\n`;
    specCode += `}\n`;

    files.push({
      fileName: `${entityName}Specifications.java`,
      path: `src/main/java/${packagePath}/repository/${entityName}Specifications.java`,
      content: specCode,
      type: "repository",
      technology: "hibernate",
    });
  }

  return files;
}

// ============================================================
// JMS/MQ → Kafka
// ============================================================

function generateJmsToKafka(
  detections: TechnologyDetection[],
  basePackage: string,
  packagePath: string,
  className: string
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const baseName = className.replace(/Service$/, "").replace(/Bean$/, "").replace(/Listener$/, "");

  // Kafka Producer
  let producerCode = `package ${basePackage}.kafka;\n\n`;
  producerCode += `import lombok.RequiredArgsConstructor;\n`;
  producerCode += `import lombok.extern.slf4j.Slf4j;\n`;
  producerCode += `import org.springframework.kafka.core.KafkaTemplate;\n`;
  producerCode += `import org.springframework.kafka.support.SendResult;\n`;
  producerCode += `import org.springframework.stereotype.Service;\n\n`;
  producerCode += `import java.util.concurrent.CompletableFuture;\n\n`;
  producerCode += `/**\n`;
  producerCode += ` * Kafka Producer remplacant les JMS/MQ producers de ${className}.\n`;
  producerCode += ` * Les Queues JMS sont remplacees par des Topics Kafka.\n`;
  producerCode += ` *\n`;
  producerCode += ` * @author Hamza NORDINE\n`;
  producerCode += ` */\n`;
  producerCode += `@Service\n`;
  producerCode += `@Slf4j\n`;
  producerCode += `@RequiredArgsConstructor\n`;
  producerCode += `public class ${baseName}KafkaProducer {\n\n`;
  producerCode += `    private final KafkaTemplate<String, Object> kafkaTemplate;\n\n`;
  producerCode += `    private static final String TOPIC = "${camelToKebab(baseName)}-events";\n\n`;
  producerCode += `    /**\n`;
  producerCode += `     * Envoie un message sur le topic Kafka.\n`;
  producerCode += `     * Remplace : jmsContext.createProducer().send(queue, message)\n`;
  producerCode += `     */\n`;
  producerCode += `    public void sendMessage(String key, Object payload) {\n`;
  producerCode += `        log.info("Envoi Kafka sur topic {} avec cle {}", TOPIC, key);\n`;
  producerCode += `        CompletableFuture<SendResult<String, Object>> future =\n`;
  producerCode += `                kafkaTemplate.send(TOPIC, key, payload);\n\n`;
  producerCode += `        future.whenComplete((result, ex) -> {\n`;
  producerCode += `            if (ex != null) {\n`;
  producerCode += `                log.error("Erreur envoi Kafka: {}", ex.getMessage());\n`;
  producerCode += `            } else {\n`;
  producerCode += `                log.info("Message envoye sur partition {} offset {}",\n`;
  producerCode += `                        result.getRecordMetadata().partition(),\n`;
  producerCode += `                        result.getRecordMetadata().offset());\n`;
  producerCode += `            }\n`;
  producerCode += `        });\n`;
  producerCode += `    }\n`;
  producerCode += `}\n`;

  files.push({
    fileName: `${baseName}KafkaProducer.java`,
    path: `src/main/java/${packagePath}/kafka/${baseName}KafkaProducer.java`,
    content: producerCode,
    type: "kafka",
    technology: "jms",
  });

  // Kafka Consumer
  const hasListener = detections.some(d => d.pattern === "MessageDriven" || d.description.includes("MessageListener"));

  if (hasListener) {
    let consumerCode = `package ${basePackage}.kafka;\n\n`;
    consumerCode += `import lombok.RequiredArgsConstructor;\n`;
    consumerCode += `import lombok.extern.slf4j.Slf4j;\n`;
    consumerCode += `import org.apache.kafka.clients.consumer.ConsumerRecord;\n`;
    consumerCode += `import org.springframework.kafka.annotation.KafkaListener;\n`;
    consumerCode += `import org.springframework.kafka.support.Acknowledgment;\n`;
    consumerCode += `import org.springframework.stereotype.Service;\n\n`;
    consumerCode += `/**\n`;
    consumerCode += ` * Kafka Consumer remplacant le MessageDrivenBean de ${className}.\n`;
    consumerCode += ` * Le @MessageDriven est remplace par @KafkaListener.\n`;
    consumerCode += ` *\n`;
    consumerCode += ` * @author Hamza NORDINE\n`;
    consumerCode += ` */\n`;
    consumerCode += `@Service\n`;
    consumerCode += `@Slf4j\n`;
    consumerCode += `@RequiredArgsConstructor\n`;
    consumerCode += `public class ${baseName}KafkaConsumer {\n\n`;
    consumerCode += `    /**\n`;
    consumerCode += `     * Ecoute les messages du topic Kafka.\n`;
    consumerCode += `     * Remplace : onMessage(Message message) du MessageDrivenBean.\n`;
    consumerCode += `     */\n`;
    consumerCode += `    @KafkaListener(\n`;
    consumerCode += `            topics = "${camelToKebab(baseName)}-events",\n`;
    consumerCode += `            groupId = "${camelToKebab(baseName)}-consumer-group",\n`;
    consumerCode += `            containerFactory = "kafkaListenerContainerFactory"\n`;
    consumerCode += `    )\n`;
    consumerCode += `    public void onMessage(ConsumerRecord<String, Object> record, Acknowledgment ack) {\n`;
    consumerCode += `        log.info("Message recu: topic={}, partition={}, offset={}, key={}",\n`;
    consumerCode += `                record.topic(), record.partition(), record.offset(), record.key());\n`;
    consumerCode += `        try {\n`;
    consumerCode += `            // TODO: Migrer la logique de onMessage() depuis ${className}\n`;
    consumerCode += `            Object payload = record.value();\n`;
    consumerCode += `            processMessage(payload);\n`;
    consumerCode += `            ack.acknowledge();\n`;
    consumerCode += `        } catch (Exception e) {\n`;
    consumerCode += `            log.error("Erreur traitement message: {}", e.getMessage());\n`;
    consumerCode += `            // TODO: Implementer la strategie de retry / DLQ\n`;
    consumerCode += `        }\n`;
    consumerCode += `    }\n\n`;
    consumerCode += `    private void processMessage(Object payload) {\n`;
    consumerCode += `        // TODO: Logique metier migree depuis le MDB\n`;
    consumerCode += `        log.info("Traitement du message: {}", payload);\n`;
    consumerCode += `    }\n`;
    consumerCode += `}\n`;

    files.push({
      fileName: `${baseName}KafkaConsumer.java`,
      path: `src/main/java/${packagePath}/kafka/${baseName}KafkaConsumer.java`,
      content: consumerCode,
      type: "kafka",
      technology: "jms",
    });
  }

  // Kafka Config
  let kafkaConfigCode = `package ${basePackage}.config;\n\n`;
  kafkaConfigCode += `import org.apache.kafka.clients.consumer.ConsumerConfig;\n`;
  kafkaConfigCode += `import org.apache.kafka.clients.producer.ProducerConfig;\n`;
  kafkaConfigCode += `import org.apache.kafka.common.serialization.StringDeserializer;\n`;
  kafkaConfigCode += `import org.apache.kafka.common.serialization.StringSerializer;\n`;
  kafkaConfigCode += `import org.springframework.beans.factory.annotation.Value;\n`;
  kafkaConfigCode += `import org.springframework.context.annotation.Bean;\n`;
  kafkaConfigCode += `import org.springframework.context.annotation.Configuration;\n`;
  kafkaConfigCode += `import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;\n`;
  kafkaConfigCode += `import org.springframework.kafka.core.*;\n`;
  kafkaConfigCode += `import org.springframework.kafka.listener.ContainerProperties;\n`;
  kafkaConfigCode += `import org.springframework.kafka.support.serializer.JsonDeserializer;\n`;
  kafkaConfigCode += `import org.springframework.kafka.support.serializer.JsonSerializer;\n\n`;
  kafkaConfigCode += `import java.util.HashMap;\n`;
  kafkaConfigCode += `import java.util.Map;\n\n`;
  kafkaConfigCode += `/**\n`;
  kafkaConfigCode += ` * Configuration Kafka remplacant la configuration JMS/MQ.\n`;
  kafkaConfigCode += ` *\n`;
  kafkaConfigCode += ` * @author Hamza NORDINE\n`;
  kafkaConfigCode += ` */\n`;
  kafkaConfigCode += `@Configuration\n`;
  kafkaConfigCode += `public class KafkaConfig {\n\n`;
  kafkaConfigCode += `    @Value("\${spring.kafka.bootstrap-servers:localhost:9092}")\n`;
  kafkaConfigCode += `    private String bootstrapServers;\n\n`;
  kafkaConfigCode += `    @Bean\n`;
  kafkaConfigCode += `    public ProducerFactory<String, Object> producerFactory() {\n`;
  kafkaConfigCode += `        Map<String, Object> config = new HashMap<>();\n`;
  kafkaConfigCode += `        config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);\n`;
  kafkaConfigCode += `        config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);\n`;
  kafkaConfigCode += `        config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);\n`;
  kafkaConfigCode += `        config.put(ProducerConfig.ACKS_CONFIG, "all");\n`;
  kafkaConfigCode += `        config.put(ProducerConfig.RETRIES_CONFIG, 3);\n`;
  kafkaConfigCode += `        return new DefaultKafkaProducerFactory<>(config);\n`;
  kafkaConfigCode += `    }\n\n`;
  kafkaConfigCode += `    @Bean\n`;
  kafkaConfigCode += `    public KafkaTemplate<String, Object> kafkaTemplate() {\n`;
  kafkaConfigCode += `        return new KafkaTemplate<>(producerFactory());\n`;
  kafkaConfigCode += `    }\n\n`;
  kafkaConfigCode += `    @Bean\n`;
  kafkaConfigCode += `    public ConsumerFactory<String, Object> consumerFactory() {\n`;
  kafkaConfigCode += `        Map<String, Object> config = new HashMap<>();\n`;
  kafkaConfigCode += `        config.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);\n`;
  kafkaConfigCode += `        config.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);\n`;
  kafkaConfigCode += `        config.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);\n`;
  kafkaConfigCode += `        config.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");\n`;
  kafkaConfigCode += `        config.put(JsonDeserializer.TRUSTED_PACKAGES, "*");\n`;
  kafkaConfigCode += `        return new DefaultKafkaConsumerFactory<>(config);\n`;
  kafkaConfigCode += `    }\n\n`;
  kafkaConfigCode += `    @Bean\n`;
  kafkaConfigCode += `    public ConcurrentKafkaListenerContainerFactory<String, Object> kafkaListenerContainerFactory() {\n`;
  kafkaConfigCode += `        ConcurrentKafkaListenerContainerFactory<String, Object> factory =\n`;
  kafkaConfigCode += `                new ConcurrentKafkaListenerContainerFactory<>();\n`;
  kafkaConfigCode += `        factory.setConsumerFactory(consumerFactory());\n`;
  kafkaConfigCode += `        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);\n`;
  kafkaConfigCode += `        factory.setConcurrency(3);\n`;
  kafkaConfigCode += `        return factory;\n`;
  kafkaConfigCode += `    }\n`;
  kafkaConfigCode += `}\n`;

  files.push({
    fileName: "KafkaConfig.java",
    path: `src/main/java/${packagePath}/config/KafkaConfig.java`,
    content: kafkaConfigCode,
    type: "config",
    technology: "jms",
  });

  return files;
}

// ============================================================
// Batch → Spring Batch
// ============================================================

function generateBatchToSpringBatch(
  detections: BatchDetection[],
  basePackage: string,
  packagePath: string,
  className: string
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const baseName = className.replace(/Batchlet$/, "").replace(/Reader$/, "").replace(/Writer$/, "").replace(/Processor$/, "");

  // Spring Batch Job Configuration
  let jobCode = `package ${basePackage}.batch;\n\n`;
  jobCode += `import org.springframework.batch.core.Job;\n`;
  jobCode += `import org.springframework.batch.core.Step;\n`;
  jobCode += `import org.springframework.batch.core.job.builder.JobBuilder;\n`;
  jobCode += `import org.springframework.batch.core.repository.JobRepository;\n`;
  jobCode += `import org.springframework.batch.core.step.builder.StepBuilder;\n`;
  jobCode += `import org.springframework.context.annotation.Bean;\n`;
  jobCode += `import org.springframework.context.annotation.Configuration;\n`;
  jobCode += `import org.springframework.transaction.PlatformTransactionManager;\n\n`;
  jobCode += `/**\n`;
  jobCode += ` * Configuration Spring Batch remplacant le job JSR-352 de ${className}.\n`;
  jobCode += ` *\n`;
  jobCode += ` * @author Hamza NORDINE\n`;
  jobCode += ` */\n`;
  jobCode += `@Configuration\n`;
  jobCode += `public class ${baseName}BatchConfig {\n\n`;
  jobCode += `    @Bean\n`;
  jobCode += `    public Job ${lowerFirst(baseName)}Job(JobRepository jobRepository, Step ${lowerFirst(baseName)}Step) {\n`;
  jobCode += `        return new JobBuilder("${camelToKebab(baseName)}-job", jobRepository)\n`;
  jobCode += `                .start(${lowerFirst(baseName)}Step)\n`;
  jobCode += `                .build();\n`;
  jobCode += `    }\n\n`;
  jobCode += `    @Bean\n`;
  jobCode += `    public Step ${lowerFirst(baseName)}Step(\n`;
  jobCode += `            JobRepository jobRepository,\n`;
  jobCode += `            PlatformTransactionManager transactionManager,\n`;
  jobCode += `            ${baseName}ItemReader reader,\n`;
  jobCode += `            ${baseName}ItemProcessor processor,\n`;
  jobCode += `            ${baseName}ItemWriter writer) {\n`;
  jobCode += `        return new StepBuilder("${camelToKebab(baseName)}-step", jobRepository)\n`;
  jobCode += `                .<Object, Object>chunk(100, transactionManager)\n`;
  jobCode += `                .reader(reader)\n`;
  jobCode += `                .processor(processor)\n`;
  jobCode += `                .writer(writer)\n`;
  jobCode += `                .build();\n`;
  jobCode += `    }\n`;
  jobCode += `}\n`;

  files.push({
    fileName: `${baseName}BatchConfig.java`,
    path: `src/main/java/${packagePath}/batch/${baseName}BatchConfig.java`,
    content: jobCode,
    type: "batch",
    technology: "batch",
  });

  // Item Reader
  let readerCode = `package ${basePackage}.batch;\n\n`;
  readerCode += `import lombok.extern.slf4j.Slf4j;\n`;
  readerCode += `import org.springframework.batch.item.ItemReader;\n`;
  readerCode += `import org.springframework.stereotype.Component;\n\n`;
  readerCode += `/**\n`;
  readerCode += ` * ItemReader Spring Batch remplacant le reader JSR-352 de ${className}.\n`;
  readerCode += ` *\n`;
  readerCode += ` * @author Hamza NORDINE\n`;
  readerCode += ` */\n`;
  readerCode += `@Component\n`;
  readerCode += `@Slf4j\n`;
  readerCode += `public class ${baseName}ItemReader implements ItemReader<Object> {\n\n`;
  readerCode += `    @Override\n`;
  readerCode += `    public Object read() {\n`;
  readerCode += `        // TODO: Migrer la logique de lecture depuis ${className}\n`;
  readerCode += `        log.info("Lecture d'un element");\n`;
  readerCode += `        return null; // null signale la fin de la lecture\n`;
  readerCode += `    }\n`;
  readerCode += `}\n`;

  files.push({
    fileName: `${baseName}ItemReader.java`,
    path: `src/main/java/${packagePath}/batch/${baseName}ItemReader.java`,
    content: readerCode,
    type: "batch",
    technology: "batch",
  });

  // Item Processor
  let procCode = `package ${basePackage}.batch;\n\n`;
  procCode += `import lombok.extern.slf4j.Slf4j;\n`;
  procCode += `import org.springframework.batch.item.ItemProcessor;\n`;
  procCode += `import org.springframework.stereotype.Component;\n\n`;
  procCode += `/**\n`;
  procCode += ` * ItemProcessor Spring Batch remplacant le processor JSR-352 de ${className}.\n`;
  procCode += ` *\n`;
  procCode += ` * @author Hamza NORDINE\n`;
  procCode += ` */\n`;
  procCode += `@Component\n`;
  procCode += `@Slf4j\n`;
  procCode += `public class ${baseName}ItemProcessor implements ItemProcessor<Object, Object> {\n\n`;
  procCode += `    @Override\n`;
  procCode += `    public Object process(Object item) {\n`;
  procCode += `        // TODO: Migrer la logique de traitement depuis ${className}\n`;
  procCode += `        log.info("Traitement de l'element: {}", item);\n`;
  procCode += `        return item;\n`;
  procCode += `    }\n`;
  procCode += `}\n`;

  files.push({
    fileName: `${baseName}ItemProcessor.java`,
    path: `src/main/java/${packagePath}/batch/${baseName}ItemProcessor.java`,
    content: procCode,
    type: "batch",
    technology: "batch",
  });

  // Item Writer
  let writerCode = `package ${basePackage}.batch;\n\n`;
  writerCode += `import lombok.extern.slf4j.Slf4j;\n`;
  writerCode += `import org.springframework.batch.item.Chunk;\n`;
  writerCode += `import org.springframework.batch.item.ItemWriter;\n`;
  writerCode += `import org.springframework.stereotype.Component;\n\n`;
  writerCode += `/**\n`;
  writerCode += ` * ItemWriter Spring Batch remplacant le writer JSR-352 de ${className}.\n`;
  writerCode += ` *\n`;
  writerCode += ` * @author Hamza NORDINE\n`;
  writerCode += ` */\n`;
  writerCode += `@Component\n`;
  writerCode += `@Slf4j\n`;
  writerCode += `public class ${baseName}ItemWriter implements ItemWriter<Object> {\n\n`;
  writerCode += `    @Override\n`;
  writerCode += `    public void write(Chunk<? extends Object> items) {\n`;
  writerCode += `        // TODO: Migrer la logique d'ecriture depuis ${className}\n`;
  writerCode += `        log.info("Ecriture de {} elements", items.size());\n`;
  writerCode += `        for (Object item : items) {\n`;
  writerCode += `            log.debug("Ecriture: {}", item);\n`;
  writerCode += `        }\n`;
  writerCode += `    }\n`;
  writerCode += `}\n`;

  files.push({
    fileName: `${baseName}ItemWriter.java`,
    path: `src/main/java/${packagePath}/batch/${baseName}ItemWriter.java`,
    content: writerCode,
    type: "batch",
    technology: "batch",
  });

  return files;
}

// ============================================================
// EJB → Spring Services + WebClient
// ============================================================

function generateEjbToSpring(
  detections: TechnologyDetection[],
  basePackage: string,
  packagePath: string,
  className: string
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const serviceName = className.replace(/Bean$/, "").replace(/EJB$/, "");

  // Extract injected services
  const injectedServices: string[] = [];
  for (const det of detections) {
    if (det.pattern === "EJB Injection") {
      const match = det.rawCode.match(/(\w+Service\w*)/);
      if (match && !injectedServices.includes(match[1])) injectedServices.push(match[1]);
    }
  }

  // WebClient-based API Client
  let clientCode = `package ${basePackage}.client;\n\n`;
  clientCode += `import ${basePackage}.config.WebClientConfig;\n`;
  clientCode += `import ${basePackage}.exception.ApiClientException;\n`;
  clientCode += `import lombok.RequiredArgsConstructor;\n`;
  clientCode += `import lombok.extern.slf4j.Slf4j;\n`;
  clientCode += `import org.springframework.stereotype.Service;\n`;
  clientCode += `import org.springframework.web.reactive.function.client.WebClient;\n`;
  clientCode += `import org.springframework.web.reactive.function.client.WebClientResponseException;\n`;
  clientCode += `import reactor.core.publisher.Mono;\n\n`;
  clientCode += `import java.time.Duration;\n\n`;
  clientCode += `/**\n`;
  clientCode += ` * Client API REST moderne remplacant les appels EJB de ${className}.\n`;
  clientCode += ` *\n`;
  clientCode += ` * @author Hamza NORDINE\n`;
  clientCode += ` */\n`;
  clientCode += `@Service\n`;
  clientCode += `@Slf4j\n`;
  clientCode += `@RequiredArgsConstructor\n`;
  clientCode += `public class ${serviceName}ApiClient {\n\n`;
  clientCode += `    private final WebClient webClient;\n`;
  clientCode += `    private static final Duration TIMEOUT = Duration.ofSeconds(30);\n\n`;

  for (const svc of injectedServices) {
    const basePath = `/api/v1/${camelToKebab(svc.replace(/Service$/, ""))}s`;
    clientCode += `    // Remplace @EJB ${svc}\n`;
    clientCode += `    public Object call${svc}(Object request) {\n`;
    clientCode += `        log.info("Appel API REST vers ${svc}");\n`;
    clientCode += `        try {\n`;
    clientCode += `            return webClient.post()\n`;
    clientCode += `                    .uri("${basePath}")\n`;
    clientCode += `                    .bodyValue(request)\n`;
    clientCode += `                    .retrieve()\n`;
    clientCode += `                    .bodyToMono(Object.class)\n`;
    clientCode += `                    .timeout(TIMEOUT)\n`;
    clientCode += `                    .block();\n`;
    clientCode += `        } catch (WebClientResponseException e) {\n`;
    clientCode += `            log.error("Erreur HTTP {}: {}", e.getStatusCode(), e.getMessage());\n`;
    clientCode += `            throw new ApiClientException("Erreur appel ${svc}", e);\n`;
    clientCode += `        }\n`;
    clientCode += `    }\n\n`;
  }

  clientCode += `}\n`;

  files.push({
    fileName: `${serviceName}ApiClient.java`,
    path: `src/main/java/${packagePath}/client/${serviceName}ApiClient.java`,
    content: clientCode,
    type: "client",
    technology: "ejb",
  });

  return files;
}

// ============================================================
// Infrastructure files
// ============================================================

function generateInfrastructure(
  basePackage: string,
  packagePath: string,
  report: ExtendedAnalysisReport
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const techs = report.summary.technologiesDetected;

  // Exception handler
  let exCode = `package ${basePackage}.exception;\n\n`;
  exCode += `/**\n`;
  exCode += ` * Exception personnalisee pour les erreurs API.\n`;
  exCode += ` * @author Hamza NORDINE\n`;
  exCode += ` */\n`;
  exCode += `public class ApiClientException extends RuntimeException {\n`;
  exCode += `    public ApiClientException(String message) { super(message); }\n`;
  exCode += `    public ApiClientException(String message, Throwable cause) { super(message, cause); }\n`;
  exCode += `}\n`;

  files.push({
    fileName: "ApiClientException.java",
    path: `src/main/java/${packagePath}/exception/ApiClientException.java`,
    content: exCode,
    type: "exception",
    technology: "common",
  });

  // Global exception handler
  let handlerCode = `package ${basePackage}.exception;\n\n`;
  handlerCode += `import lombok.extern.slf4j.Slf4j;\n`;
  handlerCode += `import org.springframework.http.HttpStatus;\n`;
  handlerCode += `import org.springframework.http.ResponseEntity;\n`;
  handlerCode += `import org.springframework.web.bind.annotation.ExceptionHandler;\n`;
  handlerCode += `import org.springframework.web.bind.annotation.RestControllerAdvice;\n\n`;
  handlerCode += `import java.time.LocalDateTime;\n`;
  handlerCode += `import java.util.Map;\n\n`;
  handlerCode += `/**\n`;
  handlerCode += ` * Gestionnaire global d'exceptions.\n`;
  handlerCode += ` * @author Hamza NORDINE\n`;
  handlerCode += ` */\n`;
  handlerCode += `@RestControllerAdvice\n`;
  handlerCode += `@Slf4j\n`;
  handlerCode += `public class GlobalExceptionHandler {\n\n`;
  handlerCode += `    @ExceptionHandler(ApiClientException.class)\n`;
  handlerCode += `    public ResponseEntity<Map<String, Object>> handleApiException(ApiClientException e) {\n`;
  handlerCode += `        log.error("API Error: {}", e.getMessage());\n`;
  handlerCode += `        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of(\n`;
  handlerCode += `                "error", e.getMessage(),\n`;
  handlerCode += `                "timestamp", LocalDateTime.now().toString(),\n`;
  handlerCode += `                "status", 502\n`;
  handlerCode += `        ));\n`;
  handlerCode += `    }\n\n`;
  handlerCode += `    @ExceptionHandler(Exception.class)\n`;
  handlerCode += `    public ResponseEntity<Map<String, Object>> handleGeneral(Exception e) {\n`;
  handlerCode += `        log.error("Unexpected error: {}", e.getMessage());\n`;
  handlerCode += `        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(\n`;
  handlerCode += `                "error", "Internal server error",\n`;
  handlerCode += `                "timestamp", LocalDateTime.now().toString(),\n`;
  handlerCode += `                "status", 500\n`;
  handlerCode += `        ));\n`;
  handlerCode += `    }\n`;
  handlerCode += `}\n`;

  files.push({
    fileName: "GlobalExceptionHandler.java",
    path: `src/main/java/${packagePath}/exception/GlobalExceptionHandler.java`,
    content: handlerCode,
    type: "exception",
    technology: "common",
  });

  // application.yml
  let yml = `# Configuration generee par Java Legacy Modernizer Platform\n`;
  yml += `# @author Hamza NORDINE\n\n`;
  yml += `spring:\n`;
  yml += `  application:\n`;
  yml += `    name: ${camelToKebab(report.className)}-service\n\n`;

  if (techs.includes("jdbc") || techs.includes("hibernate")) {
    yml += `  datasource:\n`;
    yml += `    url: \${DB_URL:jdbc:postgresql://localhost:5432/bankdb}\n`;
    yml += `    username: \${DB_USER:postgres}\n`;
    yml += `    password: \${DB_PASSWORD:password}\n`;
    yml += `    driver-class-name: org.postgresql.Driver\n\n`;
    yml += `  jpa:\n`;
    yml += `    hibernate:\n`;
    yml += `      ddl-auto: validate\n`;
    yml += `    show-sql: false\n`;
    yml += `    properties:\n`;
    yml += `      hibernate:\n`;
    yml += `        format_sql: true\n\n`;
  }

  if (techs.includes("jms")) {
    yml += `  kafka:\n`;
    yml += `    bootstrap-servers: \${KAFKA_SERVERS:localhost:9092}\n`;
    yml += `    consumer:\n`;
    yml += `      auto-offset-reset: earliest\n`;
    yml += `      enable-auto-commit: false\n`;
    yml += `    producer:\n`;
    yml += `      acks: all\n`;
    yml += `      retries: 3\n\n`;
  }

  if (techs.includes("batch")) {
    yml += `  batch:\n`;
    yml += `    jdbc:\n`;
    yml += `      initialize-schema: always\n`;
    yml += `    job:\n`;
    yml += `      enabled: false\n\n`;
  }

  yml += `server:\n`;
  yml += `  port: \${PORT:8080}\n\n`;
  yml += `management:\n`;
  yml += `  endpoints:\n`;
  yml += `    web:\n`;
  yml += `      exposure:\n`;
  yml += `        include: health,info,metrics,prometheus\n`;

  files.push({
    fileName: "application.yml",
    path: "src/main/resources/application.yml",
    content: yml,
    type: "config",
    technology: "common",
  });

  // POM
  files.push(generateExtendedPom(basePackage, techs));

  return files;
}

function generateExtendedPom(basePackage: string, techs: LegacyTechnology[]): GeneratedFile {
  let pom = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  pom += `<project xmlns="http://maven.apache.org/POM/4.0.0"\n`;
  pom += `         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n`;
  pom += `         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">\n`;
  pom += `    <modelVersion>4.0.0</modelVersion>\n`;
  pom += `    <parent>\n`;
  pom += `        <groupId>org.springframework.boot</groupId>\n`;
  pom += `        <artifactId>spring-boot-starter-parent</artifactId>\n`;
  pom += `        <version>3.3.0</version>\n`;
  pom += `    </parent>\n\n`;
  pom += `    <groupId>${basePackage}</groupId>\n`;
  pom += `    <artifactId>modernized-service</artifactId>\n`;
  pom += `    <version>1.0.0-SNAPSHOT</version>\n`;
  pom += `    <name>Modernized Service</name>\n`;
  pom += `    <description>Service modernise par Java Legacy Modernizer Platform - Hamza NORDINE</description>\n\n`;
  pom += `    <properties>\n`;
  pom += `        <java.version>21</java.version>\n`;
  pom += `    </properties>\n\n`;
  pom += `    <dependencies>\n`;
  pom += `        <!-- Spring Boot Web -->\n`;
  pom += `        <dependency>\n`;
  pom += `            <groupId>org.springframework.boot</groupId>\n`;
  pom += `            <artifactId>spring-boot-starter-web</artifactId>\n`;
  pom += `        </dependency>\n\n`;
  pom += `        <!-- Spring Boot WebFlux (WebClient) -->\n`;
  pom += `        <dependency>\n`;
  pom += `            <groupId>org.springframework.boot</groupId>\n`;
  pom += `            <artifactId>spring-boot-starter-webflux</artifactId>\n`;
  pom += `        </dependency>\n\n`;
  pom += `        <!-- Validation -->\n`;
  pom += `        <dependency>\n`;
  pom += `            <groupId>org.springframework.boot</groupId>\n`;
  pom += `            <artifactId>spring-boot-starter-validation</artifactId>\n`;
  pom += `        </dependency>\n\n`;
  pom += `        <!-- Actuator -->\n`;
  pom += `        <dependency>\n`;
  pom += `            <groupId>org.springframework.boot</groupId>\n`;
  pom += `            <artifactId>spring-boot-starter-actuator</artifactId>\n`;
  pom += `        </dependency>\n\n`;

  if (techs.includes("jdbc") || techs.includes("hibernate")) {
    pom += `        <!-- Spring Data JPA -->\n`;
    pom += `        <dependency>\n`;
    pom += `            <groupId>org.springframework.boot</groupId>\n`;
    pom += `            <artifactId>spring-boot-starter-data-jpa</artifactId>\n`;
    pom += `        </dependency>\n\n`;
    pom += `        <!-- PostgreSQL -->\n`;
    pom += `        <dependency>\n`;
    pom += `            <groupId>org.postgresql</groupId>\n`;
    pom += `            <artifactId>postgresql</artifactId>\n`;
    pom += `            <scope>runtime</scope>\n`;
    pom += `        </dependency>\n\n`;
  }

  if (techs.includes("jms")) {
    pom += `        <!-- Spring Kafka -->\n`;
    pom += `        <dependency>\n`;
    pom += `            <groupId>org.springframework.kafka</groupId>\n`;
    pom += `            <artifactId>spring-kafka</artifactId>\n`;
    pom += `        </dependency>\n\n`;
  }

  if (techs.includes("batch")) {
    pom += `        <!-- Spring Batch -->\n`;
    pom += `        <dependency>\n`;
    pom += `            <groupId>org.springframework.boot</groupId>\n`;
    pom += `            <artifactId>spring-boot-starter-batch</artifactId>\n`;
    pom += `        </dependency>\n\n`;
  }

  pom += `        <!-- OpenAPI / Swagger -->\n`;
  pom += `        <dependency>\n`;
  pom += `            <groupId>org.springdoc</groupId>\n`;
  pom += `            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>\n`;
  pom += `            <version>2.5.0</version>\n`;
  pom += `        </dependency>\n\n`;
  pom += `        <!-- Lombok -->\n`;
  pom += `        <dependency>\n`;
  pom += `            <groupId>org.projectlombok</groupId>\n`;
  pom += `            <artifactId>lombok</artifactId>\n`;
  pom += `            <optional>true</optional>\n`;
  pom += `        </dependency>\n\n`;
  pom += `        <!-- Test -->\n`;
  pom += `        <dependency>\n`;
  pom += `            <groupId>org.springframework.boot</groupId>\n`;
  pom += `            <artifactId>spring-boot-starter-test</artifactId>\n`;
  pom += `            <scope>test</scope>\n`;
  pom += `        </dependency>\n`;
  pom += `    </dependencies>\n\n`;
  pom += `    <build>\n`;
  pom += `        <plugins>\n`;
  pom += `            <plugin>\n`;
  pom += `                <groupId>org.springframework.boot</groupId>\n`;
  pom += `                <artifactId>spring-boot-maven-plugin</artifactId>\n`;
  pom += `            </plugin>\n`;
  pom += `        </plugins>\n`;
  pom += `    </build>\n`;
  pom += `</project>\n`;

  return {
    fileName: "pom.xml",
    path: "pom.xml",
    content: pom,
    type: "config",
    technology: "common",
  };
}

// ============================================================
// Project Structure Builder
// ============================================================

function buildProjectStructure(files: GeneratedFile[]): string {
  const tree: string[] = ["modernized-service/"];
  const dirs = new Set<string>();

  for (const f of files) {
    const parts = f.path.split("/");
    let current = "";
    for (let i = 0; i < parts.length - 1; i++) {
      current += (current ? "/" : "") + parts[i];
      if (!dirs.has(current)) {
        dirs.add(current);
        tree.push("  ".repeat(i + 1) + parts[i] + "/");
      }
    }
    tree.push("  ".repeat(parts.length) + parts[parts.length - 1]);
  }

  return tree.join("\n");
}

// ============================================================
// Utility Functions
// ============================================================

function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function camelToSnake(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function lowerFirst(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function inferHttpMethodFromSoap(operationName: string): string {
  const lower = operationName.toLowerCase();
  if (lower.startsWith("get") || lower.startsWith("find") || lower.startsWith("search") || lower.startsWith("list")) return "GET";
  return "POST";
}
