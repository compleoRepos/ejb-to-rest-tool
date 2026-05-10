/**
 * CompileAutoFixer — Auto-fix compilation errors in generated Spring Boot projects.
 * Rule-based fixes applied iteratively (max 3 iterations).
 *
 * Fix categories:
 * 1. PACKAGE_NOT_FOUND → Generate stub classes for missing packages
 * 2. SYMBOL_NOT_FOUND → Resolve cross-file references, add missing imports
 * 3. SYNTAX_ERROR → Fix common patterns (for-each, enum, method signatures)
 * 4. MISSING_DEPENDENCY → Add to pom.xml
 *
 * @version 12.7
 */

import { compileWithMaven, MavenCompileResult, MavenCompileError } from "./RealMavenCompiler";

interface GeneratedFile {
  path: string;
  content: string;
}

export interface AutoFixResult {
  originalResult: MavenCompileResult;
  finalResult: MavenCompileResult;
  iterations: number;
  fixesApplied: FixAction[];
  recoveredFromFail: boolean;
  status: string; // "PASS" | "PASS after N auto-fix iterations" | "FAIL after 3 attempts"
}

interface FixAction {
  iteration: number;
  type: "STUB_CLASS" | "ADD_IMPORT" | "FIX_SYNTAX" | "ADD_DEPENDENCY" | "FIX_PACKAGE";
  file: string;
  description: string;
}

const MAX_ITERATIONS = 7;

/**
 * Run compile → fix → recompile loop.
 */
export function autoFixAndCompile(
  files: GeneratedFile[],
  options?: { timeout?: number }
): AutoFixResult {
  const originalResult = compileWithMaven(files, options);

  if (originalResult.status === "PASS" || originalResult.status === "STATIC") {
    return {
      originalResult,
      finalResult: originalResult,
      iterations: 0,
      fixesApplied: [],
      recoveredFromFail: false,
      status: originalResult.status,
    };
  }

  let currentFiles = [...files];
  let currentResult = originalResult;
  const allFixes: FixAction[] = [];
  let iteration = 0;

  while (currentResult.status === "FAIL" && iteration < MAX_ITERATIONS) {
    iteration++;
    const fixes = applyFixes(currentFiles, currentResult.errors, iteration);

    if (fixes.actions.length === 0) break; // No more fixes possible

    currentFiles = fixes.files;
    allFixes.push(...fixes.actions);

    // Recompile
    currentResult = compileWithMaven(currentFiles, options);

    if (currentResult.status === "PASS") break;
  }

  const recovered = originalResult.status === "FAIL" && currentResult.status === "PASS";
  const status = currentResult.status === "PASS"
    ? iteration > 0 ? `PASS after ${iteration} auto-fix iteration(s)` : "PASS"
    : `FAIL after ${iteration} attempt(s)`;

  return {
    originalResult,
    finalResult: currentResult,
    iterations: iteration,
    fixesApplied: allFixes,
    recoveredFromFail: recovered,
    status,
  };
}

// ─── Fix application ─────────────────────────────────────────────────────────

function applyFixes(
  files: GeneratedFile[],
  errors: MavenCompileError[],
  iteration: number
): { files: GeneratedFile[]; actions: FixAction[] } {
  let result = [...files.map(f => ({ ...f }))];
  const actions: FixAction[] = [];

  // 0. javax → jakarta migration for Spring Boot 3.x compatibility
  const javaxPackages = [
    { from: 'javax.mail', to: 'jakarta.mail' },
    { from: 'javax.jms', to: 'jakarta.jms' },
    { from: 'javax.persistence', to: 'jakarta.persistence' },
    { from: 'javax.ejb', to: 'jakarta.ejb' },
    { from: 'javax.annotation', to: 'jakarta.annotation' },
    { from: 'javax.inject', to: 'jakarta.inject' },
  ];
  const needsJavaxMigration = errors.some(e =>
    e.message.includes('does not exist') &&
    javaxPackages.some(p => e.message.includes(p.from))
  );
  if (needsJavaxMigration) {
    for (let fi = 0; fi < result.length; fi++) {
      let content = result[fi].content;
      let changed = false;
      for (const pkg of javaxPackages) {
        if (content.includes(pkg.from)) {
          content = content.replace(new RegExp(pkg.from.replace('.', '\\.'), 'g'), pkg.to);
          changed = true;
        }
      }
      if (changed) {
        result[fi] = { ...result[fi], content };
        actions.push({
          iteration,
          type: 'FIX_SYNTAX',
          file: result[fi].path,
          description: `Migrated javax.* → jakarta.* imports in ${result[fi].path.split('/').pop()}`,
        });
      }
    }
  }

  // 1. Fix missing packages → generate stub classes
  const packageFixes = fixMissingPackages(result, errors, iteration);
  result = packageFixes.files;
  actions.push(...packageFixes.actions);

  // 2. Fix missing symbols → add imports or generate stubs
  const symbolFixes = fixMissingSymbols(result, errors, iteration);
  result = symbolFixes.files;
  actions.push(...symbolFixes.actions);

  // 3. Fix syntax errors
  const syntaxFixes = fixSyntaxErrors(result, errors, iteration);
  result = syntaxFixes.files;
  actions.push(...syntaxFixes.actions);

  // 4. Fix missing dependencies in pom.xml
  const depFixes = fixMissingDependencies(result, errors, iteration);
  result = depFixes.files;
  actions.push(...depFixes.actions);

  // 5. Fix missing variables (service fields, local variables, path params)
  const varFixes = fixMissingVariables(result, errors, iteration);
  result = varFixes.files;
  actions.push(...varFixes.actions);

  // 6. Fix missing methods on injected services
  const methodFixes = fixMissingMethods(result, errors, iteration);
  result = methodFixes.files;
  actions.push(...methodFixes.actions);

  // 7. Fix incompatible types by adding casts
  const castFixes = fixIncompatibleTypes(result, errors, iteration);
  result = castFixes.files;
  actions.push(...castFixes.actions);

  return { files: result, actions };
}

// ─── Fix: Missing packages ───────────────────────────────────────────────────

function fixMissingPackages(
  files: GeneratedFile[],
  errors: MavenCompileError[],
  iteration: number
): { files: GeneratedFile[]; actions: FixAction[] } {
  const actions: FixAction[] = [];
  const result = [...files];

  // Find "package X does not exist" errors
  const pkgErrors = errors.filter(e => e.message.includes("does not exist"));
  const missingPackages = new Set<string>();

  for (const err of pkgErrors) {
    const match = err.message.match(/package\s+([\w.]+)\s+does not exist/);
    if (match) missingPackages.add(match[1]);
  }

  // Filter out known framework packages (should be resolved via dependencies, not stubs)
  const FRAMEWORK_PACKAGES = [
    "org.springframework", "jakarta.", "javax.", "org.hibernate",
    "org.apache.", "com.fasterxml", "io.micrometer", "org.slf4j"
  ];

  // For each missing package, find what classes are imported from it
  for (const pkg of missingPackages) {
    // Skip framework packages — they should be resolved via pom.xml dependencies
    if (FRAMEWORK_PACKAGES.some(fp => pkg.startsWith(fp))) continue;
    const classesNeeded = new Set<string>();

    for (const file of files) {
      const importRegex = new RegExp(`import\\s+${pkg.replace(/\./g, "\\.")}\\.([\\w]+)\\s*;`, "g");
      let m;
      while ((m = importRegex.exec(file.content)) !== null) {
        classesNeeded.add(m[1]);
      }
    }

    // Generate stub classes
    for (const className of classesNeeded) {
      const pkgPath = pkg.replace(/\./g, "/");
      const filePath = `src/main/java/${pkgPath}/${className}.java`;

      // Don't generate if already exists
      if (result.some(f => f.path === filePath)) continue;

      const isDto = className.endsWith("DTO") || className.endsWith("Dto") || pkg.includes("dto");
      const isModel = pkg.includes("model") || pkg.includes("entity") || pkg.includes("domain");

      let stubContent: string;
      if (isDto) {
        stubContent = generateDtoStub(pkg, className, files);
      } else if (isModel) {
        stubContent = generateModelStub(pkg, className);
      } else {
        stubContent = generateGenericStub(pkg, className);
      }

      result.push({ path: filePath, content: stubContent });
      actions.push({
        iteration,
        type: "STUB_CLASS",
        file: filePath,
        description: `Generated stub for missing class ${pkg}.${className}`,
      });
    }
  }

  return { files: result, actions };
}

// ─── Fix: Missing symbols ────────────────────────────────────────────────────

function fixMissingSymbols(
  files: GeneratedFile[],
  errors: MavenCompileError[],
  iteration: number
): { files: GeneratedFile[]; actions: FixAction[] } {
  const actions: FixAction[] = [];
  const result = [...files.map(f => ({ ...f }))];

  // Find "cannot find symbol" errors for classes
  const symbolErrors = errors.filter(e => {
    if (!e.message.includes("cannot find symbol")) return false;
    if (e.message.includes("method")) return false;
    if (e.message.includes("variable")) {
      // Include utility classes referenced as variables (e.g., DateTimeUtils.method())
      const varMatch = e.message.match(/variable\s+(\w+)/);
      if (varMatch && /^[A-Z]/.test(varMatch[1]) && /(?:Utils|Util|Helper|Helpers|Constants)$/.test(varMatch[1])) {
        return true;
      }
      return false;
    }
    return true;
  });

  // Build class registry
  const classRegistry = new Map<string, string>();
  for (const file of result) {
    const classMatch = file.content.match(/(?:public\s+)?(?:class|interface|enum|record)\s+(\w+)/);
    if (classMatch) {
      const pkgMatch = file.content.match(/^package\s+([\w.]+)\s*;/m);
      if (pkgMatch) {
        classRegistry.set(classMatch[1], pkgMatch[1]);
      }
    }
  }

  // For each file with symbol errors, try to add missing imports
  for (const err of symbolErrors) {
    let fileIdx = result.findIndex(f => f.path.endsWith('/' + err.file));
    if (fileIdx === -1) fileIdx = result.findIndex(f => f.path.includes(err.file));
    if (fileIdx === -1) continue;

    const file = result[fileIdx];
    // Extract the missing symbol name from context
    // Format: "cannot find symbol - class Xxx" or "cannot find symbol" with "symbol: class Xxx"
    let symbolMatch = err.message.match(/(?:symbol:\s*class|cannot find symbol\s*-\s*class)\s+(\w+)/);
    if (!symbolMatch) {
      // Also match utility classes referenced as variables
      const varMatch = err.message.match(/(?:symbol:\s*variable|cannot find symbol\s*-\s*variable)\s+(\w+)/);
      if (varMatch && /^[A-Z]/.test(varMatch[1]) && /(?:Utils|Util|Helper|Helpers|Constants)$/.test(varMatch[1])) {
        symbolMatch = varMatch;
      }
    }
    if (!symbolMatch) continue;

    const missingClass = symbolMatch[1];
    const pkg = classRegistry.get(missingClass);

    if (pkg) {
      // Add import if not already present
      const importLine = `import ${pkg}.${missingClass};`;
      if (!file.content.includes(importLine)) {
        const packageLine = file.content.match(/^package\s+[\w.]+\s*;/m);
        if (packageLine) {
          result[fileIdx] = {
            ...file,
            content: file.content.replace(
              packageLine[0],
              `${packageLine[0]}\n\nimport ${pkg}.${missingClass};`
            ),
          };
          actions.push({
            iteration,
            type: "ADD_IMPORT",
            file: file.path,
            description: `Added import for ${pkg}.${missingClass}`,
          });
        }
      }
    }
  }

  // v12.7: Generate stubs for classes referenced but not found anywhere
  const basePackage = findBasePackage(result);
  for (const err of symbolErrors) {
    // Match both "class X" and "variable X" when X looks like a utility class name
    let symbolMatch = err.message.match(/(?:symbol:\s*class|cannot find symbol\s*-\s*class)\s+(\w+)/);
    if (!symbolMatch) {
      // Also detect utility classes referenced as variables (e.g., DateTimeUtils.method())
      const varMatch = err.message.match(/(?:symbol:\s*variable|cannot find symbol\s*-\s*variable)\s+(\w+)/);
      if (varMatch && /^[A-Z]/.test(varMatch[1]) && /(?:Utils|Util|Helper|Helpers|Constants)$/.test(varMatch[1])) {
        symbolMatch = varMatch;
      }
    }
    if (!symbolMatch) continue;
    const missingClass = symbolMatch[1];
    if (classRegistry.has(missingClass)) continue;
    // Skip Java standard types
    const JAVA_BUILTINS = new Set([
      // Primitive wrappers
      'String', 'Integer', 'Long', 'Double', 'Float', 'Boolean', 'Object', 'Void', 'Class', 'Byte', 'Short', 'Character', 'Number',
      // java.util
      'List', 'Map', 'Set', 'Collection', 'ArrayList', 'HashMap', 'HashSet', 'LinkedList',
      'Properties', 'Enumeration', 'Iterator', 'Optional', 'Collections', 'Arrays',
      'Date', 'Calendar', 'UUID', 'Random', 'Timer', 'TimerTask',
      // java.text
      'DateFormat', 'SimpleDateFormat', 'NumberFormat', 'DecimalFormat',
      // java.io
      'File', 'InputStream', 'OutputStream', 'Reader', 'Writer', 'Serializable',
      'IOException', 'FileInputStream', 'FileOutputStream', 'BufferedReader', 'PrintWriter',
      // java.math
      'BigDecimal', 'BigInteger',
      // java.time
      'LocalDate', 'LocalDateTime', 'LocalTime', 'Instant', 'Duration', 'ZonedDateTime',
      // javax.mail / jakarta.mail
      'Session', 'Message', 'MimeMessage', 'Transport', 'InternetAddress', 'MessagingException',
      'MimeBodyPart', 'MimeMultipart', 'Multipart',
      // javax.jms / jakarta.jms
      'JMSContext', 'JMSConsumer', 'JMSProducer', 'JMSException', 'TextMessage', 'ObjectMessage',
      'ConnectionFactory', 'Queue', 'Topic', 'Destination',
      // javax.persistence / jakarta.persistence
      'EntityManager', 'EntityManagerFactory', 'TypedQuery', 'CriteriaBuilder',
      'CriteriaQuery', 'Root', 'Predicate', 'PersistenceContext',
      // Common Java EE
      'EJBException', 'AsyncResult', 'Future', 'Callable', 'Runnable',
      'Logger', 'Level', 'LogManager',
      // Servlet
      'HttpServletRequest', 'HttpServletResponse', 'HttpSession', 'ServletContext',
    ]);
    if (JAVA_BUILTINS.has(missingClass)) continue;
    // Determine what kind of stub to generate
    let stubContent: string;
    let subDir: string;
    if (missingClass.endsWith('DAO') || missingClass.endsWith('Dao')) {
      subDir = 'dao';
      const entityName = missingClass.replace(/DAO$|Dao$/, '');
      // Infer the actual return type from usage context.
      // If code does: SomeType x = daoField.findById(...), the DAO should return SomeType.
      // This handles cases where the transformer renames BillingCategoryDAO to CategoryDAO
      // but the code still expects BillingCategory.
      let inferredType = entityName;
      const daoFieldPattern = new RegExp(`(?:private|protected)\\s+${missingClass}\\s+(\\w+)`);
      for (const f of result) {
        const fieldMatch = f.content.match(daoFieldPattern);
        if (fieldMatch) {
          const fieldName = fieldMatch[1];
          // Look for: TypeName varName = fieldName.findById(...) or fieldName.findByXxx(...)
          const usagePattern = new RegExp(`(\\w+)\\s+\\w+\\s*=\\s*${fieldName}\\.find\\w+\\(`, 'g');
          let usageMatch;
          const usedTypes = new Set<string>();
          while ((usageMatch = usagePattern.exec(f.content)) !== null) {
            const typeName = usageMatch[1];
            // Skip common non-entity types
            if (!['List', 'Set', 'Map', 'String', 'int', 'long', 'boolean', 'void', 'Object', 'var', 'final'].includes(typeName)) {
              usedTypes.add(typeName);
            }
          }
          if (usedTypes.size === 1) {
            inferredType = [...usedTypes][0];
          }
          break;
        }
      }
      const entityFile = result.find(f => f.path.endsWith(`/${inferredType}.java`));
      const entityInRegistry = classRegistry.has(inferredType);
      const returnType = inferredType;
      let importEntity = '';
      if (entityFile) {
        const pathParts = entityFile.path.replace('src/main/java/', '').replace('.java', '').replace(/\//g, '.');
        importEntity = `import ${pathParts};\n`;
      } else if (entityInRegistry) {
        const entityPkg = classRegistry.get(entityName);
        if (entityPkg) {
          importEntity = `import ${entityPkg}.${entityName};\n`;
        }
      }
      // If entity doesn't exist yet, don't add import - let ADD_IMPORT fix handle it later
      stubContent = `package ${basePackage}.${subDir};\n\nimport org.springframework.stereotype.Repository;\nimport java.util.List;\nimport java.util.Collections;\n${importEntity}\n/**\n * ${missingClass} \u2014 Auto-generated DAO stub.\n * @generated by Compleo v12.7 auto-fix\n */\n@Repository\npublic class ${missingClass} {\n\n    public ${returnType} findById(Long id) { return null; }\n    public ${returnType} findById(int id) { return null; }\n    public List<${returnType}> findByCustomerId(Long customerId) { return Collections.emptyList(); }\n    public List<${returnType}> findByUserId(Long userId) { return Collections.emptyList(); }\n    public List<${returnType}> findAll() { return Collections.emptyList(); }\n    public ${returnType} save(${returnType} entity) { return entity; }\n    public ${returnType} findByEmail(String email) { return null; }\n    public boolean delete(Long id) { return true; }\n    public ${returnType} update(${returnType} entity) { return entity; }\n}\n`;
    } else if (missingClass.endsWith('Manager')) {
      subDir = 'common';
      stubContent = `package ${basePackage}.${subDir};\n\nimport org.springframework.stereotype.Component;\n\n/**\n * ${missingClass} — Auto-generated Manager stub.\n * @generated by Compleo v12.7 auto-fix\n */\n@Component\npublic class ${missingClass} {\n    public static void shutdown() {}\n}\n`;
    } else if (missingClass.endsWith('Exception')) {
      subDir = 'exception';
      stubContent = `package ${basePackage}.${subDir};\n\n/**\n * ${missingClass} — Auto-generated exception stub.\n * @generated by Compleo v12.7 auto-fix\n */\npublic class ${missingClass} extends RuntimeException {\n    public ${missingClass}() { super(); }\n    public ${missingClass}(String message) { super(message); }\n    public ${missingClass}(String message, Throwable cause) { super(message, cause); }\n}\n`;
    } else if (missingClass.endsWith('Utils') || missingClass.endsWith('Util') || missingClass.endsWith('Helper')) {
      subDir = 'common';
      stubContent = `package ${basePackage}.${subDir};

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.DayOfWeek;

/**
 * ${missingClass} \u2014 Auto-generated utility stub.
 * @generated by Compleo v12.7 auto-fix
 */
public class ${missingClass} {

    private ${missingClass}() {}

    public static LocalDateTime getCurrentDateAndLog() { return LocalDateTime.now(); }

    public static int getMonthOfYear() { return LocalDate.now().getMonthValue(); }
    public static int getMonthOfYear(LocalDate date) { return date != null ? date.getMonthValue() : 0; }

    public static boolean isWorkingDay(LocalDate date) {
        if (date == null) return false;
        DayOfWeek dow = date.getDayOfWeek();
        return dow != DayOfWeek.SATURDAY && dow != DayOfWeek.SUNDAY;
    }

    public static boolean isWeekend(LocalDate date) { return !isWorkingDay(date); }

    public static String format(Object obj) { return obj != null ? obj.toString() : ""; }

    public static LocalDate parse(String dateStr) { return dateStr != null ? LocalDate.parse(dateStr) : null; }
}
`;
    } else {
      // Check if the missing class is used as a field type in an @Entity file
      // OR if there's a DAO that references it (e.g., CategoryDAO → Category is an entity)
      const hasDaoForClass = result.some(f => 
        f.path.endsWith(`/${missingClass}DAO.java`) || f.path.endsWith(`/${missingClass}Dao.java`)
      );
      const isEntityRef = hasDaoForClass || result.some(f => {
        if (!f.content.includes('@Entity') && !f.content.includes('@Repository')) return false;
        // Check if the class is used as a type in this entity or DAO
        return f.content.includes(`private ${missingClass} `) || 
               f.content.includes(`private List<${missingClass}>`) ||
               f.content.includes(`private Set<${missingClass}>`) ||
               f.content.includes(`<${missingClass}>`) ||
               f.content.includes(`import`) && f.content.includes(`.${missingClass};`);
      });
      if (isEntityRef) {
        subDir = 'entity';
        stubContent = `package ${basePackage}.${subDir};\n\nimport jakarta.persistence.*;\nimport lombok.Data;\nimport lombok.NoArgsConstructor;\nimport lombok.AllArgsConstructor;\n\n/**\n * ${missingClass} \u2014 Auto-generated entity stub.\n * @generated by Compleo v12.7 auto-fix\n */\n@Data\n@Entity\n@NoArgsConstructor\n@AllArgsConstructor\npublic class ${missingClass} {\n    @Id\n    @GeneratedValue(strategy = GenerationType.IDENTITY)\n    private Long id;\n    private String name;\n}\n`;
      } else {
        subDir = 'common';
        stubContent = `package ${basePackage}.${subDir};\n\n/**\n * ${missingClass} \u2014 Auto-generated stub.\n * @generated by Compleo v12.7 auto-fix\n */\npublic class ${missingClass} {\n    public ${missingClass}() {}\n}\n`;
      }
    }
    const stubPath = `src/main/java/${basePackage.replace(/\./g, '/')}/${subDir}/${missingClass}.java`;
    if (!result.some(f => f.path === stubPath)) {
      result.push({ path: stubPath, content: stubContent });
      classRegistry.set(missingClass, `${basePackage}.${subDir}`);
      actions.push({
        iteration,
        type: 'STUB_CLASS',
        file: stubPath,
        description: `Generated stub class for missing symbol: ${missingClass}`,
      });
    }
  }

  // v12.7: Generate stub annotations for ConstraintValidator references
  // If a file implements ConstraintValidator<AnnotationName, ...> and AnnotationName is missing
  for (const file of result) {
    const validatorMatch = file.content.match(/implements\s+ConstraintValidator<(\w+),/);
    if (!validatorMatch) continue;
    const annotationName = validatorMatch[1];
    // Check if annotation class exists in project
    if (classRegistry.has(annotationName)) continue;
    // Check if any error references this annotation
    const hasError = errors.some(e => e.message.includes(annotationName));
    if (!hasError) continue;
    // Generate stub annotation
    const pkgMatch = file.content.match(/^package\s+([\w.]+)\s*;/m);
    const pkg = pkgMatch ? pkgMatch[1] : 'com.example.ejbproject.validation';
    const annotationStub = `package ${pkg};

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.*;

@Documented
@Constraint(validatedBy = ${annotationName}Validator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
public @interface ${annotationName} {
    String message() default "Invalid value";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
`;
    const annotationPath = file.path.replace(/\w+\.java$/, `${annotationName}.java`);
    // Only add if not already present
    if (!result.some(f => f.path === annotationPath)) {
      result.push({ path: annotationPath, content: annotationStub });
      classRegistry.set(annotationName, pkg);
      actions.push({
        iteration,
        type: "STUB_CLASS",
        file: annotationPath,
        description: `Generated stub annotation @${annotationName} for ConstraintValidator`,
      });
    }
  }

  return { files: result, actions };
}

// ─── Fix: Syntax errors ──────────────────────────────────────────────────────

function fixSyntaxErrors(
  files: GeneratedFile[],
  errors: MavenCompileError[],
  iteration: number
): { files: GeneratedFile[]; actions: FixAction[] } {
  const actions: FixAction[] = [];
  const result = [...files.map(f => ({ ...f }))];

  // Pre-pass: Apply Joda-Time replacements globally on ALL files (not just those with syntax errors)
  // This fixes getMonthOfYear() etc. which appear as "cannot find symbol" not "syntax error"
  const jodaGlobalReplacements: [RegExp, string][] = [
    [/\.getMonthOfYear\(\)/g, '.getMonthValue()'],
    [/\.getDayOfMonth\(\)/g, '.getDayOfMonth()'],
    [/\.getYear\(\)/g, '.getYear()'],
    [/\.getHourOfDay\(\)/g, '.getHour()'],
    [/\.getMinuteOfHour\(\)/g, '.getMinute()'],
    [/\.getSecondOfMinute\(\)/g, '.getSecond()'],
    [/\.getMillisOfSecond\(\)/g, '.getNano()'],
    [/\.toDateTime\(\)/g, ''],
  ];
  for (let i = 0; i < result.length; i++) {
    let content = result[i].content;
    let changed = false;
    for (const [pattern, replacement] of jodaGlobalReplacements) {
      if (pattern.test(content)) {
        content = content.replace(pattern, replacement);
        changed = true;
      }
    }
    if (changed) {
      result[i] = { ...result[i], content };
      actions.push({
        iteration,
        type: 'FIX_SYNTAX',
        file: result[i].path,
        description: `Applied Joda-Time API replacements in ${result[i].path.split('/').pop()}`,
      });
    }
  }

  // Group syntax errors by file
  const syntaxByFile = new Map<string, MavenCompileError[]>();
  for (const err of errors) {
    if (err.message.includes("expected") || err.message.includes("illegal") || err.message.includes("not a statement") || err.message.includes("unexpected type")) {
      const existing = syntaxByFile.get(err.file) || [];
      existing.push(err);
      syntaxByFile.set(err.file, existing);
    }
  }

  for (const [fileName, fileErrors] of syntaxByFile) {
    let fileIdx = result.findIndex(f => f.path.endsWith('/' + fileName));
    if (fileIdx === -1) fileIdx = result.findIndex(f => f.path.includes(fileName));
    if (fileIdx === -1) continue;

    let content = result[fileIdx].content;
    let fixed = false;

    // Fix 0: Primitive types in generics (ResponseEntity<double> → ResponseEntity<Double>)
    // Java does not allow primitive types as generic type arguments
    const primitiveToWrapper: Record<string, string> = {
      'int': 'Integer', 'double': 'Double', 'float': 'Float',
      'long': 'Long', 'boolean': 'Boolean', 'char': 'Character',
      'byte': 'Byte', 'short': 'Short'
    };
    for (const [prim, wrapper] of Object.entries(primitiveToWrapper)) {
      const primGenericRegex = new RegExp(`<${prim}>`, 'g');
      if (primGenericRegex.test(content)) {
        content = content.replace(primGenericRegex, `<${wrapper}>`);
        fixed = true;
      }
    }

    // Fix 1: Enhanced for-each with type in parentheses → fix syntax
    // Pattern: for (Type item : collection) where Type has generics issue
    content = content.replace(
      /for\s*\(\s*(\w+(?:<[^>]+>)?)\s+(\w+)\s*:\s*([^)]+)\)\s*\{/g,
      (match, type, varName, collection) => {
        // Check if the type has issues
        if (type.includes("<") && !type.includes(">")) {
          return `for (Object ${varName} : ${collection.trim()}) {`;
        }
        return match;
      }
    );

    // Fix 2: Raw legacy code patterns that break Java syntax
    // Pattern: sctx.setRollbackOnly() without semicolon
    content = content.replace(/(\w+\.setRollbackOnly\(\))\s*$/gm, "$1;");

    // Fix 3: Unclosed string literals on a single line
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Count quotes (excluding escaped ones)
      const quotes = (line.match(/(?<!\\)"/g) || []).length;
      if (quotes % 2 !== 0 && !line.trim().startsWith("//") && !line.trim().startsWith("*")) {
        // Add closing quote before semicolon or end of line
        if (line.includes(";")) {
          lines[i] = line.replace(/;(\s*)$/, `";$1`);
        } else {
          lines[i] = line + '"';
        }
        fixed = true;
      }
    }
    content = lines.join("\n");

    // Fix 4: Duplicate method declarations (common in copy-paste body)
    // Remove exact duplicate method signatures
    const methodSigRegex = /(\s*(?:public|private|protected)\s+\w+\s+\w+\s*\([^)]*\)\s*\{)/g;
    const seenMethods = new Set<string>();
    content = content.replace(methodSigRegex, (match) => {
      const normalized = match.trim().replace(/\s+/g, " ");
      if (seenMethods.has(normalized)) {
        fixed = true;
        return ""; // Remove duplicate
      }
      seenMethods.add(normalized);
      return match;
    });

    // Fix 5: Missing semicolons after common statements
    content = content.replace(/^(\s*(?:return|throw)\s+[^;{]+)$/gm, (match) => {
      if (!match.trim().endsWith(";") && !match.trim().endsWith("{") && !match.trim().endsWith("}")) {
        fixed = true;
        return match + ";";
      }
      return match;
    });

    // Fix 6: Repeated modifiers (public public, private private, etc.)
    content = content.replace(/\b(public|private|protected|static|final|abstract|synchronized)\s+\1\b/g, (match, mod) => {
      fixed = true;
      return mod;
    });

    // Fix 7: Remove invalid imports (import ...static void, import ...void)
    content = content.replace(/^\s*import\s+[\w.]+\.(?:static\s+)?void\s*;\s*$/gm, () => {
      fixed = true;
      return '';
    });

    // Fix 8: Joda-Time API replacements (common in legacy code)
    const jodaReplacements: [RegExp, string][] = [
      [/\.getMonthOfYear\(\)/g, '.getMonthValue()'],
      [/\.getDayOfMonth\(\)/g, '.getDayOfMonth()'],
      [/\.getYear\(\)/g, '.getYear()'],
      [/\.getHourOfDay\(\)/g, '.getHour()'],
      [/\.getMinuteOfHour\(\)/g, '.getMinute()'],
      [/\.getSecondOfMinute\(\)/g, '.getSecond()'],
      [/\.getMillisOfSecond\(\)/g, '.getNano()'],
      [/\.toDateTime\(\)/g, ''],
      [/\.toLocalDate\(\)/g, '.toLocalDate()'],
    ];
    for (const [pattern, replacement] of jodaReplacements) {
      if (pattern.test(content)) {
        content = content.replace(pattern, replacement);
        fixed = true;
      }
    }

    if (content !== result[fileIdx].content) {
      result[fileIdx] = { ...result[fileIdx], content };
      actions.push({
        iteration,
        type: "FIX_SYNTAX",
        file: result[fileIdx].path,
        description: `Fixed syntax errors in ${fileName} (${fileErrors.length} errors)`,
      });
    }
  }

  return { files: result, actions };
}

// ─── Fix: Missing dependencies ───────────────────────────────────────────────

function fixMissingDependencies(
  files: GeneratedFile[],
  errors: MavenCompileError[],
  iteration: number
): { files: GeneratedFile[]; actions: FixAction[] } {
  const actions: FixAction[] = [];
  const result = [...files.map(f => ({ ...f }))];

  // Find pom.xml
  const pomIdx = result.findIndex(f => f.path.endsWith("pom.xml"));
  if (pomIdx === -1) return { files: result, actions };

  let pom = result[pomIdx].content;
  let modified = false;

  // Check for missing security package
  const needsSecurity = errors.some(e =>
    e.message.includes("org.springframework.security") && e.message.includes("does not exist")
  );
  if (needsSecurity && !pom.includes("spring-boot-starter-security")) {
    pom = addDependencyToPom(pom, "org.springframework.boot", "spring-boot-starter-security", undefined);
    modified = true;
    actions.push({
      iteration,
      type: "ADD_DEPENDENCY",
      file: "pom.xml",
      description: "Added spring-boot-starter-security dependency",
    });
  }

  // Check for missing validation package
  const needsValidation = errors.some(e =>
    (e.message.includes("javax.validation") || e.message.includes("jakarta.validation")) &&
    e.message.includes("does not exist")
  );
  if (needsValidation && !pom.includes("spring-boot-starter-validation")) {
    pom = addDependencyToPom(pom, "org.springframework.boot", "spring-boot-starter-validation", undefined);
    modified = true;
    actions.push({
      iteration,
      type: "ADD_DEPENDENCY",
      file: "pom.xml",
      description: "Added spring-boot-starter-validation dependency",
    });
  }

  // Check for missing mail package — detect from errors OR source imports
  const needsMail = errors.some(e =>
    e.message.includes("javax.mail") && e.message.includes("does not exist")
  ) || result.some(f => f.content.includes("import javax.mail") || f.content.includes("import jakarta.mail"));
  if (needsMail && !pom.includes("spring-boot-starter-mail") && !pom.includes("javax.mail") && !pom.includes("jakarta.mail")) {
    pom = addDependencyToPom(pom, "org.springframework.boot", "spring-boot-starter-mail", undefined);
    modified = true;
    actions.push({
      iteration,
      type: "ADD_DEPENDENCY",
      file: "pom.xml",
      description: "Added spring-boot-starter-mail dependency",
    });
  }

  // Check for missing JMS package
  const needsJms = errors.some(e =>
    (e.message.includes("javax.jms") || e.message.includes("jakarta.jms")) && e.message.includes("does not exist")
  ) || result.some(f => f.content.includes("import javax.jms") || f.content.includes("import jakarta.jms"));
  if (needsJms && !pom.includes("spring-boot-starter-activemq") && !pom.includes("javax.jms") && !pom.includes("jakarta.jms")) {
    pom = addDependencyToPom(pom, "org.springframework.boot", "spring-boot-starter-activemq", undefined);
    modified = true;
    actions.push({
      iteration,
      type: "ADD_DEPENDENCY",
      file: "pom.xml",
      description: "Added spring-boot-starter-activemq (JMS) dependency",
    });
  }

  // Check for missing JPA/persistence package
  const needsJpa = errors.some(e =>
    (e.message.includes("javax.persistence") || e.message.includes("jakarta.persistence")) && e.message.includes("does not exist")
  ) || result.some(f => f.content.includes("import javax.persistence") || f.content.includes("import jakarta.persistence"));
  if (needsJpa && !pom.includes("spring-boot-starter-data-jpa") && !pom.includes("javax.persistence") && !pom.includes("jakarta.persistence-api")) {
    pom = addDependencyToPom(pom, "org.springframework.boot", "spring-boot-starter-data-jpa", undefined);
    modified = true;
    actions.push({
      iteration,
      type: "ADD_DEPENDENCY",
      file: "pom.xml",
      description: "Added spring-boot-starter-data-jpa dependency",
    });
  }

  // Check for missing EJB/CDI package
  const needsEjb = errors.some(e =>
    (e.message.includes("javax.ejb") || e.message.includes("jakarta.ejb")) && e.message.includes("does not exist")
  ) || result.some(f => f.content.includes("import javax.ejb") || f.content.includes("import jakarta.ejb"));
  if (needsEjb && !pom.includes("jakarta.ejb-api") && !pom.includes("javax.ejb")) {
    pom = addDependencyToPom(pom, "jakarta.ejb", "jakarta.ejb-api", "4.0.1");
    modified = true;
    actions.push({
      iteration,
      type: "ADD_DEPENDENCY",
      file: "pom.xml",
      description: "Added jakarta.ejb-api dependency",
    });
  }

  // Check for missing CDI/inject package
  const needsCdi = errors.some(e =>
    (e.message.includes("javax.enterprise") || e.message.includes("jakarta.enterprise")) && e.message.includes("does not exist")
  ) || result.some(f => f.content.includes("import javax.enterprise") || f.content.includes("import jakarta.enterprise"));
  if (needsCdi && !pom.includes("jakarta.enterprise.cdi-api") && !pom.includes("javax.enterprise")) {
    pom = addDependencyToPom(pom, "jakarta.enterprise", "jakarta.enterprise.cdi-api", "4.0.1");
    modified = true;
    actions.push({
      iteration,
      type: "ADD_DEPENDENCY",
      file: "pom.xml",
      description: "Added jakarta.enterprise.cdi-api dependency",
    });
  }

  if (modified) {
    result[pomIdx] = { ...result[pomIdx], content: pom };
  }

  return { files: result, actions };
}

// ─── Stub generators ─────────────────────────────────────────────────────────

function generateDtoStub(pkg: string, className: string, allFiles: GeneratedFile[]): string {
  // Try to infer fields from usage in other files
  const fields = inferFieldsFromUsage(className, allFiles);

  let content = `package ${pkg};\n\nimport java.io.Serializable;\n\n`;
  content += `/**\n * Auto-generated DTO stub for ${className}.\n * @generated by Compleo v12.7 auto-fix\n */\n`;
  content += `public class ${className} implements Serializable {\n\n`;
  content += `    private static final long serialVersionUID = 1L;\n\n`;

  for (const field of fields) {
    content += `    private ${field.type} ${field.name};\n`;
  }
  content += `\n    public ${className}() {}\n\n`;

  // Getters and setters
  for (const field of fields) {
    const cap = field.name.charAt(0).toUpperCase() + field.name.slice(1);
    content += `    public ${field.type} get${cap}() { return this.${field.name}; }\n`;
    content += `    public void set${cap}(${field.type} ${field.name}) { this.${field.name} = ${field.name}; }\n\n`;
  }

  content += `}\n`;
  return content;
}

function generateModelStub(pkg: string, className: string): string {
  return `package ${pkg};

import java.io.Serializable;

/**
 * Auto-generated model stub for ${className}.
 * @generated by Compleo v12.7 auto-fix
 */
public class ${className} implements Serializable {

    private static final long serialVersionUID = 1L;
    private Long id;

    public ${className}() {}

    public Long getId() { return this.id; }
    public void setId(Long id) { this.id = id; }
}
`;
}

function generateGenericStub(pkg: string, className: string): string {
  // Determine if it's likely an interface, enum, or class
  const isInterface = className.startsWith("I") && className.length > 1 && className[1] === className[1].toUpperCase();

  if (isInterface) {
    return `package ${pkg};

/**
 * Auto-generated interface stub for ${className}.
 * @generated by Compleo v12.7 auto-fix
 */
public interface ${className} {
}
`;
  }

  // If it's a Service class, add CRUD methods
  if (className.endsWith('Service')) {
    return `package ${pkg};

import java.util.List;
import java.util.Collections;
import org.springframework.stereotype.Service;

/**
 * Auto-generated service stub for ${className}.
 * @generated by Compleo v12.7 auto-fix
 */
@Service
public class ${className} {

    public ${className}() {}

    public List<Object> findAll() { return Collections.emptyList(); }
    public List<Object> findAllActive() { return Collections.emptyList(); }
    public List<Object> findAllInactive() { return Collections.emptyList(); }
    public List<Object> findAllActiveCarts() { return Collections.emptyList(); }
    public List<Object> findAllByUser(Long userId) { return Collections.emptyList(); }
    public Object findById(Long id) { return null; }
    public Object create(Object request) { return null; }
    public Object createDto(Object request) { return null; }
    public void delete(Long id) {}
    public Object update(Long id, Object request) { return null; }
    public void shutdown() {}
}
`;
  }

  // If it's a DAO class, add basic methods with typed returns
  if (className.endsWith('DAO') || className.endsWith('Dao')) {
    const entityName = className.replace(/DAO$|Dao$/, '');
    return `package ${pkg};

import java.util.List;
import java.util.Collections;
import org.springframework.stereotype.Repository;

/**
 * Auto-generated DAO stub for ${className}.
 * @generated by Compleo v12.7 auto-fix
 */
@Repository
public class ${className} {

    public ${className}() {}

    public List<Object> findAll() { return Collections.emptyList(); }
    public List<Object> findByCustomerId(Long customerId) { return Collections.emptyList(); }
    public List<Object> findByUserId(Long userId) { return Collections.emptyList(); }
    public Object findById(Long id) { return null; }
    public Object findById(int id) { return null; }
    public Object save(Object entity) { return entity; }
    public void delete(Long id) {}
    public Object getConnection() { return null; }
}
`;
  }

  // If it's a Utils class
  if (className.endsWith('Utils') || className.endsWith('Util') || className.endsWith('Helper')) {
    return `package ${pkg};

import java.time.LocalDate;
import java.time.DayOfWeek;

/**
 * Auto-generated utility stub for ${className}.
 * @generated by Compleo v12.7 auto-fix
 */
public class ${className} {

    private ${className}() {}

    public static boolean isWorkingDay(LocalDate date) {
        if (date == null) return false;
        DayOfWeek dow = date.getDayOfWeek();
        return dow != DayOfWeek.SATURDAY && dow != DayOfWeek.SUNDAY;
    }

    public static boolean isWeekend(LocalDate date) {
        return !isWorkingDay(date);
    }

    public static String format(Object date) {
        return date != null ? date.toString() : "";
    }

    public static LocalDate parse(String dateStr) {
        return dateStr != null ? LocalDate.parse(dateStr) : null;
    }
}
`;
  }

  // If it's a Manager class
  if (className.endsWith('Manager')) {
    return `package ${pkg};

/**
 * Auto-generated manager stub for ${className}.
 * @generated by Compleo v12.7 auto-fix
 */
public class ${className} {

    public ${className}() {}

    public static Object getConnection() { return null; }
    public static void close() {}
}
`;
  }

  return `package ${pkg};

/**
 * Auto-generated class stub for ${className}.
 * @generated by Compleo v12.7 auto-fix
 */
public class ${className} {

    public ${className}() {}
}
`;
}

function inferFieldsFromUsage(className: string, files: GeneratedFile[]): Array<{ name: string; type: string }> {
  const fields: Array<{ name: string; type: string }> = [];
  const seenNames = new Set<string>();

  for (const file of files) {
    // Look for getter/setter calls: obj.getXxx(), obj.setXxx(val)
    const getterRegex = new RegExp(`\\w+\\.get(\\w+)\\(\\)`, "g");
    const setterRegex = new RegExp(`\\w+\\.set(\\w+)\\(`, "g");

    // Only look in files that import this class
    if (!file.content.includes(className)) continue;

    let m;
    while ((m = getterRegex.exec(file.content)) !== null) {
      const fieldName = m[1].charAt(0).toLowerCase() + m[1].slice(1);
      if (!seenNames.has(fieldName) && fieldName.length > 1) {
        seenNames.add(fieldName);
        fields.push({ name: fieldName, type: inferType(fieldName) });
      }
    }
    while ((m = setterRegex.exec(file.content)) !== null) {
      const fieldName = m[1].charAt(0).toLowerCase() + m[1].slice(1);
      if (!seenNames.has(fieldName) && fieldName.length > 1) {
        seenNames.add(fieldName);
        fields.push({ name: fieldName, type: inferType(fieldName) });
      }
    }
  }

  // If no fields found, add generic ones
  if (fields.length === 0) {
    fields.push({ name: "id", type: "Long" });
    fields.push({ name: "name", type: "String" });
  }

  return fields.slice(0, 15); // Limit to 15 fields
}

function inferType(fieldName: string): string {
  const lower = fieldName.toLowerCase();
  if (lower === "id" || lower.endsWith("id")) return "Long";
  if (lower.includes("date") || lower.includes("time") || lower.includes("created") || lower.includes("updated")) return "java.util.Date";
  if (lower.includes("amount") || lower.includes("price") || lower.includes("balance") || lower.includes("total")) return "java.math.BigDecimal";
  if (lower.includes("count") || lower.includes("quantity") || lower.includes("number") || lower.includes("age")) return "Integer";
  if (lower.includes("active") || lower.includes("enabled") || lower.includes("flag") || lower.includes("is")) return "Boolean";
  if (lower.includes("list") || lower.includes("items")) return "java.util.List<Object>";
  return "String";
}

function findBasePackage(files: GeneratedFile[]): string {
  const packages = new Map<string, number>();
  for (const file of files) {
    if (!file.path.endsWith('.java')) continue;
    const pkgMatch = file.content.match(/^package\s+([\w.]+)\s*;/m);
    if (pkgMatch) {
      // Get root package (first 3 segments)
      const parts = pkgMatch[1].split('.');
      const root = parts.slice(0, Math.min(3, parts.length)).join('.');
      packages.set(root, (packages.get(root) || 0) + 1);
    }
  }
  // Return most common root package
  let best = 'com.example.ejbproject';
  let bestCount = 0;
  for (const [pkg, count] of packages) {
    if (count > bestCount) {
      best = pkg;
      bestCount = count;
    }
  }
  return best;
}

// ─── Fix: Missing variables ──────────────────────────────────────────────────

function fixMissingVariables(
  files: GeneratedFile[],
  errors: MavenCompileError[],
  iteration: number
): { files: GeneratedFile[]; actions: FixAction[] } {
  const actions: FixAction[] = [];
  const result = [...files.map(f => ({ ...f }))];

  // Find "cannot find symbol - variable xxx" errors
  const varErrors = errors.filter(e =>
    e.message.includes('cannot find symbol') &&
    e.message.includes('variable')
  );

  // Group by file
  const errorsByFile = new Map<string, Set<string>>();
  for (const err of varErrors) {
    const varMatch = err.message.match(/variable\s+(\w+)/);
    if (!varMatch) continue;
    const varName = varMatch[1];
    const existing = errorsByFile.get(err.file) || new Set();
    existing.add(varName);
    errorsByFile.set(err.file, existing);
  }

  for (const [fileName, missingVars] of errorsByFile) {
    let fileIdx = result.findIndex(f => f.path.endsWith('/' + fileName));
    if (fileIdx === -1) fileIdx = result.findIndex(f => f.path.includes(fileName));
    if (fileIdx === -1) continue;

    let content = result[fileIdx].content;
    let modified = false;

    for (const varName of missingVars) {
      // Case 0: Utility class used as variable (e.g., DateTimeUtils.method()) — skip, let fixMissingSymbols handle it
      if (varName.endsWith('Utils') || varName.endsWith('Util') || varName.endsWith('Helper') || varName.endsWith('Helpers')) {
        // These are static utility classes, not variables. They need an import, not a field.
        // fixMissingSymbols will generate the stub class and fixImportErrors will add the import.
        continue;
      }
      // Case 1: Missing service/DAO/Manager field
      if (varName.endsWith('Service') || varName.endsWith('service') || varName.endsWith('DAO') || varName.endsWith('Dao') || varName.endsWith('dao') || varName.endsWith('Manager') || varName.endsWith('manager') || varName.endsWith('Repository') || varName.endsWith('repository')) {
        const typeName = varName.charAt(0).toUpperCase() + varName.slice(1);
        const fieldDecl = `private final ${typeName} ${varName};`;
        if (!content.includes(fieldDecl) && !content.includes(`${typeName} ${varName}`)) {
          // Add field after class declaration
          const classMatch = content.match(/(public\s+class\s+\w+[^{]*\{)/);
          if (classMatch) {
            content = content.replace(
              classMatch[1],
              `${classMatch[1]}\n    private final ${typeName} ${varName};\n`
            );
            modified = true;
            actions.push({
              iteration,
              type: 'FIX_SYNTAX',
              file: result[fileIdx].path,
              description: `Added missing service field: ${typeName} ${varName}`,
            });
          }
        }
      }
      // Case 1b: Logger injection (log, logger, LOG, LOGGER)
      else if (/^(log|logger|LOG|LOGGER)$/.test(varName)) {
        // Add SLF4J Logger field
        const classMatch = content.match(/public\s+class\s+(\w+)/);
        if (classMatch) {
          const className = classMatch[1];
          const loggerDecl = `private static final org.slf4j.Logger ${varName} = org.slf4j.LoggerFactory.getLogger(${className}.class);`;
          if (!content.includes(loggerDecl) && !content.includes(`Logger ${varName}`)) {
            const classOpenMatch = content.match(/(public\s+class\s+\w+[^{]*\{)/);
            if (classOpenMatch) {
              content = content.replace(
                classOpenMatch[1],
                `${classOpenMatch[1]}\n    ${loggerDecl}\n`
              );
              modified = true;
              actions.push({
                iteration,
                type: 'FIX_SYNTAX',
                file: result[fileIdx].path,
                description: `Added SLF4J Logger field '${varName}' to ${className}`,
              });
            }
          }
        }
      }
      // Case 2: Missing 'id' variable in controller methods (likely a @PathVariable)
      else if (!varName.endsWith('Dto') && !varName.endsWith('DTO') && !varName.endsWith('dto')) {
        // For controllers: add as @RequestParam or @PathVariable
        if (content.includes('@RestController') || content.includes('@Controller')) {
          const methodRegex = /public\s+\S+\s+(\w+)\(([^)]*)\)/g;
          let methodMatch;
          let newContent = content;
          while ((methodMatch = methodRegex.exec(content)) !== null) {
            const params = methodMatch[2];
            const methodStart = methodMatch.index;
            const methodEnd = findMethodEnd(content, methodStart);
            if (methodEnd === -1) continue;
            const methodBody = content.substring(methodStart, methodEnd);
            const varWordRegex = new RegExp(`\\b${varName}\\b`);
            if (varWordRegex.test(methodBody) && !varWordRegex.test(params)) {
              let paramType = 'String';
              if (varName === 'id' || varName.endsWith('Id')) paramType = 'Long';
              const annotation = varName === 'id' || varName.endsWith('Id') ? '@PathVariable' : '@RequestParam';
              const newParams = params.trim()
                ? `${params}, ${annotation} ${paramType} ${varName}`
                : `${annotation} ${paramType} ${varName}`;
              newContent = newContent.replace(
                methodMatch[0],
                methodMatch[0].replace(`(${params})`, `(${newParams})`)
              );
            }
          }
          if (newContent !== content) {
            content = newContent;
            modified = true;
            actions.push({
              iteration,
              type: 'FIX_SYNTAX',
              file: result[fileIdx].path,
              description: `Added missing parameter ${varName} to controller methods`,
            });
          }
        }
        // For services: add missing variable as method parameter
        else if (content.includes('@Service')) {
          const methodRegex = /public\s+(\S+)\s+(\w+)\(([^)]*)\)/g;
          let methodMatch;
          let newContent = content;
          while ((methodMatch = methodRegex.exec(content)) !== null) {
            const params = methodMatch[3];
            const methodStart = methodMatch.index;
            const methodEnd = findMethodEnd(content, methodStart);
            if (methodEnd === -1) continue;
            const methodBody = content.substring(methodStart, methodEnd);
            const svcVarRegex = new RegExp(`\\b${varName}\\b`);
            if (svcVarRegex.test(methodBody) && !svcVarRegex.test(params)) {
              let paramType = 'Object';
              if (varName === 'id' || varName.endsWith('Id')) paramType = 'Long';
              else if (varName === 'email' || varName === 'name' || varName === 'username') paramType = 'String';
              const newParams = params.trim()
                ? `${params}, ${paramType} ${varName}`
                : `${paramType} ${varName}`;
              newContent = newContent.replace(
                methodMatch[0],
                methodMatch[0].replace(`(${params})`, `(${newParams})`)
              );
            }
          }
          if (newContent !== content) {
            content = newContent;
            modified = true;
            actions.push({
              iteration,
              type: 'FIX_SYNTAX',
              file: result[fileIdx].path,
              description: `Added missing parameter ${varName} to service methods`,
            });
          }
        }
      }
      // Case 3: Missing DTO variable (xxxDto pattern) — likely should be 'request'
      else if (varName.endsWith('Dto') || varName.endsWith('DTO') || varName.endsWith('dto')) {
        // Replace references to the undeclared DTO variable with 'request' if it exists as param
        const methodRegex = new RegExp(
          `(public\\s+\\S+\\s+\\w+\\([^)]*(?:DTO|Dto)\\s+(\\w+)[^)]*\\)[^}]*?)\\b${varName}\\b`,
          'g'
        );
        // Simpler approach: if a method has a DTO parameter, replace varName with that param name
        const methods = content.split(/(?=\s+(?:public|private|protected)\s+)/g);
        let newContent = '';
        for (const method of methods) {
          // Find DTO parameter name in method signature
          const paramMatch = method.match(/public\s+\S+\s+\w+\([^)]*(?:DTO|Dto|Request|Response)\s+(\w+)/);
          if (paramMatch && method.includes(varName)) {
            const paramName = paramMatch[1];
            // Replace varName with paramName in method body
            newContent += method.replace(new RegExp(`\\b${varName}\\b`, 'g'), paramName);
            modified = true;
          } else {
            newContent += method;
          }
        }
        if (modified) {
          content = newContent;
          actions.push({
            iteration,
            type: 'FIX_SYNTAX',
            file: result[fileIdx].path,
            description: `Replaced undeclared variable '${varName}' with method parameter`,
          });
        }
      }
    }

    if (modified) {
      result[fileIdx] = { ...result[fileIdx], content };
    }
  }

  return { files: result, actions };
}

// ─── Fix: Missing methods on services ─────────────────────────────────────────

function fixMissingMethods(
  files: GeneratedFile[],
  errors: MavenCompileError[],
  iteration: number
): { files: GeneratedFile[]; actions: FixAction[] } {
  const actions: FixAction[] = [];
  const result = [...files.map(f => ({ ...f }))];

  // Find "cannot find symbol - method xxx(...)" errors
  const methodErrors = errors.filter(e =>
    e.message.includes('cannot find symbol') &&
    e.message.includes('method')
  );

  if (methodErrors.length === 0) return { files: result, actions };

  // For each error, find what method is being called and on what type
  // Group by source file
  const errorsByFile = new Map<string, MavenCompileError[]>();
  for (const err of methodErrors) {
    const existing = errorsByFile.get(err.file) || [];
    existing.push(err);
    errorsByFile.set(err.file, existing);
  }

  // Build a map of class name -> file index for quick lookup
  const classToFileIdx = new Map<string, number>();
  for (let i = 0; i < result.length; i++) {
    const classMatch = result[i].content.match(/public\s+(?:class|interface)\s+(\w+)/);
    if (classMatch) classToFileIdx.set(classMatch[1], i);
  }

  // For each file with method errors, find what service fields exist and what methods are called
  for (const [fileName, fileErrors] of errorsByFile) {
    let fileIdx = result.findIndex(f => f.path.endsWith('/' + fileName));
    if (fileIdx === -1) fileIdx = result.findIndex(f => f.path.includes(fileName));
    if (fileIdx === -1) continue;
    const content = result[fileIdx].content;

    // Find all service fields: private final XxxService xxxService;
    const fieldRegex = /private\s+final\s+(\w+)\s+(\w+)\s*;/g;
    const fields = new Map<string, string>(); // fieldName -> typeName
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(content)) !== null) {
      fields.set(fieldMatch[2], fieldMatch[1]);
    }

    // For each method error, find the method call and the target service
    for (const err of fileErrors) {
      const methodMatch = err.message.match(/method\s+(\w+)\(([^)]*)\)/);
      if (!methodMatch) continue;
      const methodName = methodMatch[1];
      const paramTypes = methodMatch[2];

      // Find which field this method is called on by scanning the error line context
      const lines = content.split('\n');
      const errLine = err.line ? lines[err.line - 1] : '';

      // Try to find pattern: fieldName.methodName( or this.fieldName.methodName(
      let targetField = '';
      let targetType = '';
      const callMatch = errLine.match(/(\w+)\." + methodName + "\s*\(/);
      // More robust: check all fields
      for (const [fName, fType] of fields) {
        if (errLine.includes(`${fName}.${methodName}`) || errLine.includes(`this.${fName}.${methodName}`)) {
          targetField = fName;
          targetType = fType;
          break;
        }
      }

      // If no field found, check if it's a self-call (this.methodName)
      if (!targetType) {
        if (errLine.includes(`this.${methodName}(`) || errLine.match(new RegExp(`\\b${methodName}\\s*\\(`))) {
          // Self-call - add method to current class
          const classMatch = content.match(/public\s+class\s+(\w+)/);
          if (classMatch) {
            targetType = classMatch[1];
          }
        }
      }

      if (!targetType) continue;

      // Find the target class file
      const targetFileIdx = classToFileIdx.get(targetType);
      if (targetFileIdx === undefined) continue;

      // Check if method already exists in target
      const targetContent = result[targetFileIdx].content;
      // For self-calls, use strict declaration regex to avoid matching the call itself
      // For calls on other classes, use simple includes (more conservative)
      const isSelfCall = (targetFileIdx === fileIdx);
      if (isSelfCall) {
        const methodDeclRegex = new RegExp(`(?:public|private|protected)\\s+\\S+\\s+${methodName}\\s*\\(`);
        if (methodDeclRegex.test(targetContent)) continue;
      } else {
        if (targetContent.includes(`${methodName}(`)) continue;
      }

      // Generate stub method — use Object for parameters to allow polymorphism
      const params = paramTypes.split(',').filter(p => p.trim()).map((p, i) => {
        return `Object arg${i}`;
      }).join(', ');

      // Infer return type from method name and context
      let returnType = 'Object';
      let returnValue = 'null';
      if (methodName.startsWith('findAll') || methodName.startsWith('getAll') || methodName.startsWith('list')) {
        returnType = 'java.util.List<Object>';
        returnValue = 'java.util.Collections.emptyList()';
      } else if (methodName === 'delete' || methodName === 'remove') {
        returnType = 'void';
        returnValue = '';
      } else if (methodName === 'count' || methodName.startsWith('count')) {
        returnType = 'long';
        returnValue = '0L';
      } else if (methodName.startsWith('is') || methodName.startsWith('has') || methodName.startsWith('can')) {
        returnType = 'boolean';
        returnValue = 'false';
      } else if (methodName.startsWith('get') && (methodName.toLowerCase().includes('date') || methodName.toLowerCase().includes('time'))) {
        returnType = 'String';
        returnValue = 'java.time.LocalDate.now().toString()';
      } else if (methodName.startsWith('get') || methodName.startsWith('find') || methodName.startsWith('load')) {
        returnType = 'Object';
        returnValue = 'null';
      }

      const returnStatement = returnValue ? `        return ${returnValue};\n` : '';
      const stubMethod = `\n    public ${returnType} ${methodName}(${params}) {\n        // TODO: Implement\n${returnStatement}    }\n`;

      // Add method before the last closing brace
      const lastBrace = targetContent.lastIndexOf('}');
      if (lastBrace > 0) {
        result[targetFileIdx] = {
          ...result[targetFileIdx],
          content: targetContent.substring(0, lastBrace) + stubMethod + targetContent.substring(lastBrace),
        };
        actions.push({
          iteration,
          type: 'STUB_CLASS',
          file: result[targetFileIdx].path,
          description: `Added stub method ${methodName}() to ${targetType}`,
        });
      }
    }
  }

  return { files: result, actions };
}

// ─── Fix: Incompatible types (add casts) ────────────────────────────────────────────

function fixIncompatibleTypes(
  files: GeneratedFile[],
  errors: MavenCompileError[],
  iteration: number
): { files: GeneratedFile[]; actions: FixAction[] } {
  const actions: FixAction[] = [];
  const result = [...files.map(f => ({ ...f }))];

  // Group incompatible type errors by file
  const typeErrorsByFile = new Map<string, MavenCompileError[]>();
  for (const err of errors) {
    if (err.message.includes('incompatible types')) {
      const existing = typeErrorsByFile.get(err.file) || [];
      existing.push(err);
      typeErrorsByFile.set(err.file, existing);
    }
  }

  for (const [fileName, fileErrors] of typeErrorsByFile) {
    let fileIdx = result.findIndex(f => f.path.endsWith('/' + fileName));
    if (fileIdx === -1) fileIdx = result.findIndex(f => f.path.includes(fileName));
    if (fileIdx === -1) continue;

    let content = result[fileIdx].content;
    let modified = false;
    const lines = content.split('\n');

    // Process errors in reverse line order to avoid offset issues
    const sortedErrors = [...fileErrors].sort((a, b) => (b.line || 0) - (a.line || 0));

    // Pre-pass: detect swapped arguments (A→B and B→A on same line)
    const swapPairs = new Map<number, { typeA: string; typeB: string }>();
    for (let i = 0; i < sortedErrors.length; i++) {
      const e1 = sortedErrors[i];
      if (!e1.line) continue;
      const m1 = e1.message.match(/incompatible types:\s*([\w.]+)\s+cannot be converted to\s+([\w.]+)/);
      if (!m1) continue;
      for (let j = i + 1; j < sortedErrors.length; j++) {
        const e2 = sortedErrors[j];
        if (e2.line !== e1.line) continue;
        const m2 = e2.message.match(/incompatible types:\s*([\w.]+)\s+cannot be converted to\s+([\w.]+)/);
        if (!m2) continue;
        // Check if it's A→B and B→A (swap)
        if (m1[1] === m2[2] && m1[2] === m2[1]) {
          swapPairs.set(e1.line, { typeA: m1[1].split('.').pop()!, typeB: m1[2].split('.').pop()! });
        }
      }
    }

    // Apply swaps first
    for (const [lineNum, { typeA, typeB }] of swapPairs) {
      const li = lineNum - 1;
      if (li < 0 || li >= lines.length) continue;
      const ln = lines[li];
      // Find a method call with two arguments and swap them
      const methodMatch = ln.match(/(\w+\.\w+)\(([^,]+),\s*([^)]+)\)/);
      if (methodMatch) {
        const [full, method, arg1, arg2] = methodMatch;
        lines[li] = ln.replace(full, `${method}(${arg2.trim()}, ${arg1.trim()})`);
        modified = true;
      }
    }

    for (const err of sortedErrors) {
      if (!err.line) continue;
      // Skip errors that were handled by swap
      if (swapPairs.has(err.line)) continue;
      const lineIdx = err.line - 1;
      if (lineIdx < 0 || lineIdx >= lines.length) continue;
      const line = lines[lineIdx];

      // Pattern: List<Object> cannot be converted to List<X>
      const listMatch = err.message.match(/java\.util\.List<java\.lang\.Object>\s+cannot be converted to\s+(java\.util\.List<[\w.]+>|List<[\w.]+>)/);
      if (listMatch) {
        // Find the assignment: Type result = xxx.method();
        const assignMatch = line.match(/(\w+(?:<[^>]+>)?)\s+(\w+)\s*=\s*(.+);/);
        if (assignMatch) {
          const rhs = assignMatch[3];
          const targetType = assignMatch[1];
          const newLine = line.replace(
            `${assignMatch[1]} ${assignMatch[2]} = ${rhs}`,
            `${assignMatch[1]} ${assignMatch[2]} = (${targetType})(List<?>) ${rhs}`
          );
          lines[lineIdx] = newLine;
          modified = true;
          continue;
        }
        // Return statement: return xxx.method();
        const returnMatch = line.match(/return\s+(.+);/);
        if (returnMatch) {
          // Find method return type
          let returnType = 'List<?>';
          for (let i = lineIdx - 1; i >= Math.max(0, lineIdx - 10); i--) {
            const sigMatch = lines[i].match(/public\s+(List<[\w.]+>|java\.util\.List<[\w.]+>)/);
            if (sigMatch) { returnType = sigMatch[1]; break; }
          }
          lines[lineIdx] = line.replace(
            `return ${returnMatch[1]}`,
            `return (${returnType})(List<?>) ${returnMatch[1]}`
          );
          modified = true;
          continue;
        }
      }

      // Pattern: X cannot be converted to List<X> (single entity assigned to list)
      const singleToListMatch = err.message.match(/([\w.]+)\s+cannot be converted to\s+java\.util\.List<\1>/);
      if (!singleToListMatch) {
        // Try alternate form: com.pkg.X cannot be converted to java.util.List<com.pkg.X>
        const altListMatch = err.message.match(/([\w.]+)\s+cannot be converted to\s+java\.util\.List<([\w.]+)>/);
        if (altListMatch && altListMatch[1] === altListMatch[2]) {
          const assignMatch = line.match(/(\w+(?:<[^>]+>)?)\s+(\w+)\s*=\s*(.+);/);
          if (assignMatch) {
            const rhs = assignMatch[3];
            lines[lineIdx] = line.replace(
              `${assignMatch[1]} ${assignMatch[2]} = ${rhs}`,
              `${assignMatch[1]} ${assignMatch[2]} = java.util.Collections.singletonList(${rhs})`
            );
            modified = true;
            continue;
          }
        }
      }

      // Pattern: Object cannot be converted to X
      const objMatch = err.message.match(/java\.lang\.Object\s+cannot be converted to\s+([\w.]+)/);
      if (objMatch) {
        const targetType = objMatch[1].split('.').pop() || objMatch[1];
        // Find the assignment
        const assignMatch = line.match(/(\w+(?:<[^>]+>)?)\s+(\w+)\s*=\s*(.+);/);
        if (assignMatch) {
          const rhs = assignMatch[3];
          const newLine = line.replace(
            `${assignMatch[1]} ${assignMatch[2]} = ${rhs}`,
            `${assignMatch[1]} ${assignMatch[2]} = (${targetType}) ${rhs}`
          );
          lines[lineIdx] = newLine;
          modified = true;
          continue;
        }
        // Return statement
        const returnMatch = line.match(/return\s+(.+);/);
        if (returnMatch) {
          lines[lineIdx] = line.replace(
            `return ${returnMatch[1]}`,
            `return (${targetType}) ${returnMatch[1]}`
          );
          modified = true;
          continue;
        }
        // Fallback: if the line contains a method call, try to add cast before the call
        const methodCallMatch = line.match(/(\w+\.\w+\([^)]*\))/);
        if (methodCallMatch) {
          lines[lineIdx] = line.replace(
            methodCallMatch[1],
            `(${targetType}) ${methodCallMatch[1]}`
          );
          modified = true;
          continue;
        }
      }

      // Pattern: String cannot be converted to X (common in controllers)
      const strMatch = err.message.match(/java\.lang\.String\s+cannot be converted to\s+([\w.]+)/);
      if (strMatch) {
        const targetType = strMatch[1].split('.').pop() || strMatch[1];
        // Case A: Assignment — change type to Object
        const assignMatch = line.match(/(\w+(?:<[^>]+>)?)\s+(\w+)\s*=\s*(.+);/);
        if (assignMatch && assignMatch[1] === targetType) {
          lines[lineIdx] = line.replace(`${targetType} ${assignMatch[2]}`, `Object ${assignMatch[2]}`);
          modified = true;
          continue;
        }
        // Case B: Controller — change @RequestParam String to @RequestBody TargetType
        if (content.includes('@RestController') || content.includes('@Controller')) {
          for (let k = lineIdx; k >= Math.max(0, lineIdx - 20); k--) {
            const paramLine = lines[k];
            if (paramLine.match(/public\s+\S+\s+\w+\s*\(/)) {
              const rpMatch = paramLine.match(/@RequestParam\s+String\s+(\w+)/);
              if (rpMatch) {
                lines[k] = paramLine.replace(
                  `@RequestParam String ${rpMatch[1]}`,
                  `@RequestBody ${targetType} ${rpMatch[1]}`
                );
                modified = true;
              }
              break;
            }
          }
          continue;
        }
        // Case C: Service — change String parameter type to target type
        for (let k = lineIdx; k >= Math.max(0, lineIdx - 20); k--) {
          const paramLine = lines[k];
          if (paramLine.match(/public\s+\S+\s+\w+\s*\(/)) {
            const strParamMatch = paramLine.match(/String\s+(\w+)/);
            if (strParamMatch) {
              lines[k] = paramLine.replace(
                `String ${strParamMatch[1]}`,
                `${targetType} ${strParamMatch[1]}`
              );
              modified = true;
            }
            break;
          }
        }
        continue;
      }

      // Pattern: Long cannot be converted to int
      const longToIntMatch = err.message.match(/java\.lang\.Long\s+cannot be converted to\s+int/);
      if (longToIntMatch) {
        // Case 1: Variable declaration: int varName = ...
        const intVarMatch = line.match(/\bint\s+(\w+)\s*=/);
        if (intVarMatch) {
          lines[lineIdx] = line.replace(`int ${intVarMatch[1]}`, `long ${intVarMatch[1]}`);
          modified = true;
          continue;
        }
        // Case 2: @PathVariable int on the same line
        const pathVarIntMatch = line.match(/@PathVariable\s+int\s+(\w+)/);
        if (pathVarIntMatch) {
          lines[lineIdx] = line.replace(`@PathVariable int ${pathVarIntMatch[1]}`, `@PathVariable Long ${pathVarIntMatch[1]}`);
          modified = true;
          continue;
        }
        // Case 3: Method parameter (int paramName) on the same line
        if (line.match(/\(.*\bint\s+\w+/) && line.includes('public ')) {
          lines[lineIdx] = line.replace(/\bint\b/, 'Long');
          modified = true;
          continue;
        }
        // Case 4: The error is on a line with a method call passing Long to int param
        // Find the method being called and change its stub to accept Long
        const methodCallOnLine = line.match(/(\w+)\.(\w+)\(/);
        if (methodCallOnLine) {
          const serviceName = methodCallOnLine[1];
          const methodName = methodCallOnLine[2];
          // Find the service class file and change the method's int param to Long
          for (let fi = 0; fi < result.length; fi++) {
            const f = result[fi];
            // Match service class by field name pattern
            if (f.content.includes(`public`) && f.content.includes(methodName)) {
              const fLines = f.content.split('\n');
              for (let li = 0; li < fLines.length; li++) {
                if (fLines[li].includes(methodName) && fLines[li].includes('int ') && fLines[li].includes('public')) {
                  fLines[li] = fLines[li].replace(/\bint\b/, 'Long');
                  result[fi] = { ...f, content: fLines.join('\n') };
                  modified = true;
                  break;
                }
              }
              if (modified) break;
            }
          }
          if (modified) continue;
        }
        // Case 5: Look at the method signature above for @PathVariable int
        for (let k = lineIdx; k >= Math.max(0, lineIdx - 10); k--) {
          const sigLine = lines[k];
          const pvIntMatch = sigLine.match(/@PathVariable\s+int\s+(\w+)/);
          if (pvIntMatch) {
            lines[k] = sigLine.replace(`@PathVariable int ${pvIntMatch[1]}`, `@PathVariable Long ${pvIntMatch[1]}`);
            modified = true;
            break;
          }
        }
        continue;
      }

      // Pattern: inference variable T has incompatible bounds (equality: X, lower: Object)
      // This happens when ResponseEntity<X> receives an Object value
      const inferenceMatch = err.message.match(/inference variable \w+ has incompatible bounds/);
      if (inferenceMatch) {
        // Find the ResponseEntity.ok(result) pattern and add a cast
        const reMatch = line.match(/ResponseEntity\.ok\((.+?)\)/);
        if (reMatch) {
          // Find the return type from method signature above
          for (let k = lineIdx; k >= Math.max(0, lineIdx - 10); k--) {
            const sigMatch = lines[k].match(/ResponseEntity<(\w+)>/);
            if (sigMatch) {
              const targetType = sigMatch[1];
              lines[lineIdx] = line.replace(
                `ResponseEntity.ok(${reMatch[1]})`,
                `ResponseEntity.ok((${targetType}) ${reMatch[1]})`
              );
              modified = true;
              break;
            }
          }
        }
        continue;
      }
    }

    if (modified) {
      result[fileIdx] = { ...result[fileIdx], content: lines.join('\n') };
      actions.push({
        iteration,
        type: 'FIX_SYNTAX',
        file: result[fileIdx].path,
        description: `Fixed incompatible types with casts in ${fileName}`,
      });
    }
  }

  return { files: result, actions };
}

// ─── POM helpers ─────────────────────────────────────────────────────────────────────

function addDependencyToPom(pom: string, groupId: string, artifactId: string, version: string | undefined): string {
  const dep = version
    ? `        <dependency>\n            <groupId>${groupId}</groupId>\n            <artifactId>${artifactId}</artifactId>\n            <version>${version}</version>\n        </dependency>`
    : `        <dependency>\n            <groupId>${groupId}</groupId>\n            <artifactId>${artifactId}</artifactId>\n        </dependency>`;

  // Insert before </dependencies>
  return pom.replace("    </dependencies>", `${dep}\n    </dependencies>`);
}

// ─── Helper: Find method end by counting braces ──────────────────────────────

function findMethodEnd(content: string, methodStart: number): number {
  // Find the opening brace of the method body
  const openBrace = content.indexOf('{', methodStart);
  if (openBrace === -1) return -1;

  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = openBrace; i < content.length; i++) {
    const ch = content[i];
    const prev = i > 0 ? content[i - 1] : '';

    // Handle string literals (skip braces inside strings)
    if (!inString && (ch === '"' || ch === "'")) {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (inString) {
      if (ch === stringChar && prev !== '\\') {
        inString = false;
      }
      continue;
    }

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}
