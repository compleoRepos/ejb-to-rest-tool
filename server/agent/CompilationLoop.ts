/**
 * CompilationLoop — Boucle de compilation autonome avec auto-correction.
 * v10.1 — Self-Healing via LLM on-premise (modèle fine-tuné ejb-modernizer).
 *
 * Architecture à 2 niveaux de correction :
 *   Niveau 1 : Corrections déterministes (regex, AST) — rapide, gratuit
 *   Niveau 2 : Corrections LLM (modèle fine-tuné) — pour les erreurs complexes
 *
 * Le LLM est appelé UNIQUEMENT quand :
 *   - Les corrections rule-based ne suffisent pas (erreurs unfixable)
 *   - Le modèle fine-tuné ou Manus est disponible
 *   - Le nombre max d'appels LLM n'est pas atteint (budget)
 *
 * @author Compleo
 */

import { llmGenerateCodeWithBackend, isLLMAvailable, type LLMBackend } from "../engine/ml/llm-adapter";

// --- Types ------------------------------------------------------------------

export interface GeneratedFile {
  path: string;
  content: string;
  category?: string;
}

export interface CompilationError {
  file: string;
  line: number;
  column: number;
  message: string;
  code: string; // MISSING_IMPORT | DUPLICATE_METHOD | UNRESOLVED_TYPE | MISSING_PACKAGE | UNKNOWN
  autoFixable: boolean;
}

export interface CompilationResult {
  success: boolean;
  errors: CompilationError[];
  warnings: string[];
}

export interface LLMFixResult {
  file: string;
  description: string;
  backend: LLMBackend;
  originalError: CompilationError;
  confidence: "high" | "medium" | "low";
}

export interface LoopIteration {
  attempt: number;
  errorsFound: number;
  errorsFixed: number;
  errorsRemaining: number;
  fixes: { file: string; description: string }[];
  llmFixes: LLMFixResult[];
  unfixable: CompilationError[];
}

export type LoopStatus = "SUCCESS" | "FIXED" | "NEEDS_HUMAN" | "PARTIAL";

export interface LoopResult {
  status: LoopStatus;
  iterations: LoopIteration[];
  totalAttempts: number;
  finalErrors: CompilationError[];
  project: GeneratedFile[];
  llmStats: {
    totalCalls: number;
    successfulFixes: number;
    failedFixes: number;
    backend: LLMBackend | "none";
  };
}

export type LoopEventCallback = (event: {
  type:
    | "compilation_start"
    | "compilation_result"
    | "fix_applied"
    | "fix_failed"
    | "llm_fix_start"
    | "llm_fix_applied"
    | "llm_fix_failed"
    | "loop_complete";
  attempt?: number;
  maxAttempts?: number;
  error?: CompilationError;
  fix?: { file: string; description: string };
  llmFix?: LLMFixResult;
  result?: LoopResult;
}) => void;

export interface CompilationLoopConfig {
  /** Enable LLM self-healing (default: true) */
  enableLLM?: boolean;
  /** Max LLM calls per iteration (default: 10) */
  maxLLMCallsPerIteration?: number;
  /** Max total LLM calls across all iterations (default: 25) */
  maxTotalLLMCalls?: number;
  /** Group errors by file before sending to LLM (default: true) */
  batchByFile?: boolean;
}

// --- Known Java standard library types --------------------------------------

const JAVA_STANDARD_TYPES = new Set([
  // java.lang (auto-imported)
  "String", "Integer", "Long", "Double", "Float", "Boolean", "Byte", "Short", "Character",
  "Object", "Class", "System", "Math", "Thread", "Runnable", "Exception", "RuntimeException",
  "Throwable", "Error", "StringBuilder", "StringBuffer", "Comparable", "Iterable",
  "Number", "Void", "Enum", "Override", "Deprecated", "SuppressWarnings",
  // java.util
  "List", "ArrayList", "Map", "HashMap", "Set", "HashSet", "LinkedList", "TreeMap", "TreeSet",
  "Collection", "Collections", "Arrays", "Optional", "Date", "Calendar", "UUID",
  "Iterator", "Comparator", "Queue", "Deque", "LinkedHashMap", "LinkedHashSet",
  "ConcurrentHashMap", "Properties", "Stack", "Vector",
  // java.math
  "BigDecimal", "BigInteger",
  // java.time
  "LocalDate", "LocalDateTime", "LocalTime", "ZonedDateTime", "Instant", "Duration", "Period",
  "DateTimeFormatter",
  // java.io
  "Serializable", "InputStream", "OutputStream", "File", "IOException",
  // Primitives
  "int", "long", "double", "float", "boolean", "byte", "short", "char", "void",
]);

const SPRING_ANNOTATIONS = new Set([
  // Spring Core
  "Component", "Service", "Repository", "Controller", "RestController", "Configuration",
  "Bean", "Autowired", "Value", "Qualifier", "Primary", "Lazy", "Scope",
  "PostConstruct", "PreDestroy",
  // Spring Web
  "RequestMapping", "GetMapping", "PostMapping", "PutMapping", "DeleteMapping", "PatchMapping",
  "RequestBody", "ResponseBody", "PathVariable", "RequestParam", "RequestHeader",
  "ResponseStatus", "CrossOrigin", "RestControllerAdvice", "ExceptionHandler",
  // Spring Data
  "Entity", "Table", "Id", "GeneratedValue", "Column", "ManyToOne", "OneToMany",
  "ManyToMany", "OneToOne", "JoinColumn", "Transient", "Enumerated",
  "Transactional", "Modifying", "Query",
  // Spring Boot
  "SpringBootApplication", "EnableAutoConfiguration", "ComponentScan",
  "ConditionalOnProperty", "ConfigurationProperties",
  // Validation
  "Valid", "NotNull", "NotBlank", "NotEmpty", "Size", "Min", "Max", "Email",
  "Pattern", "Positive", "PositiveOrZero", "DecimalMin", "DecimalMax", "Past", "Future",
  // Lombok
  "Data", "Getter", "Setter", "NoArgsConstructor", "AllArgsConstructor",
  "RequiredArgsConstructor", "Builder", "ToString", "EqualsAndHashCode", "Slf4j", "Log4j2",
  // OpenAPI
  "Operation", "ApiResponse", "ApiResponses", "Tag", "Schema", "Parameter",
  // Test
  "Test", "BeforeEach", "AfterEach", "BeforeAll", "AfterAll", "DisplayName",
  "ExtendWith", "MockBean", "Autowired", "SpringBootTest", "WebMvcTest",
  "DataJpaTest", "AutoConfigureMockMvc",
  // Kafka
  "KafkaListener", "KafkaHandler", "EnableKafka",
  // Batch
  "StepScope", "JobScope", "EnableBatchProcessing",
]);

const KNOWN_SPRING_TYPES = new Set([
  "ResponseEntity", "HttpStatus", "MediaType", "PageRequest", "Page", "Pageable", "Sort",
  "JpaRepository", "CrudRepository", "JpaSpecificationExecutor", "Specification",
  "MockMvc", "ObjectMapper", "WebApplicationContext",
  "KafkaTemplate", "ConsumerRecord", "ProducerRecord",
  "Job", "Step", "JobBuilderFactory", "StepBuilderFactory", "ItemReader", "ItemWriter",
  "ItemProcessor", "FlatFileItemReader", "FlatFileItemWriter",
  "JobExecution", "StepExecution", "ExecutionContext",
  "Logger", "LoggerFactory",
]);

// --- CompilationLoop --------------------------------------------------------

export class CompilationLoop {
  private onEvent: LoopEventCallback | null = null;
  private config: Required<CompilationLoopConfig>;
  private totalLLMCalls = 0;

  constructor(config?: CompilationLoopConfig) {
    this.config = {
      enableLLM: config?.enableLLM ?? true,
      maxLLMCallsPerIteration: config?.maxLLMCallsPerIteration ?? 10,
      maxTotalLLMCalls: config?.maxTotalLLMCalls ?? 25,
      batchByFile: config?.batchByFile ?? true,
    };
  }

  /** Register an event listener for real-time feedback */
  setEventListener(cb: LoopEventCallback) {
    this.onEvent = cb;
  }

  /** Run the compilation loop with auto-correction + LLM self-healing */
  async run(project: GeneratedFile[], maxIterations = 8): Promise<LoopResult> {
    const iterations: LoopIteration[] = [];
    let currentProject = [...project.map(f => ({ ...f }))];
    this.totalLLMCalls = 0;

    // Check LLM availability once at start
    let llmAvailable = false;
    let llmBackend: LLMBackend = "none";
    if (this.config.enableLLM) {
      llmAvailable = await isLLMAvailable();
    }

    // Build type registry from project files
    const projectTypes = this.buildTypeRegistry(currentProject);

    for (let attempt = 1; attempt <= maxIterations; attempt++) {
      this.emit({ type: "compilation_start", attempt, maxAttempts: maxIterations });

      // Compile (static analysis)
      const result = this.compile(currentProject, projectTypes);

      this.emit({
        type: "compilation_result",
        attempt,
        maxAttempts: maxIterations,
        result: {
          status: result.success ? "SUCCESS" : "NEEDS_HUMAN",
          iterations,
          totalAttempts: attempt,
          finalErrors: result.errors,
          project: currentProject,
          llmStats: { totalCalls: this.totalLLMCalls, successfulFixes: 0, failedFixes: 0, backend: llmBackend },
        },
      });

      if (result.success) {
        const loopResult: LoopResult = {
          status: attempt === 1 ? "SUCCESS" : "FIXED",
          iterations,
          totalAttempts: attempt,
          finalErrors: [],
          project: currentProject,
          llmStats: { totalCalls: this.totalLLMCalls, successfulFixes: 0, failedFixes: 0, backend: llmBackend },
        };
        this.emit({ type: "loop_complete", result: loopResult });
        return loopResult;
      }

      // --- Niveau 1 : Corrections déterministes -------------------------
      const fixes: { file: string; description: string }[] = [];
      const unfixable: CompilationError[] = [];

      for (const error of result.errors) {
        if (error.autoFixable) {
          const fixed = this.applyFix(error, currentProject, projectTypes);
          if (fixed) {
            fixes.push(fixed);
            this.emit({ type: "fix_applied", attempt, fix: fixed });
          } else {
            unfixable.push(error);
            this.emit({ type: "fix_failed", attempt, error });
          }
        } else {
          unfixable.push(error);
          this.emit({ type: "fix_failed", attempt, error });
        }
      }

      // --- Niveau 2 : Self-Healing via LLM ------------------------------
      const llmFixes: LLMFixResult[] = [];

      if (
        llmAvailable &&
        unfixable.length > 0 &&
        this.totalLLMCalls < this.config.maxTotalLLMCalls
      ) {
        const llmResults = await this.applyLLMFixes(
          unfixable,
          currentProject,
          attempt
        );
        for (const llmResult of llmResults) {
          llmFixes.push(llmResult);
          if (llmResult.backend !== "none") {
            llmBackend = llmResult.backend;
          }
        }

        // Remove successfully fixed errors from unfixable
        const fixedFiles = new Set(llmFixes.map(f => `${f.file}:${f.originalError.message}`));
        const stillUnfixable = unfixable.filter(
          e => !fixedFiles.has(`${e.file}:${e.message}`)
        );
        unfixable.length = 0;
        unfixable.push(...stillUnfixable);
      }

      // --- Niveau 3 : Cross-File Analysis & Auto-Correction ------------
      const crossFileFixes = this.applyCrossFileFixes(currentProject, projectTypes);
      for (const cf of crossFileFixes) {
        fixes.push(cf);
        this.emit({ type: "fix_applied", attempt, fix: cf });
      }

      iterations.push({
        attempt,
        errorsFound: result.errors.length,
        errorsFixed: fixes.length + llmFixes.length,
        errorsRemaining: unfixable.length,
        fixes,
        llmFixes,
        unfixable,
      });

      // If no fixes were applied (neither rule-based nor LLM), stop looping
      if (fixes.length === 0 && llmFixes.length === 0) {
        const loopResult: LoopResult = {
          status: "NEEDS_HUMAN",
          iterations,
          totalAttempts: attempt,
          finalErrors: unfixable,
          project: currentProject,
          llmStats: {
            totalCalls: this.totalLLMCalls,
            successfulFixes: iterations.reduce((sum, i) => sum + i.llmFixes.length, 0),
            failedFixes: this.totalLLMCalls - iterations.reduce((sum, i) => sum + i.llmFixes.length, 0),
            backend: llmBackend,
          },
        };
        this.emit({ type: "loop_complete", result: loopResult });
        return loopResult;
      }
    }

    // Max iterations reached
    const finalResult = this.compile(currentProject, projectTypes);
    const totalLLMFixes = iterations.reduce((sum, i) => sum + i.llmFixes.length, 0);
    const loopResult: LoopResult = {
      status: finalResult.success
        ? "FIXED"
        : iterations.some(i => i.errorsFixed > 0)
          ? "PARTIAL"
          : "NEEDS_HUMAN",
      iterations,
      totalAttempts: maxIterations,
      finalErrors: finalResult.errors,
      project: currentProject,
      llmStats: {
        totalCalls: this.totalLLMCalls,
        successfulFixes: totalLLMFixes,
        failedFixes: this.totalLLMCalls - totalLLMFixes,
        backend: llmBackend,
      },
    };
    this.emit({ type: "loop_complete", result: loopResult });
    return loopResult;
  }

  // --- LLM Self-Healing -----------------------------------------------------

  /**
   * Envoie les erreurs unfixable au LLM pour correction.
   * Regroupe les erreurs par fichier pour minimiser les appels.
   */
  private async applyLLMFixes(
    errors: CompilationError[],
    project: GeneratedFile[],
    attempt: number
  ): Promise<LLMFixResult[]> {
    const results: LLMFixResult[] = [];
    const budget = Math.min(
      this.config.maxLLMCallsPerIteration,
      this.config.maxTotalLLMCalls - this.totalLLMCalls
    );

    if (budget <= 0) return results;

    // Group errors by file
    const errorsByFile = new Map<string, CompilationError[]>();
    for (const error of errors) {
      const existing = errorsByFile.get(error.file) || [];
      existing.push(error);
      errorsByFile.set(error.file, existing);
    }

    // Process each file (up to budget)
    let callsUsed = 0;
    for (const [filePath, fileErrors] of errorsByFile) {
      if (callsUsed >= budget) break;

      const fileIndex = project.findIndex(f => f.path === filePath);
      if (fileIndex === -1) continue;

      const file = project[fileIndex];
      if (!file.path.endsWith(".java")) continue;

      this.emit({ type: "llm_fix_start", attempt, error: fileErrors[0] });

      try {
        const fixedContent = await this.callLLMForFix(file, fileErrors, project);
        this.totalLLMCalls++;
        callsUsed++;

        if (fixedContent && fixedContent !== file.content) {
          // Validate the fix: re-compile just this file
          const isValid = this.validateLLMFix(fixedContent, file.path, project, fileIndex);

          if (isValid) {
            project[fileIndex] = { ...file, content: fixedContent };

            const fixResult: LLMFixResult = {
              file: filePath,
              description: `LLM a corrigé ${fileErrors.length} erreur(s) : ${fileErrors.map(e => e.code).join(", ")}`,
              backend: "finetuned", // Will be updated by actual response
              originalError: fileErrors[0],
              confidence: fileErrors.length <= 2 ? "high" : "medium",
            };
            results.push(fixResult);
            this.emit({ type: "llm_fix_applied", attempt, llmFix: fixResult });
          } else {
            // LLM fix introduced new errors — revert
            this.emit({ type: "llm_fix_failed", attempt, error: fileErrors[0] });
          }
        } else {
          this.emit({ type: "llm_fix_failed", attempt, error: fileErrors[0] });
        }
      } catch {
        this.totalLLMCalls++;
        callsUsed++;
        this.emit({ type: "llm_fix_failed", attempt, error: fileErrors[0] });
      }
    }

    return results;
  }

  /**
   * Construit le prompt et appelle le LLM pour corriger un fichier Java.
   * Inclut des règles spécifiques pour les patterns legacy (SOAP, EJB, EAI).
   */
  private async callLLMForFix(
    file: GeneratedFile,
    errors: CompilationError[],
    project: GeneratedFile[]
  ): Promise<string | null> {
    const errorDescriptions = errors
      .map(e => `  - Ligne ${e.line}: [${e.code}] ${e.message}`)
      .join("\n");

    // Collect related files for context (imports, referenced types)
    const relatedContext = this.buildRelatedContext(file, project);

    // Detect legacy patterns in the file to add specialized rules
    const legacyRules = this.buildLegacyMigrationRules(file.content);

    const prompt = `Tu es un expert Java Spring Boot spécialisé dans la migration de code legacy (EJB, SOAP, EAI) vers Spring Boot 3.x. Corrige le fichier Java suivant qui contient des erreurs de compilation.

## Erreurs détectées :
${errorDescriptions}

## Fichier à corriger (${file.path}) :
\`\`\`java
${file.content}
\`\`\`

${relatedContext ? `## Contexte du projet (classes liées) :\n${relatedContext}\n` : ""}

## Règles générales :
1. Retourne UNIQUEMENT le fichier Java corrigé complet (pas d'explication)
2. Conserve la même structure, le même package et les mêmes annotations
3. Corrige les imports manquants en utilisant les packages Spring Boot standard
4. Si un type n'existe pas dans le projet, crée l'interface/classe manquante OU remplace par un type existant
5. Ne supprime JAMAIS de logique métier — corrige uniquement les erreurs de compilation
6. Utilise les conventions Spring Boot 3.x (jakarta.* au lieu de javax.*)
7. Si une méthode est dupliquée, fusionne-les intelligemment
${legacyRules}
## Fichier corrigé :`;

    try {
      const result = await llmGenerateCodeWithBackend(prompt, {
        temperature: 0.1,
        maxTokens: 4096,
      });

      if (!result) return null;

      // llmGenerateCodeWithBackend already extracts the code block
      return result.code || null;
    } catch {
      return null;
    }
  }

  /**
   * Construit des règles de migration spécifiques basées sur les patterns legacy détectés dans le fichier.
   * Ajoute des instructions contextuelles pour que le LLM sache comment remplacer les types legacy.
   */
  private buildLegacyMigrationRules(content: string): string {
    const rules: string[] = [];

    // Détection SOAP / WebService legacy
    if (content.includes("SynchroneService") || content.includes("AsynchroneService")) {
      rules.push(
        "8. MIGRATION SOAP: Remplace tout appel à `SynchroneService.process(...)` ou `AsynchroneService.process(...)` par un appel REST via `org.springframework.web.reactive.function.client.WebClient` ou `org.springframework.web.client.RestTemplate`. Crée un champ `private final WebClient webClient;` injecté par constructeur, et utilise `webClient.post().uri(...).bodyValue(...).retrieve().bodyToMono(...)` pour les appels synchrones."
      );
    }

    // Détection Services.find() / ServiceLocator pattern
    if (content.includes("Services.find(") || content.includes("ServiceLocator")) {
      rules.push(
        "9. MIGRATION SERVICE LOCATOR: Remplace tout appel à `Services.find(...)` ou `ServiceLocator.lookup(...)` par une injection Spring `@Autowired` ou injection par constructeur. Déclare le service comme un champ `private final XxxService xxxService;` et injecte-le via `@RequiredArgsConstructor`."
      );
    }

    // Détection Envelope / VoIn / VoOut (pattern EAI bancaire)
    if (content.includes("Envelope") || content.includes("VoIn") || content.includes("VoOut")) {
      rules.push(
        "10. MIGRATION EAI ENVELOPE: Remplace les types `Envelope`, `VoIn`, `VoOut` par des DTOs Spring standard. `Envelope` devient un simple wrapper DTO avec `private String status; private Object data;`. `VoIn`/`VoOut` deviennent des Request/Response DTOs avec les mêmes champs. Utilise `@Data @NoArgsConstructor @AllArgsConstructor` de Lombok."
      );
    }

    // Détection GenerateFlux / flux XML legacy
    if (content.includes("GenerateFlux") || content.includes("generateFlux")) {
      rules.push(
        "11. MIGRATION FLUX XML: Remplace `GenerateFlux` par la sérialisation Jackson standard. Utilise `ObjectMapper` pour convertir les objets en JSON/XML. Remplace `GenerateFlux.generate(...)` par `objectMapper.writeValueAsString(dto)`. Déclare `private final ObjectMapper objectMapper;` injecté par constructeur."
      );
    }

    // Détection JNDI / InitialContext
    if (content.includes("InitialContext") || content.includes("Context.lookup") || content.includes("jndi")) {
      rules.push(
        "12. MIGRATION JNDI: Remplace tout lookup JNDI (`new InitialContext()`, `ctx.lookup(...)`) par une injection Spring `@Autowired`. Les EJB référencés via JNDI deviennent des services Spring injectés par constructeur."
      );
    }

    // Détection EJB @Stateless / @Remote
    if (content.includes("@Stateless") || content.includes("@Remote") || content.includes("@EJB")) {
      rules.push(
        "13. MIGRATION EJB: Remplace `@Stateless` par `@Service`, `@Remote` par rien (REST expose l'API), `@EJB` par `@Autowired` ou injection constructeur. Supprime les interfaces Remote/Local et utilise directement la classe de service."
      );
    }

    // Détection JDBC direct (Statement, PreparedStatement, ResultSet)
    if (content.includes("PreparedStatement") || content.includes("ResultSet") || content.includes("getConnection")) {
      rules.push(
        "14. MIGRATION JDBC: Remplace le JDBC brut par Spring Data JPA. `PreparedStatement`/`ResultSet` → `JpaRepository` avec des méthodes dérivées ou `@Query`. `getConnection()` → supprimé (Spring gère le pool). Les try-catch JDBC → `@Transactional` sur le service."
      );
    }

    if (rules.length === 0) return "\n";

    return `\n## Règles de migration legacy spécifiques :\n${rules.join("\n")}\n\n`;
  }

  /**
   * Valide que le fix LLM n'introduit pas de NOUVELLES erreurs.
   * Compare le nombre d'erreurs avant/après.
   */
  private validateLLMFix(
    fixedContent: string,
    filePath: string,
    project: GeneratedFile[],
    fileIndex: number
  ): boolean {
    // Save original
    const original = project[fileIndex].content;

    // Temporarily apply fix
    project[fileIndex] = { ...project[fileIndex], content: fixedContent };
    const projectTypes = this.buildTypeRegistry(project);
    const afterResult = this.compile(project, projectTypes);

    // Restore original
    project[fileIndex] = { ...project[fileIndex], content: original };
    const beforeResult = this.compile(project, projectTypes);

    // Count errors for this specific file
    const beforeErrors = beforeResult.errors.filter(e => e.file === filePath).length;
    const afterErrors = afterResult.errors.filter(e => e.file === filePath).length;

    // Accept if fewer errors (or same but different — LLM might fix one and introduce another)
    return afterErrors < beforeErrors;
  }

  /**
   * Construit le contexte des classes liées pour aider le LLM.
   * Extrait les interfaces/classes référencées dans le fichier.
   */
  private buildRelatedContext(file: GeneratedFile, project: GeneratedFile[]): string {
    const referencedTypes = new Set<string>();

    // Extract type references from imports
    const importMatches = file.content.matchAll(/import\s+[\w.]+\.(\w+)\s*;/g);
    for (const match of importMatches) {
      referencedTypes.add(match[1]);
    }

    // Extract extends/implements
    const extendsMatch = file.content.match(/(?:extends|implements)\s+([\w,\s]+)/g);
    if (extendsMatch) {
      for (const m of extendsMatch) {
        const types = m.replace(/extends|implements/g, "").trim().split(/[,\s]+/);
        types.forEach(t => { if (t && /^[A-Z]/.test(t)) referencedTypes.add(t); });
      }
    }

    // Find matching files in project (limit to 3 for token budget)
    const relatedFiles: string[] = [];
    for (const pFile of project) {
      if (pFile.path === file.path) continue;
      if (!pFile.path.endsWith(".java")) continue;

      const className = pFile.content.match(
        /(?:public\s+)?(?:abstract\s+)?(?:class|interface|enum|record)\s+(\w+)/
      );
      if (className && referencedTypes.has(className[1])) {
        // Truncate to first 50 lines for context
        const truncated = pFile.content.split("\n").slice(0, 50).join("\n");
        relatedFiles.push(`// ${pFile.path}\n${truncated}`);
        if (relatedFiles.length >= 3) break;
      }
    }

    return relatedFiles.length > 0
      ? relatedFiles.map(f => `\`\`\`java\n${f}\n\`\`\``).join("\n\n")
      : "";
  }

  // --- Static Analysis Compiler -------------------------------------------

  compile(project: GeneratedFile[], projectTypes?: Set<string>): CompilationResult {
    const types = projectTypes || this.buildTypeRegistry(project);
    const errors: CompilationError[] = [];
    const warnings: string[] = [];

    for (const file of project) {
      if (!file.path.endsWith(".java")) continue;
      const lines = file.content.split("\n");

      // Extract imports and used types
      const imports = new Set<string>();
      const importLines: { line: number; pkg: string; className: string }[] = [];

      for (let i = 0; i < lines.length; i++) {
        const importMatch = lines[i].match(/^\s*import\s+([\w.]+)\s*;/);
        if (importMatch) {
          const fullImport = importMatch[1];
          const className = fullImport.split(".").pop()!;
          imports.add(className);
          importLines.push({ line: i + 1, pkg: fullImport, className });
        }
      }

      // Check for duplicate methods
      const methodSignatures = new Map<string, number>();
      for (let i = 0; i < lines.length; i++) {
        const methodMatch = lines[i].match(
          /(?:public|private|protected)\s+(?:static\s+)?(?:[\w<>,\s]+)\s+(\w+)\s*\(/
        );
        if (methodMatch) {
          const sig = methodMatch[1];
          if (methodSignatures.has(sig)) {
            errors.push({
              file: file.path,
              line: i + 1,
              column: 1,
              message: `method ${sig}() already defined in class`,
              code: "DUPLICATE_METHOD",
              autoFixable: true,
            });
          } else {
            methodSignatures.set(sig, i + 1);
          }
        }
      }

      // Check for unresolved types in class body
      const classBody = file.content;

      // Find all type references (simplified)
      const typeRefPattern = /(?:new\s+|extends\s+|implements\s+|<|,\s*)([A-Z]\w+)/g;
      const fieldTypePattern = /(?:private|protected|public)\s+(?:final\s+)?([A-Z]\w+)/g;
      const paramTypePattern = /\(\s*(?:@\w+\s+)*([A-Z]\w+)/g;
      const returnTypePattern = /(?:public|private|protected)\s+(?:static\s+)?([A-Z]\w+)\s+\w+\s*\(/g;

      const allTypeRefs = new Set<string>();
      for (const pattern of [typeRefPattern, fieldTypePattern, paramTypePattern, returnTypePattern]) {
        let match;
        while ((match = pattern.exec(classBody)) !== null) {
          allTypeRefs.add(match[1]);
        }
      }

      // Check each type reference
      for (const typeName of allTypeRefs) {
        if (JAVA_STANDARD_TYPES.has(typeName)) continue;
        if (SPRING_ANNOTATIONS.has(typeName)) continue;
        if (KNOWN_SPRING_TYPES.has(typeName)) continue;
        if (imports.has(typeName)) continue;
        if (types.has(typeName)) {
          // Type exists in project but not imported
          if (!imports.has(typeName)) {
            // Check if it's in the same package
            const filePackage = this.extractPackage(file.content);
            const typePackage = this.findTypePackage(typeName, project);
            if (filePackage && typePackage && filePackage !== typePackage) {
              errors.push({
                file: file.path,
                line: 1,
                column: 1,
                message: `cannot find symbol: class ${typeName}`,
                code: "MISSING_IMPORT",
                autoFixable: true,
              });
            }
          }
          continue;
        }

        // Check if it's an annotation
        const annotationPattern = new RegExp(`@${typeName}\\b`);
        if (annotationPattern.test(classBody)) continue;

        // Unknown type — could be external dependency
        const lineNum = this.findTypeLine(typeName, lines);
        if (lineNum > 0) {
          errors.push({
            file: file.path,
            line: lineNum,
            column: 1,
            message: `cannot find symbol: class ${typeName}`,
            code: "UNRESOLVED_TYPE",
            autoFixable: false,
          });
        }
      }

      // Check for external package imports that don't exist
      for (const imp of importLines) {
        const topPackage = imp.pkg.split(".").slice(0, 3).join(".");
        if (
          topPackage.startsWith("java.") ||
          topPackage.startsWith("javax.") ||
          topPackage.startsWith("jakarta.") ||
          topPackage.startsWith("org.springframework") ||
          topPackage.startsWith("org.apache") ||
          topPackage.startsWith("org.junit") ||
          topPackage.startsWith("org.mockito") ||
          topPackage.startsWith("lombok") ||
          topPackage.startsWith("io.swagger") ||
          topPackage.startsWith("com.fasterxml") ||
          topPackage.startsWith("org.slf4j") ||
          topPackage.startsWith("org.hibernate")
        ) {
          continue;
        }

        // Check if the imported class exists in the project
        if (!types.has(imp.className)) {
          // It's an external dependency
          errors.push({
            file: file.path,
            line: imp.line,
            column: 1,
            message: `package ${imp.pkg.split(".").slice(0, -1).join(".")} does not exist`,
            code: "MISSING_PACKAGE",
            autoFixable: true,
          });
        }
      }
    }

    // Deduplicate errors
    const seen = new Set<string>();
    const uniqueErrors = errors.filter(e => {
      const key = `${e.file}:${e.code}:${e.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      success: uniqueErrors.length === 0,
      errors: uniqueErrors,
      warnings,
    };
  }

  // --- Auto-fix strategies (Niveau 1 — Déterministe) ---------------------

  private applyFix(
    error: CompilationError,
    project: GeneratedFile[],
    projectTypes: Set<string>
  ): { file: string; description: string } | null {
    const fileIndex = project.findIndex(f => f.path === error.file);
    if (fileIndex === -1) return null;

    switch (error.code) {
      case "MISSING_IMPORT":
        return this.fixMissingImport(error, project, fileIndex);

      case "DUPLICATE_METHOD":
        return this.fixDuplicateMethod(error, project, fileIndex);

      case "MISSING_PACKAGE":
        return this.fixMissingPackage(error, project, fileIndex);

      default:
        return null;
    }
  }

  private fixMissingImport(
    error: CompilationError,
    project: GeneratedFile[],
    fileIndex: number
  ): { file: string; description: string } | null {
    const classNameMatch = error.message.match(/class (\w+)/);
    if (!classNameMatch) return null;
    const className = classNameMatch[1];

    // Find the class in the project
    const targetPackage = this.findTypePackage(className, project);
    if (!targetPackage) return null;

    const importStatement = `import ${targetPackage}.${className};`;
    const lines = project[fileIndex].content.split("\n");

    // Find last import line or package line
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("import ")) insertIndex = i + 1;
      else if (lines[i].startsWith("package ")) insertIndex = i + 1;
    }

    // Check if import already exists
    if (lines.some(l => l.trim() === importStatement)) return null;

    lines.splice(insertIndex, 0, importStatement);
    project[fileIndex] = { ...project[fileIndex], content: lines.join("\n") };

    return {
      file: error.file,
      description: `Import ${className} ajoute (${targetPackage}.${className})`,
    };
  }

  private fixDuplicateMethod(
    error: CompilationError,
    project: GeneratedFile[],
    fileIndex: number
  ): { file: string; description: string } | null {
    const methodMatch = error.message.match(/method (\w+)\(\)/);
    if (!methodMatch) return null;
    const methodName = methodMatch[1];

    const lines = project[fileIndex].content.split("\n");
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      const lineMethodMatch = lines[i].match(
        new RegExp(`((?:public|private|protected)\\s+(?:static\\s+)?[\\w<>,\\s]+\\s+)${methodName}(\\s*\\()`)
      );
      if (lineMethodMatch) {
        if (!found) {
          found = true; // Keep the first occurrence
        } else {
          // Rename the duplicate
          const newName = `${methodName}Alt`;
          lines[i] = lines[i].replace(
            new RegExp(`\\b${methodName}\\b`),
            newName
          );
          project[fileIndex] = { ...project[fileIndex], content: lines.join("\n") };
          return {
            file: error.file,
            description: `Methode dupliquee ${methodName}() renommee en ${newName}()`,
          };
        }
      }
    }

    return null;
  }

  private fixMissingPackage(
    error: CompilationError,
    project: GeneratedFile[],
    fileIndex: number
  ): { file: string; description: string } | null {
    const lines = project[fileIndex].content.split("\n");
    const lineIndex = error.line - 1;

    if (lineIndex >= 0 && lineIndex < lines.length && lines[lineIndex].startsWith("import ")) {
      const importLine = lines[lineIndex].trim();
      const importMatch = importLine.match(/^import\s+([\w.]+)\.(\w+)\s*;$/);
      if (!importMatch) return null;

      const fullPackage = importMatch[1];
      const className = importMatch[2];

      // Déterminer si c'est un package interne au projet (même base package)
      const basePackage = this.findMostCommonPackage(project);
      const isInternalPackage = fullPackage.startsWith(basePackage) ||
        fullPackage.split(".").slice(0, 2).join(".") === basePackage.split(".").slice(0, 2).join(".");

      if (isInternalPackage) {
        // --- INTERNE : Générer un stub au lieu de commenter ---
        const stubContent = this.generateStubForMissingClass(className, fullPackage, project);
        const stubPath = `src/main/java/${fullPackage.replace(/\./g, "/")}/${className}.java`;

        const alreadyExists = project.some(f => f.path === stubPath);
        if (!alreadyExists) {
          project.push({ path: stubPath, content: stubContent, category: "generated-stub" });
        }

        return {
          file: stubPath,
          description: `Stub généré pour classe manquante : ${fullPackage}.${className}`,
        };
      } else {
        // --- EXTERNE : Garder si connu, sinon supprimer l'import ---
        const isKnownExternal = this.isKnownExternalDependency(fullPackage);
        if (isKnownExternal) {
          return { file: error.file, description: `Import externe conservé (dépendance Maven) : ${importLine}` };
        } else {
          lines.splice(lineIndex, 1);
          project[fileIndex] = { ...project[fileIndex], content: lines.join("\n") };
          return { file: error.file, description: `Import externe supprimé (non résolu) : ${importLine}` };
        }
      }
    }

    return null;
  }

  private generateStubForMissingClass(className: string, packageName: string, project: GeneratedFile[]): string {
    const lines: string[] = [`package ${packageName};`, ""];

    if (className.endsWith("DTO") || className.endsWith("Dto") || className.endsWith("Request") || className.endsWith("Response") || className.endsWith("Vo")) {
      lines.push("import lombok.Data;", "import lombok.NoArgsConstructor;", "import lombok.AllArgsConstructor;", "");
      lines.push("/** DTO généré automatiquement \u2014 TODO: Compléter les champs. */");
      lines.push("@Data", "@NoArgsConstructor", "@AllArgsConstructor");
      lines.push(`public class ${className} {`, "");
      const inferredFields = this.inferFieldsFromUsage(className, project);
      for (const f of inferredFields) lines.push(`    private ${f.type} ${f.name};`);
      if (inferredFields.length === 0) lines.push("    private Long id;");
      lines.push("}");
    } else if (className.endsWith("Exception")) {
      lines.push(`public class ${className} extends RuntimeException {`, "");
      lines.push(`    public ${className}() { super(); }`);
      lines.push(`    public ${className}(String message) { super(message); }`);
      lines.push(`    public ${className}(String message, Throwable cause) { super(message, cause); }`);
      lines.push("}");
    } else if (className.endsWith("Repository")) {
      const entity = className.replace("Repository", "");
      lines.push(`import org.springframework.data.jpa.repository.JpaRepository;`, "import org.springframework.stereotype.Repository;", "");
      lines.push("@Repository");
      lines.push(`public interface ${className} extends JpaRepository<${entity}, Long> {`, "}");
    } else if (className.endsWith("Service") && !className.endsWith("ServiceImpl")) {
      lines.push(`/** Interface de service générée \u2014 TODO: Ajouter les méthodes métier. */`);
      lines.push(`public interface ${className} {`, "}");
    } else if (className.endsWith("Mapper")) {
      lines.push("import org.mapstruct.Mapper;", "import org.mapstruct.MappingConstants;", "");
      lines.push("@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)");
      lines.push(`public interface ${className} {`, "}");
    } else if (className.endsWith("Enum") || className.endsWith("Type") || className.endsWith("Status")) {
      lines.push(`public enum ${className} { DEFAULT }`);
    } else {
      lines.push("import lombok.Data;", "");
      lines.push("/** Classe générée automatiquement \u2014 TODO: Implémenter. */");
      lines.push("@Data");
      lines.push(`public class ${className} {`, "    private Long id;", "}");
    }
    lines.push("");
    return lines.join("\n");
  }

  private inferFieldsFromUsage(className: string, project: GeneratedFile[]): { type: string; name: string }[] {
    const fields: { type: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const file of project) {
      if (!file.path.endsWith(".java") || !file.content.includes(className)) continue;
      const getters = file.content.matchAll(/\.get(\w+)\(\)/g);
      for (const m of getters) {
        const name = m[1].charAt(0).toLowerCase() + m[1].slice(1);
        if (!seen.has(name) && name !== "class") { seen.add(name); fields.push({ type: this.inferFieldType(name), name }); }
        if (fields.length >= 10) break;
      }
      if (fields.length >= 10) break;
    }
    return fields;
  }

  private inferFieldType(name: string): string {
    const l = name.toLowerCase();
    if (l.includes("id") || l.includes("count") || l.includes("number")) return "Long";
    if (l.includes("amount") || l.includes("price") || l.includes("total") || l.includes("balance")) return "BigDecimal";
    if (l.includes("date") || l.includes("time") || l.includes("created") || l.includes("updated")) return "LocalDateTime";
    if (l.includes("active") || l.includes("enabled") || l.includes("valid") || l.includes("flag")) return "Boolean";
    return "String";
  }

  private isKnownExternalDependency(pkg: string): boolean {
    const known = ["org.apache.commons", "com.google.common", "com.google.gson", "org.apache.http",
      "org.apache.poi", "org.apache.kafka", "com.rabbitmq", "org.quartz", "org.jboss",
      "io.jsonwebtoken", "com.auth0", "org.modelmapper", "org.mapstruct", "com.opencsv",
      "net.sf.jasperreports", "org.thymeleaf", "org.primefaces"];
    return known.some(p => pkg.startsWith(p));
  }

  // --- Niveau 3 : Cross-File Analysis & Auto-Correction ---------------

  /**
   * Analyse cross-fichier : détecte et corrige les incohérences entre fichiers générés.
   * - Interfaces déclarées mais non implémentées
   * - Méthodes de repository référencées mais non définies
   * - javax.* → jakarta.* migration
   * - Annotations @Autowired → constructor injection
   * - Génération de classes/interfaces manquantes
   */
  private applyCrossFileFixes(
    project: GeneratedFile[],
    projectTypes: Set<string>
  ): { file: string; description: string }[] {
    const fixes: { file: string; description: string }[] = [];

    // 3a. javax.* → jakarta.* migration (Spring Boot 3.x)
    for (let i = 0; i < project.length; i++) {
      const file = project[i];
      if (!file.path.endsWith(".java")) continue;

      const javaxImports = file.content.match(/import\s+javax\.(persistence|servlet|validation|inject|annotation|transaction|ws|xml\.bind)\./g);
      if (javaxImports && javaxImports.length > 0) {
        let newContent = file.content;
        newContent = newContent.replace(/import\s+javax\.persistence\./g, "import jakarta.persistence.");
        newContent = newContent.replace(/import\s+javax\.servlet\./g, "import jakarta.servlet.");
        newContent = newContent.replace(/import\s+javax\.validation\./g, "import jakarta.validation.");
        newContent = newContent.replace(/import\s+javax\.inject\./g, "import jakarta.inject.");
        newContent = newContent.replace(/import\s+javax\.annotation\./g, "import jakarta.annotation.");
        newContent = newContent.replace(/import\s+javax\.transaction\./g, "import jakarta.transaction.");
        newContent = newContent.replace(/import\s+javax\.ws\./g, "import jakarta.ws.");
        newContent = newContent.replace(/import\s+javax\.xml\.bind\./g, "import jakarta.xml.bind.");
        if (newContent !== file.content) {
          project[i] = { ...file, content: newContent };
          fixes.push({
            file: file.path,
            description: `Migration javax.* → jakarta.* (${javaxImports.length} imports corrigés)`,
          });
        }
      }
    }

    // 3b. @Autowired field injection → constructor injection
    for (let i = 0; i < project.length; i++) {
      const file = project[i];
      if (!file.path.endsWith(".java")) continue;

      const autowiredFields = file.content.match(/@Autowired\s+(?:private|protected)\s+\w+\s+\w+;/g);
      if (autowiredFields && autowiredFields.length >= 2) {
        // Extract field info
        const fields: { type: string; name: string }[] = [];
        for (const af of autowiredFields) {
          const m = af.match(/@Autowired\s+(?:private|protected)\s+(\w+)\s+(\w+);/);
          if (m) fields.push({ type: m[1], name: m[2] });
        }

        if (fields.length > 0) {
          let newContent = file.content;
          // Remove @Autowired annotations from fields
          newContent = newContent.replace(/@Autowired\s*\n\s*((?:private|protected)\s+)/g, "$1final ");
          // Add @RequiredArgsConstructor if not present
          if (!newContent.includes("@RequiredArgsConstructor")) {
            newContent = newContent.replace(
              /(@Service|@Component|@RestController|@Controller|@Repository)/,
              "@RequiredArgsConstructor\n$1"
            );
            // Add import if needed
            if (!newContent.includes("import lombok.RequiredArgsConstructor")) {
              newContent = newContent.replace(
                /(import\s+[\w.]+;\s*\n)/,
                "$1import lombok.RequiredArgsConstructor;\n"
              );
            }
          }
          if (newContent !== file.content) {
            project[i] = { ...file, content: newContent };
            fixes.push({
              file: file.path,
              description: `@Autowired → constructor injection via @RequiredArgsConstructor (${fields.length} champs)`,
            });
          }
        }
      }
    }

    // 3c. Détecter les interfaces référencées mais non définies dans le projet
    const definedTypes = new Map<string, string>(); // typeName → filePath
    for (const file of project) {
      if (!file.path.endsWith(".java")) continue;
      const classMatch = file.content.match(
        /(?:public\s+)?(?:abstract\s+)?(?:class|interface|enum|record)\s+(\w+)/
      );
      if (classMatch) definedTypes.set(classMatch[1], file.path);
    }

    const referencedButMissing = new Set<string>();
    for (const file of project) {
      if (!file.path.endsWith(".java")) continue;

      // Check implements/extends
      const extendsMatch = file.content.match(/(?:extends|implements)\s+([\w,\s]+?)\s*\{/);
      if (extendsMatch) {
        const types = extendsMatch[1].split(/[,\s]+/).filter(t => /^[A-Z]/.test(t));
        for (const t of types) {
          if (!definedTypes.has(t) && !JAVA_STANDARD_TYPES.has(t) && !KNOWN_SPRING_TYPES.has(t)) {
            referencedButMissing.add(t);
          }
        }
      }

      // Check field types (Repository, Service interfaces)
      const fieldTypes = file.content.matchAll(/(?:private|protected)\s+(?:final\s+)?(\w+)\s+\w+;/g);
      for (const m of fieldTypes) {
        const t = m[1];
        if (/^[A-Z]/.test(t) && !definedTypes.has(t) && !JAVA_STANDARD_TYPES.has(t) && !KNOWN_SPRING_TYPES.has(t)) {
          // Check if it looks like a Repository or Service
          if (t.endsWith("Repository") || t.endsWith("Service") || t.endsWith("Mapper")) {
            referencedButMissing.add(t);
          }
        }
      }
    }

    // Generate missing interfaces/classes
    for (const missingType of referencedButMissing) {
      const basePackage = this.findMostCommonPackage(project);
      let generatedContent = "";

      if (missingType.endsWith("Repository")) {
        // Generate a JPA Repository interface
        const entityName = missingType.replace("Repository", "");
        generatedContent = `package ${basePackage}.repository;\n\nimport ${basePackage}.entity.${entityName};\nimport org.springframework.data.jpa.repository.JpaRepository;\nimport org.springframework.stereotype.Repository;\n\n@Repository\npublic interface ${missingType} extends JpaRepository<${entityName}, Long> {\n}\n`;
      } else if (missingType.endsWith("Service")) {
        // Generate a Service interface
        generatedContent = `package ${basePackage}.service;\n\n/**\n * Interface de service générée automatiquement.\n * TODO: Ajouter les méthodes métier nécessaires.\n */\npublic interface ${missingType} {\n}\n`;
      } else if (missingType.endsWith("Mapper")) {
        // Generate a MapStruct Mapper
        generatedContent = `package ${basePackage}.mapper;\n\nimport org.mapstruct.Mapper;\nimport org.mapstruct.MappingConstants;\n\n@Mapper(componentModel = MappingConstants.ComponentModel.SPRING)\npublic interface ${missingType} {\n}\n`;
      } else {
        // Generate a basic interface
        generatedContent = `package ${basePackage}.common;\n\n/**\n * Interface générée automatiquement.\n * TODO: Implémenter les méthodes nécessaires.\n */\npublic interface ${missingType} {\n}\n`;
      }

      if (generatedContent) {
        const subDir = missingType.endsWith("Repository") ? "repository"
          : missingType.endsWith("Service") ? "service"
          : missingType.endsWith("Mapper") ? "mapper" : "common";
        const newPath = `src/main/java/${basePackage.replace(/\./g, "/")}/${subDir}/${missingType}.java`;

        project.push({
          path: newPath,
          content: generatedContent,
          category: "generated-stub",
        });
        projectTypes.add(missingType);
        definedTypes.set(missingType, newPath);

        fixes.push({
          file: newPath,
          description: `Interface/classe manquante générée : ${missingType} (stub)`,
        });
      }
    }

    // 3d. Vérifier la cohérence des annotations Spring Boot
    for (let i = 0; i < project.length; i++) {
      const file = project[i];
      if (!file.path.endsWith(".java")) continue;

      let newContent = file.content;
      let changed = false;

      // Ajouter @Transactional sur les méthodes de service qui modifient des données
      if (file.path.includes("/service/") && file.content.includes("@Service")) {
        const methodPattern = /(?:public\s+)(?!.*@Transactional)(void|\w+)\s+(save|update|delete|create|remove|modify|process|execute|transfer|withdraw|deposit)\w*\s*\(/g;
        let match;
        while ((match = methodPattern.exec(newContent)) !== null) {
          const methodLine = newContent.lastIndexOf("\n", match.index) + 1;
          const lineContent = newContent.substring(methodLine, match.index);
          if (!lineContent.includes("@Transactional")) {
            newContent = newContent.substring(0, methodLine) + "    @Transactional\n" + newContent.substring(methodLine);
            changed = true;
          }
        }
        // Add import if @Transactional was added
        if (changed && !newContent.includes("import org.springframework.transaction.annotation.Transactional")) {
          newContent = newContent.replace(
            /(import\s+[\w.]+;\s*\n)/,
            "$1import org.springframework.transaction.annotation.Transactional;\n"
          );
        }
      }

      // Ajouter @Slf4j sur les classes de service sans logger
      if ((file.path.includes("/service/") || file.path.includes("/controller/")) &&
          !newContent.includes("@Slf4j") && !newContent.includes("Logger") &&
          (newContent.includes("@Service") || newContent.includes("@RestController"))) {
        newContent = newContent.replace(
          /(@Service|@RestController|@Controller)/,
          "@Slf4j\n$1"
        );
        if (!newContent.includes("import lombok.extern.slf4j.Slf4j")) {
          newContent = newContent.replace(
            /(import\s+[\w.]+;\s*\n)/,
            "$1import lombok.extern.slf4j.Slf4j;\n"
          );
        }
        changed = true;
      }

      if (changed && newContent !== file.content) {
        project[i] = { ...file, content: newContent };
        fixes.push({
          file: file.path,
          description: `Annotations Spring Boot ajoutées (@Transactional, @Slf4j)`,
        });
      }
    }

    return fixes;
  }

  /**
   * Trouve le package le plus commun dans le projet pour générer des stubs cohérents.
   */
  private findMostCommonPackage(project: GeneratedFile[]): string {
    const packages = new Map<string, number>();
    for (const file of project) {
      if (!file.path.endsWith(".java")) continue;
      const pkg = this.extractPackage(file.content);
      if (pkg) {
        // Get base package (first 3 segments)
        const base = pkg.split(".").slice(0, 3).join(".");
        packages.set(base, (packages.get(base) || 0) + 1);
      }
    }
    let maxPkg = "com.example.app";
    let maxCount = 0;
    for (const [pkg, count] of packages) {
      if (count > maxCount) {
        maxPkg = pkg;
        maxCount = count;
      }
    }
    return maxPkg;
  }

  // --- Utility methods ---

  private buildTypeRegistry(project: GeneratedFile[]): Set<string> {
    const types = new Set<string>();
    for (const file of project) {
      if (!file.path.endsWith(".java")) continue;
      const classMatch = file.content.match(
        /(?:public\s+)?(?:abstract\s+)?(?:class|interface|enum|record)\s+(\w+)/
      );
      if (classMatch) {
        types.add(classMatch[1]);
      }
    }
    return types;
  }

  private extractPackage(content: string): string | null {
    const match = content.match(/^\s*package\s+([\w.]+)\s*;/m);
    return match ? match[1] : null;
  }

  private findTypePackage(typeName: string, project: GeneratedFile[]): string | null {
    for (const file of project) {
      if (!file.path.endsWith(".java")) continue;
      const classMatch = file.content.match(
        new RegExp(`(?:public\\s+)?(?:abstract\\s+)?(?:class|interface|enum|record)\\s+${typeName}\\b`)
      );
      if (classMatch) {
        return this.extractPackage(file.content);
      }
    }
    return null;
  }

  private findTypeLine(typeName: string, lines: string[]): number {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(typeName) && !lines[i].startsWith("import ") && !lines[i].startsWith("package ")) {
        return i + 1;
      }
    }
    return 0;
  }

  private emit(event: Parameters<LoopEventCallback>[0]) {
    if (this.onEvent) this.onEvent(event);
  }
}