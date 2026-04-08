/**
 * CompilationLoop — Boucle de compilation autonome avec auto-correction.
 *
 * Simule javac par analyse statique du code Java généré :
 * - Détecte les imports manquants
 * - Détecte les méthodes dupliquées
 * - Détecte les types non résolus (Object → type réel)
 * - Détecte les packages externes inexistants
 *
 * Auto-corrige les erreurs connues et boucle jusqu'à convergence.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

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

export interface LoopIteration {
  attempt: number;
  errorsFound: number;
  errorsFixed: number;
  errorsRemaining: number;
  fixes: { file: string; description: string }[];
  unfixable: CompilationError[];
}

export type LoopStatus = "SUCCESS" | "FIXED" | "NEEDS_HUMAN" | "PARTIAL";

export interface LoopResult {
  status: LoopStatus;
  iterations: LoopIteration[];
  totalAttempts: number;
  finalErrors: CompilationError[];
  project: GeneratedFile[];
}

export type LoopEventCallback = (event: {
  type: "compilation_start" | "compilation_result" | "fix_applied" | "fix_failed" | "loop_complete";
  attempt?: number;
  maxAttempts?: number;
  error?: CompilationError;
  fix?: { file: string; description: string };
  result?: LoopResult;
}) => void;

// ─── Known Java standard library types ──────────────────────────────────────

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

// ─── CompilationLoop ────────────────────────────────────────────────────────

export class CompilationLoop {
  private onEvent: LoopEventCallback | null = null;

  /** Register an event listener for real-time feedback */
  setEventListener(cb: LoopEventCallback) {
    this.onEvent = cb;
  }

  /** Run the compilation loop with auto-correction */
  async run(project: GeneratedFile[], maxIterations = 5): Promise<LoopResult> {
    const iterations: LoopIteration[] = [];
    let currentProject = [...project.map(f => ({ ...f }))];

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
        },
      });

      if (result.success) {
        const loopResult: LoopResult = {
          status: attempt === 1 ? "SUCCESS" : "FIXED",
          iterations,
          totalAttempts: attempt,
          finalErrors: [],
          project: currentProject,
        };
        this.emit({ type: "loop_complete", result: loopResult });
        return loopResult;
      }

      // Try to fix errors
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

      iterations.push({
        attempt,
        errorsFound: result.errors.length,
        errorsFixed: fixes.length,
        errorsRemaining: unfixable.length,
        fixes,
        unfixable,
      });

      // If no fixes were applied, stop looping
      if (fixes.length === 0) {
        const loopResult: LoopResult = {
          status: "NEEDS_HUMAN",
          iterations,
          totalAttempts: attempt,
          finalErrors: unfixable,
          project: currentProject,
        };
        this.emit({ type: "loop_complete", result: loopResult });
        return loopResult;
      }
    }

    // Max iterations reached
    const finalResult = this.compile(currentProject, projectTypes);
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
    };
    this.emit({ type: "loop_complete", result: loopResult });
    return loopResult;
  }

  // ─── Static Analysis Compiler ───────────────────────────────────────────

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

  // ─── Auto-fix strategies ────────────────────────────────────────────────

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
      // Comment out the import and add TODO
      lines[lineIndex] = `// TODO: Dependance externe non resolue - ${importLine}`;
      project[fileIndex] = { ...project[fileIndex], content: lines.join("\n") };

      return {
        file: error.file,
        description: `Dependance externe commentee : ${importLine} → TODO ajoute`,
      };
    }

    return null;
  }

  // ─── Utility methods ──────────────────────────────────────────────────

  private buildTypeRegistry(project: GeneratedFile[]): Set<string> {
    const types = new Set<string>();
    for (const file of project) {
      if (!file.path.endsWith(".java")) continue;
      // Extract class/interface/enum names
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
