/**
 * Spring Boot Code Generator — Orchestrator.
 * Delegates to sub-generators in server/spring/ for each concern.
 *
 * Implements 12 senior-developer quality rules (R1-R12).
 *
 * v5.5: Refactored from 2200-line monolith into 8 focused modules.
 * v5.9: DataSourceDetector + ConfigGenerator integration.
 *
 * @author Compleo
 */

import type {
  ProjectIR, UseCaseIR, DtoIR, DtoFieldIR, ServiceIR,
  EnumIR, ExceptionIR, ValidatorIR, RemoteInterfaceIR,
} from "./java-parser";

// v8.3: Strategy/Handler pattern detectors
import { groupByDomain, getServiceNameForDomain } from "./engine/detectors/domain-grouper";
import { isGodClassDao, splitDao, generateRepositories } from "./engine/detectors/dao-splitter";
import { isHttpClientClass, detectHttpClient, generateRestTemplateService } from "./engine/detectors/http-client-detector";
import { scanModels, generateEntities } from "./engine/detectors/model-to-entity";
import { analyzeEnvelope, generateEnvelopeDtos } from "./engine/detectors/envelope-replacer";

// v8.4: Post-generation transformers
import { transformEaiFrameworkReferences } from "./engine/transformer/eai-framework-transformer";
import { replaceLegacyTypes } from "./engine/transformer/legacy-type-replacer";
import { normalizeFieldReferences } from "./engine/transformer/field-name-normalizer";
import { filterFacadeUseCases } from "./engine/detectors/facade-detector";

// v8.5: UseCase DTO generator
import { generateMissingDtos } from "./engine/transformer/usecase-dto-generator";

// --- Re-export types from shared (backward compatibility) ---
export type {
  GeneratedFile, GenerationResult, GenerationStats,
  CompilationResult, CompilationError, MigrationReportContext,
} from "./spring/shared";

import type { GeneratedFile, GenerationResult, GenerationStats, CompilationResult, CompilationError, MigrationReportContext } from "./spring/shared";

// --- Import sub-generators ---
import { ImportResolver } from "./engine/ImportResolver";
import { DataSourceDetector } from "./engine/detectors/DataSourceDetector";
import type { DataSourceInfo } from "./engine/detectors/DataSourceDetector";
import { ConfigGenerator } from "./engine/generators/ConfigGenerator";
import { generateDto } from "./spring/dto-gen";
import { generateEnum, generateException, generateGlobalExceptionHandler, generateValidator } from "./spring/model-gen";
import { generateDomainService } from "./spring/service-gen";
import { generateDomainController } from "./spring/controller-gen";
import { generateDomainControllerTest } from "./spring/test-gen";
import {
  generateMainApplication,
  generateRemoteServiceAdapter,
  generateInjectedServiceStub,
  generateApplicationProperties,
  generateDockerfile,
  generateK8sDeployment,
  generateK8sService,
  generatePomXml,
  generateMigrationReport,
} from "./spring/infra-gen";
import { scoreGeneration, generateQualitySection, type QualityReport } from "./engine/quality-scorer";
import { generateBianMappingReport, generateArchitectureReport, generateMigrationSummaryReport } from "./spring/report-gen";

// --- Main Generator (Orchestrator) ---

export function generateSpringBootProject(ir: ProjectIR, reportContext?: MigrationReportContext): GenerationResult {
  const files: GeneratedFile[] = [];
  const warnings: string[] = [];

  const basePackage = ir.groupId ? `${ir.groupId}.${ir.artifactId.replace(/-/g, "")}` : "com.example.app";
  const basePath = `src/main/java/${basePackage.replace(/\./g, "/")}`;
  const testPath = `src/test/java/${basePackage.replace(/\./g, "/")}`;

  // Group UseCases by domain
  // v8.3: Exclude the Strategy facade class from service generation
  const facadeClass = ir.handlerPattern?.facadeClass ?? "";
  let filteredUseCases = ir.useCases.filter(uc => {
    if (facadeClass && uc.className === facadeClass) {
      warnings.push(`[v8.3] Excluded facade ${facadeClass} from service generation`);
      return false;
    }
    return true;
  });

  // v8.4 STEP 7: Exclude EJB facades (UCStrategie, AbstractFacade, Factory dispatchers)
  const rawFiles = (ir as any)._rawFiles ?? [];
  const { filtered: nonFacadeUseCases, excludedFacades } = filterFacadeUseCases(
    filteredUseCases.map(uc => ({ className: uc.className, rawSource: uc.rawSource })),
    rawFiles
  );
  if (excludedFacades.length > 0) {
    warnings.push(`[v8.4] Excluded ${excludedFacades.length} facade(s): ${excludedFacades.join(", ")}`);
    const nonFacadeNames = new Set(nonFacadeUseCases.map(uc => uc.className));
    filteredUseCases = filteredUseCases.filter(uc => nonFacadeNames.has(uc.className));
  }

  const domainMap = new Map<string, UseCaseIR[]>();
  for (const uc of filteredUseCases) {
    const domain = uc.domain || "general";
    if (!domainMap.has(domain)) domainMap.set(domain, []);
    domainMap.get(domain)!.push(uc);
  }

  // v8.3: If handler pattern detected, use domain-grouper for service naming
  if (ir.handlerPattern?.detected) {
    warnings.push(`[v8.3] Handler pattern active: ${domainMap.size} domain(s) detected`);
  }

  // Build DTO lookup
  const dtoMap = new Map<string, DtoIR>();
  for (const dto of ir.dtos) {
    dtoMap.set(dto.className, dto);
  }

  // FIX F v7.3: Auto-generate missing DTOs for inferred return types
  // When inferReturnTypeFromSource produces a type like "ConnexionResponseDTO",
  // we must ensure that DTO actually exists in the generated code.
  const autoGeneratedDtoNames = new Set<string>();
  for (const uc of ir.useCases) {
    // Check if voOutType is Object/ValueObject — these will be inferred at generation time
    if (uc.voOutType === "Object" || uc.voOutType === "ValueObject") {
      const inferredType = inferReturnTypeForDtoGen(uc.rawSource, uc.className);
      if (inferredType && inferredType !== "Void" && !dtoMap.has(inferredType) && !autoGeneratedDtoNames.has(inferredType)) {
        autoGeneratedDtoNames.add(inferredType);
        const autoDto = generateAuthDto(basePackage, basePath, inferredType, uc.domain || "auth");
        if (autoDto) files.push(autoDto);
      }
    }
    // Also check voInType for missing request DTOs
    if (uc.voInType === "Object" || uc.voInType === "ValueObject") {
      const reqDtoName = `${toPascalCaseLocal(uc.className)}RequestDTO`;
      if (!dtoMap.has(uc.voInType) && !autoGeneratedDtoNames.has(reqDtoName)) {
        autoGeneratedDtoNames.add(reqDtoName);
        const autoDto = generateAuthDto(basePackage, basePath, reqDtoName, uc.domain || "auth");
        if (autoDto) files.push(autoDto);
      }
    }
  }

  // v8.5: Generate missing DTOs for UseCases without explicit voIn/voOut in dtoMap
  const missingDtoResult = generateMissingDtos(ir.useCases, dtoMap, basePackage, basePath);
  if (missingDtoResult.files.length > 0) {
    files.push(...missingDtoResult.files);
    warnings.push(`[v8.5] Generated ${missingDtoResult.stats.dtosGenerated} missing DTOs (${missingDtoResult.stats.fieldsExtracted} fields extracted from ${missingDtoResult.stats.useCasesAnalyzed} UseCases)`);
  }

  // 1. Generate Main Application
  files.push(generateMainApplication(basePackage, basePath, ir));

  // 2. Generate DTOs (Request/Response) -- R9, R10
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
  // Always generate GlobalExceptionHandler -- R3
  files.push(generateGlobalExceptionHandler(basePackage, basePath, ir.exceptions));

  // CORRECTION v5.2: Always generate BusinessRuleException for test coherence
  files.push({
    path: `${basePath}/exception/BusinessRuleException.java`,
    category: "exception" as const,
    content: `package ${basePackage}.exception;

/**
 * BusinessRuleException -- thrown when a business rule is violated.
 * Handled by GlobalExceptionHandler -> HTTP 422 Unprocessable Entity.
 */
public class BusinessRuleException extends RuntimeException {

    public BusinessRuleException(String message) {
        super(message);
    }

    public BusinessRuleException(String message, Throwable cause) {
        super(message, cause);
    }
}
`,
  });

  // 5. Generate Validators
  for (const val of ir.validators) {
    files.push(generateValidator(basePackage, basePath, val));
  }

  // 6. Generate Services (one per domain) -- R6, R7, R8
  for (const [domain, useCases] of domainMap) {
    files.push(generateDomainService(basePackage, basePath, domain, useCases, dtoMap, ir));
  }

  // 7. Generate Controllers (one per domain) -- R1, R2, R3, R4, R5
  for (const [domain, useCases] of domainMap) {
    files.push(generateDomainController(basePackage, basePath, domain, useCases, dtoMap));
  }

  // 8. Generate Tests (one per controller) -- R11, R12
  for (const [domain, useCases] of domainMap) {
    files.push(generateDomainControllerTest(basePackage, testPath, domain, useCases, dtoMap));
  }

  // 9. Generate Remote Service adapters -- R8
  for (const remote of ir.remoteInterfaces) {
    files.push(generateRemoteServiceAdapter(basePackage, basePath, remote));
  }

  // CORRECTION v5.2+v5.9.1: Generate stub adapters for injected services not covered by @Remote interfaces
  // FIX 3: Infer methods by actual usage in UseCase bodies (not all methods from the interface)
  const remoteTypeNames = new Set(ir.remoteInterfaces.map(r => r.className));
  // Collect per-service: which methods are actually called in UseCase bodies
  const serviceMethodUsages = new Map<string, Set<string>>();
  const serviceVarNames = new Map<string, Set<string>>(); // svcType -> variable names used
  for (const uc of ir.useCases) {
    for (const svc of uc.injectedServices) {
      if (!remoteTypeNames.has(svc.type) && !svc.type.endsWith("DAO") && !svc.type.endsWith("Repository")) {
        if (!serviceMethodUsages.has(svc.type)) {
          serviceMethodUsages.set(svc.type, new Set());
          serviceVarNames.set(svc.type, new Set());
        }
        serviceVarNames.get(svc.type)!.add(svc.name);
        // Scan the UseCase rawSource for calls on this variable
        if (uc.rawSource) {
          const callPattern = new RegExp(`\\b${svc.name}\\.(\\w+)\\s*\\(`, "g");
          let callMatch;
          while ((callMatch = callPattern.exec(uc.rawSource)) !== null) {
            serviceMethodUsages.get(svc.type)!.add(callMatch[1]);
          }
        }
      }
    }
  }
  // v8.4 STEP 2: Collect domain service names to avoid generating duplicate stubs
  const domainServiceNames = new Set<string>();
  for (const [domain] of domainMap) {
    const svcName = domain.charAt(0).toUpperCase() + domain.slice(1).replace(/[-_](\w)/g, (_: string, c: string) => c.toUpperCase()) + "Service";
    domainServiceNames.add(svcName);
  }

  for (const [svcType, usedMethods] of serviceMethodUsages) {
    // v8.4 STEP 2: Skip stub generation if this service is already a domain service
    if (domainServiceNames.has(svcType)) {
      warnings.push(`[v8.4] Skipped stub for ${svcType} — already generated as domain service`);
      continue;
    }
    // FIX v7.8 BUG-7: Search source file with fallback — _rawFiles has { path, content } only (no className)
    // IMPORTANT: For EJBLocal interfaces (e.g. NotificationMulticanalEJBLocal), the Local interface
    // file is often empty (just `public interface Xxx {}`). We MUST search the EJB implementation first.
    const rawFiles = (ir as any)._rawFiles ?? [];
    const pathEndsWith = (f: any, name: string) =>
      f.path?.endsWith(`/${name}.java`) || f.path?.endsWith(`\\${name}.java`) || f.path === `${name}.java`;

    let sourceFile: any = null;

    // Step 1: Strip EJB interface suffixes to find the implementation class first
    const baseName = svcType
      .replace(/Local$/i, "")
      .replace(/Remote$/i, "")
      .replace(/Home$/i, "");
    if (baseName !== svcType) {
      // svcType had a suffix — search for the implementation first
      const candidates = [baseName, baseName + "Bean", baseName + "Impl"];
      for (const cand of candidates) {
        sourceFile = rawFiles.find((f: any) => pathEndsWith(f, cand));
        if (sourceFile) break;
      }
    }

    // Step 2: If no implementation found, try exact match (the svcType itself)
    if (!sourceFile) {
      sourceFile = rawFiles.find((f: any) => pathEndsWith(f, svcType));
    }

    // Step 3: If exact match is an empty interface, try implementation again
    if (sourceFile && sourceFile.content) {
      const trimmed = sourceFile.content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
      // Check if it's just an empty interface declaration
      if (/^package[^;]*;\s*(import[^;]*;\s*)*public\s+interface\s+\w+\s*\{\s*\}\s*$/.test(trimmed)) {
        // Empty interface — try to find implementation
        const implCandidates = [baseName, baseName + "Bean", baseName + "Impl"];
        for (const cand of implCandidates) {
          if (cand === svcType) continue; // skip the one we already found
          const impl = rawFiles.find((f: any) => pathEndsWith(f, cand));
          if (impl) { sourceFile = impl; break; }
        }
      }
    }

    if (sourceFile) {
      // Filter the source content to only include methods that are actually used
      files.push(generateInjectedServiceStub(basePackage, basePath, svcType, sourceFile.content, usedMethods));
    } else {
      // No source file — generate stubs from inferred usage
      files.push(generateInjectedServiceStub(basePackage, basePath, svcType, "", usedMethods));
    }
  }

  // ─── v8.3: Handler Pattern — additional generators ───
  if (ir.handlerPattern?.detected) {
    const rawFiles = (ir as any)._rawFiles ?? [];

    // v8.3 STEP 3: DAO Splitter — detect God-class DAOs and split into repositories
    for (const f of rawFiles) {
      const fClassName = f.path?.split("/").pop()?.replace(".java", "") ?? "";
      if (isGodClassDao(f.content ?? "", fClassName)) {
        const splitResult = splitDao(f.content, fClassName);
        const repoFiles = generateRepositories(splitResult, basePackage, basePath);
        files.push(...repoFiles);
        warnings.push(`[v8.3] DAO split: ${fClassName} → ${splitResult.repositories.length} repositories (${splitResult.totalMethods} methods)`);
      }
    }

    // v8.3 STEP 4: HTTP Client — detect legacy HTTP clients and generate RestTemplate services
    for (const f of rawFiles) {
      const fClassName = f.path?.split("/").pop()?.replace(".java", "") ?? "";
      if (isHttpClientClass(f.content ?? "", fClassName)) {
        const detection = detectHttpClient(f.content, fClassName);
        const restFile = generateRestTemplateService(detection, basePackage, basePath);
        files.push(restFile);
        warnings.push(`[v8.3] HTTP client: ${fClassName} → ${detection.methods.length} methods migrated to RestTemplate`);
      }
    }

    // v8.3 STEP 5: Model → Entity — scan all packages for entities
    const modelScan = scanModels(rawFiles.map((f: any) => ({ path: f.path ?? "", content: f.content ?? "" })));
    if (modelScan.entities.length > 0) {
      const entityFiles = generateEntities(modelScan, basePackage, basePath);
      files.push(...entityFiles);
      warnings.push(`[v8.3] Models: ${modelScan.entities.length} entities, ${modelScan.dtos.length} DTOs, ${modelScan.enums.length} enums detected`);
    }

    // v8.3 STEP 6: Envelope → DTO — analyze handlers for Envelope patterns
    for (const handler of ir.handlerPattern.handlers) {
      const analysis = analyzeEnvelope(handler.className, handler.sourceCode);
      if (analysis.inputFields.length > 0 || analysis.outputFields.length > 0) {
        const dtoFiles = generateEnvelopeDtos(analysis, basePackage, basePath);
        files.push(...dtoFiles);
      }
    }
  }

  // 10. DataSource Detection & Config Generation (v5.9.0)
  const detector = new DataSourceDetector();
  const sourceFiles = (ir as any)._rawFiles?.map((f: any) => ({
    path: f.path || f.className + ".java",
    content: f.content || "",
  })) ?? [];
  let dsInfo: DataSourceInfo = detector.detect(sourceFiles);

  // FIX v5.9.2: Fallback — si _rawFiles vide ou vendor UNKNOWN, détecter depuis le code migré des UseCases
  if (dsInfo.vendor === "UNKNOWN" && ir.useCases.length > 0) {
    const allMigratedCode = ir.useCases
      .map((uc: UseCaseIR) => uc.rawSource ?? "")
      .join("\n");
    const dsInfoFromCode = detector.detect([{ path: "migrated-code.java", content: allMigratedCode }]);
    if (dsInfoFromCode.vendor !== "UNKNOWN") {
      dsInfo = dsInfoFromCode;
    }
  }

  const configGen = new ConfigGenerator();

  // 10a. Generate application.yml adapted to detected vendor
  files.push(configGen.generateApplicationYml(ir, dsInfo));
  files.push(generateApplicationProperties(ir));

  // 10b. Generate DATASOURCE_MIGRATION.md
  files.push(configGen.generateMigrationDoc(ir, dsInfo));

  // 11. Generate Cloud files (docker-compose adapted to vendor)
  files.push(generateDockerfile(ir));
  files.push(configGen.generateDockerCompose(ir, dsInfo));
  files.push(generateK8sDeployment(ir));
  files.push(generateK8sService(ir));

  // 12. Generate pom.xml with vendor-specific DB dependency
  files.push(generatePomXmlWithVendor(ir, basePackage, dsInfo));

  // 13. Generate Migration Report (enriched with ambiguity context + dsInfo)
  files.push(generateMigrationReport(ir, domainMap, dtoMap, reportContext));

  // FIX v5.8.2: Resolve missing imports in all generated Java files
  const importResolver = new ImportResolver();
  for (const file of files) {
    if (file.path.endsWith(".java")) {
      const resolvedImports = importResolver.resolveImports(file.content, basePackage, ir);
      if (resolvedImports.length > 0) {
        file.content = importResolver.injectImports(file.content, resolvedImports);
      }
    }
  }

  // ─── v8.4: Post-generation transformers (STEP 3+4+5+6) ───
  // Applied AFTER import resolution, BEFORE quality scoring.
  // All transforms are idempotent.
  for (const file of files) {
    if (!file.path.endsWith(".java")) continue;

    // STEP 3+4: EaiLog → @Slf4j log, FwkRollbackException → Spring
    file.content = transformEaiFrameworkReferences(file.content);

    // STEP 5: ValueObject/Envelope → DTOs (generic pass without UseCase context)
    file.content = replaceLegacyTypes(file.content);

    // STEP 6: Normalize field references in service files
    if (file.path.includes("/service/") && file.path.endsWith("Service.java")) {
      file.content = normalizeFieldReferences(file.content);
    }
  }

  // v10.4b STEP 4: Eliminate duplicate stubs (same class generated multiple times)
  const seenPaths = new Set<string>();
  const deduplicatedFiles: GeneratedFile[] = [];
  for (const file of files) {
    if (seenPaths.has(file.path)) {
      warnings.push(`[v10.4b] Deduplicated: ${file.path}`);
      continue;
    }
    seenPaths.add(file.path);
    deduplicatedFiles.push(file);
  }
  files.length = 0;
  files.push(...deduplicatedFiles);

  // 14. Quality Score — v7.3
  const legacyMethodCount = ir.useCases.length;
  const qualityReport = scoreGeneration(files, undefined, undefined, legacyMethodCount);
  const qualityFile: GeneratedFile = {
    path: "QUALITY_SCORE.md",
    content: `# Rapport de Qualité — Compleo v7.3\n\nGénéré le : ${new Date().toLocaleString("fr-FR")}\n\n${generateQualitySection(qualityReport)}\n`,
    category: "report",
  };
  files.push(qualityFile);

  // 15. BIAN Mapping Report
  files.push(generateBianMappingReport(ir));

  // 16. Architecture Report
  files.push(generateArchitectureReport(ir));

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

  // Step 4.2 -- Syntax verification
  const compilationResult = verifySyntax(files);

  // 17. Migration Summary Report (needs stats + quality)
  const scoreMatch = qualityFile.content.match(/(\d+)\/(\d+)\s+\(([A-F][+]?)\)/);
  const qGrade = scoreMatch ? scoreMatch[3] : undefined;
  const qScore = scoreMatch ? parseInt(scoreMatch[1], 10) : undefined;
  const qMax = scoreMatch ? parseInt(scoreMatch[2], 10) : undefined;
  files.push(generateMigrationSummaryReport(ir, stats, warnings, qGrade, qScore, qMax));

  return { files, stats, warnings, compilationResult, dsInfo };
}

// --- POM.xml with vendor-specific DB dependency ---

function generatePomXmlWithVendor(
  ir: ProjectIR,
  basePackage: string,
  dsInfo: DataSourceInfo
): GeneratedFile {
  const basePom = generatePomXml(ir, basePackage);
  const configGen = new ConfigGenerator();
  const vendorDep = configGen.generateMavenDependencyXml(dsInfo);

  // Replace the hardcoded MySQL dependency with the vendor-specific one
  // Use a more robust regex that handles varying whitespace
  let content = basePom.content;
  if (dsInfo.vendor !== "MYSQL" && dsInfo.vendor !== "MARIADB") {
    // Replace the entire MySQL dependency block
    content = content.replace(
      /\s*<!-- Database -->\s*\n\s*<dependency>\s*\n\s*<groupId>com\.mysql<\/groupId>\s*\n\s*<artifactId>mysql-connector-j<\/artifactId>\s*\n\s*<scope>runtime<\/scope>\s*\n\s*<\/dependency>/,
      `\n        <!-- Database (${dsInfo.vendor}) -->\n${vendorDep}`
    );
  } else if (dsInfo.vendor === "MARIADB") {
    // Replace MySQL with MariaDB
    content = content.replace(
      /\s*<!-- Database -->\s*\n\s*<dependency>\s*\n\s*<groupId>com\.mysql<\/groupId>\s*\n\s*<artifactId>mysql-connector-j<\/artifactId>\s*\n\s*<scope>runtime<\/scope>\s*\n\s*<\/dependency>/,
      `\n        <!-- Database (MariaDB) -->\n${vendorDep}`
    );
  }
  // else: MySQL stays as-is

  // FIX 3 (v5.10.0): Add conditional Kafka and Batch dependencies
  const conditionalDeps = generateConditionalDependencies(ir);
  if (conditionalDeps) {
    // Insert before </dependencies>
    content = content.replace(
      /(\s*)<\/dependencies>/,
      `\n${conditionalDeps}$1</dependencies>`
    );
  }

  return { ...basePom, content };
}

/**
 * Génère les dépendances conditionnelles Kafka et Batch
 * basées sur la présence de composants JMS/Batch dans l'IR.
 */
function generateConditionalDependencies(ir: ProjectIR): string {
  const deps: string[] = [];

  // Détecter JMS/Kafka — vérifier les batchJobs avec MessageListener ou les rawFiles avec JMS patterns
  const hasJms = (() => {
    // Check batchJobs for MessageListener
    if (ir.batchJobs?.some(b => b.batchRole === "LISTENER")) return true;
    // Check raw files for JMS annotations/imports
    const rawFiles = (ir as any)._rawFiles ?? [];
    return rawFiles.some((f: any) =>
      /@Resource.*(?:Queue|Topic|ConnectionFactory)/.test(f.content) ||
      /javax\.jms|jakarta\.jms|MessageListener|QueueSender|TopicPublisher/.test(f.content)
    );
  })();

  // Détecter Batch — vérifier les batchJobs ou les raw files avec Batch patterns
  const hasBatch = (() => {
    if (ir.batchJobs?.some(b => b.batchRole !== "LISTENER")) return true;
    const rawFiles = (ir as any)._rawFiles ?? [];
    return rawFiles.some((f: any) =>
      /ItemReader|ItemWriter|ItemProcessor|Batchlet|@BatchProperty|javax\.batch|jakarta\.batch/.test(f.content)
    );
  })();

  if (hasJms) {
    deps.push(`        <!-- Kafka (migré depuis JMS) -->
        <dependency>
            <groupId>org.springframework.kafka</groupId>
            <artifactId>spring-kafka</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.kafka</groupId>
            <artifactId>spring-kafka-test</artifactId>
            <scope>test</scope>
        </dependency>`);
  }

  if (hasBatch) {
    deps.push(`        <!-- Spring Batch (migré depuis JSR-352) -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-batch</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.batch</groupId>
            <artifactId>spring-batch-test</artifactId>
            <scope>test</scope>
        </dependency>`);
  }

  return deps.join("\n\n");
}

// --- Step 4.2: Syntax Verification ---

export function verifySyntax(files: GeneratedFile[]): CompilationResult {
  const errors: CompilationError[] = [];
  const javaFiles = files.filter(f => f.path.endsWith(".java"));
  let passedFiles = 0;

  for (const file of javaFiles) {
    const fileErrors = verifyJavaFile(file);
    if (fileErrors.length === 0) {
      passedFiles++;
    } else {
      errors.push(...fileErrors);
    }
  }

  return {
    status: errors.some(e => e.severity === "error") ? "ERRORS" : errors.length > 0 ? "WARNINGS" : "OK",
    errors,
    checkedFiles: javaFiles.length,
    passedFiles,
  };
}

function verifyJavaFile(file: GeneratedFile): CompilationError[] {
  const errors: CompilationError[] = [];
  const lines = file.content.split("\n");
  const fileName = file.path.split("/").pop() || file.path;

  // 1. Check brace balance
  let braceCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleaned = line.replace(/"[^"]*"/g, "").replace(/\/\/.*$/, "");
    for (const ch of cleaned) {
      if (ch === "{") braceCount++;
      if (ch === "}") braceCount--;
    }
    if (braceCount < 0) {
      errors.push({ file: fileName, line: i + 1, column: 0, message: "Unexpected closing brace", severity: "error" });
    }
  }
  if (braceCount !== 0) {
    errors.push({ file: fileName, line: lines.length, column: 0, message: `Unbalanced braces: ${braceCount > 0 ? "missing" : "extra"} ${Math.abs(braceCount)} closing brace(s)`, severity: "error" });
  }

  // 2. Check package declaration
  if (!file.content.match(/^package\s+[\w.]+;/m) && file.path.endsWith(".java") && !file.path.includes("module-info")) {
    errors.push({ file: fileName, line: 1, column: 0, message: "Missing package declaration", severity: "error" });
  }

  // 3. Check for duplicate imports
  const importLines = lines.filter(l => l.trim().startsWith("import "));
  const importSet = new Set<string>();
  for (const imp of importLines) {
    const trimmed = imp.trim();
    if (importSet.has(trimmed)) {
      const lineNum = lines.indexOf(imp) + 1;
      errors.push({ file: fileName, line: lineNum, column: 0, message: `Duplicate import: ${trimmed}`, severity: "warning" });
    }
    importSet.add(trimmed);
  }

  // 4. Check for "Object" type usage (R9 violation)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("//") || line.trim().startsWith("*") || line.trim().startsWith("/*")) continue;
    if (/\bObject\b/.test(line) && !line.includes("@Override") && !line.includes("Object...") && !line.includes("ObjectMapper")) {
      if (/private\s+Object\s+/.test(line) || /public\s+Object\s+/.test(line) || /\(Object\s+/.test(line)) {
        errors.push({ file: fileName, line: i + 1, column: 0, message: "R9 violation: 'Object' type used -- should be a specific type", severity: "warning" });
      }
    }
  }

  // 5. Check for missing semicolons on declarations
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*") || line.startsWith("@") || line.startsWith("package") || line.startsWith("import")) continue;
    if (line.endsWith("{") || line.endsWith("}") || line.endsWith(",") || line.endsWith("(") || line.endsWith(")")) continue;
    if (/^(private|public|protected)\s+\w+\s+\w+\s*=/.test(line) && !line.endsWith(";")) {
      errors.push({ file: fileName, line: i + 1, column: line.length, message: "Missing semicolon", severity: "error" });
    }
  }

  return errors;
}


// ── FIX F v7.3: Auto-generate missing DTOs for inferred return types ────────

/**
 * Simplified version of inferReturnTypeFromSource used at DTO-generation time.
 * Only needs to determine the DTO class name, not the full type resolution.
 */
function inferReturnTypeForDtoGen(rawSource: string, className: string): string | null {
  if (!rawSource) return null;

  // Heuristic 1: void-like methods
  const voidPatterns = /deconnex|logout|disconnect|destroy|cleanup|invalidat|fermer|close/i;
  if (voidPatterns.test(className)) return null;

  // Heuristic 2: "return new XxxDTO(...)" or "return new XxxResponse(...)"
  const returnNewMatch = rawSource.match(/return\s+new\s+(\w+(?:DTO|Response|Result|Info|Data))\s*\(/);
  if (returnNewMatch) return returnNewMatch[1];

  // Heuristic 3: Typed variable assignment
  const typedVarMatch = rawSource.match(/(\w+(?:DTO|Response|Result|Info|Data))\s+\w+\s*=/);
  if (typedVarMatch) return typedVarMatch[1];

  // Heuristic 4: Cast pattern
  const castMatch = rawSource.match(/return\s+\((\w+(?:DTO|Response|Result|Info|Data))\)\s+/);
  if (castMatch) return castMatch[1];

  // Heuristic 5: handlePostXxx → XxxResponseDTO
  const handleMatch = className.match(/^handlePost(\w+)$/i);
  if (handleMatch) {
    return `${handleMatch[1]}ResponseDTO`;
  }

  // Heuristic 6: For auth-related methods, generate AuthResponseDTO
  const authPatterns = /connexion|authentif|login|signin|signon/i;
  if (authPatterns.test(className)) {
    return "AuthenticationResponseDTO";
  }

  return null;
}

/**
 * Generate a stub DTO for auth-related or inferred types.
 * Produces a minimal Lombok @Data class with common fields based on the DTO name.
 */
function generateAuthDto(
  basePackage: string,
  basePath: string,
  dtoName: string,
  domain: string
): GeneratedFile | null {
  if (!dtoName || dtoName === "Void") return null;

  const isResponse = /Response|Result/i.test(dtoName);
  const isRequest = /Request/i.test(dtoName);
  const isAuth = /Auth|Connexion|Login|Session/i.test(dtoName);

  let fields: string;

  if (isAuth && isResponse) {
    fields = `    /** JWT or session token */
    private String token;

    /** Token expiration time in milliseconds */
    private Long expiresAt;

    /** User identifier */
    private String userId;

    /** User display name */
    private String displayName;

    /** User roles */
    private java.util.List<String> roles;

    /** Whether authentication was successful */
    private boolean success;

    /** Optional error message */
    private String message;`;
  } else if (isAuth && isRequest) {
    fields = `    /** User login identifier */
    @jakarta.validation.constraints.NotBlank
    private String username;

    /** User password */
    @jakarta.validation.constraints.NotBlank
    private String password;

    /** Channel identifier */
    private String canal;

    /** Client IP address */
    private String ipAddress;`;
  } else if (isResponse) {
    fields = `    /** Operation status */
    private boolean success;

    /** Response message */
    private String message;

    /** Response data */
    private Object data;`;
  } else if (isRequest) {
    fields = `    /** Request identifier */
    private String id;

    /** Request payload */
    private String payload;`;
  } else {
    fields = `    /** Identifier */
    private String id;

    /** Value */
    private String value;`;
  }

  return {
    path: `${basePath}/dto/${dtoName}.java`,
    category: "dto",
    content: `package ${basePackage}.dto;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;

/**
 * ${dtoName} — Auto-generated DTO for ${domain} domain.
 * Generated by Compleo v7.3 FIX F (inferred type resolution).
 * Customize fields as needed for your business requirements.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ${dtoName} {

${fields}
}
`,
  };
}

function toPascalCaseLocal(s: string): string {
  return s.replace(/(^|[_-])(\w)/g, (_, __, c) => c.toUpperCase());
}
