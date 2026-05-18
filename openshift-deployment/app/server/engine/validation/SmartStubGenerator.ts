/**
 * SmartStubGenerator v12.11 — Generate stubs with methods inferred from actual usage.
 *
 * Instead of generating empty stubs (which cause cascading "cannot find symbol" errors),
 * this module scans all generated files to find how the missing class is used, then
 * generates a stub containing every method/field that is actually called.
 *
 * Algorithm:
 *   1. Find all variables of type MissingClass in generated code
 *   2. For each variable, collect method calls (var.method(args))
 *   3. Infer return type and param types from usage context
 *   4. If return type is itself a missing class, recurse (max depth 3)
 *   5. Generate stub with all collected methods
 *
 * @version 12.11
 */

interface GeneratedFile {
  path: string;
  content: string;
}

interface MethodSignature {
  name: string;
  returnType: string;
  params: Array<{ name: string; type: string }>;
  isStatic: boolean;
}

interface FieldSignature {
  name: string;
  type: string;
}

interface SmartStubResult {
  className: string;
  pkg: string;
  stubContent: string;
  transitiveStubs: Map<string, string>; // className -> stubContent
}

/**
 * Generate a smart stub for a missing class by inferring its API from usage.
 */
/**
 * v12.13: Build a map of className -> actual package from all files.
 * Used by renderStub to resolve correct imports for types used in stub signatures.
 */
function buildClassPackageMap(allFiles: GeneratedFile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of allFiles) {
    if (!f.path.endsWith('.java')) continue;
    const pkgMatch = f.content.match(/^package\s+([\w.]+)\s*;/m);
    const classMatch = f.content.match(/(?:public\s+)?(?:class|interface|enum|record)\s+(\w+)/);
    if (pkgMatch && classMatch) {
      map.set(classMatch[1], pkgMatch[1]);
    }
  }
  return map;
}

export function generateSmartStub(
  missingClass: string,
  pkg: string,
  allFiles: GeneratedFile[],
  existingClasses: Set<string>,
  depth: number = 0,
  maxDepth: number = 3
): SmartStubResult {
  const transitiveStubs = new Map<string, string>();

  if (depth > maxDepth) {
    return {
      className: missingClass,
      pkg,
      stubContent: renderEmptyStub(pkg, missingClass),
      transitiveStubs,
    };
  }

  // 1. Find all variables/usages of this class
  const varNames = findVariablesOfType(missingClass, allFiles);

  // 2. Collect method calls and field accesses
  const methods = new Map<string, MethodSignature>();
  // v13.10: Track all observed param counts per method to pick the most frequent (mode)
  const methodParamCounts = new Map<string, number[]>();
  const fields = new Map<string, FieldSignature>();
  let hasConstructorWithArgs = false;
  let constructorArgTypes: string[] = [];

  for (const file of allFiles) {
    if (!file.content.includes(missingClass)) continue;

    // Check for static method calls: MissingClass.method(args)
    const staticCallRegex = new RegExp(
      `${missingClass}\\s*\\.\\s*(\\w+)\\s*\\(([^)]*)\\)`,
      "g"
    );
    let m;
    while ((m = staticCallRegex.exec(file.content)) !== null) {
      const methodName = m[1];
      const argsStr = m[2];
      if (methodName === 'class' || methodName === 'this') continue;
      const sig = inferMethodSignature(
        methodName,
        argsStr,
        file.content,
        m.index,
        allFiles,
        true
      );
      // Track param count for mode calculation
      if (!methodParamCounts.has(methodName)) methodParamCounts.set(methodName, []);
      methodParamCounts.get(methodName)!.push(sig.params.length);
      if (!methods.has(methodName) || methods.get(methodName)!.params.length < sig.params.length) {
        methods.set(methodName, sig);
      }
    }

    // Check for instance method calls on variables of this type
    for (const varName of varNames) {
      const instanceCallRegex = new RegExp(
        `${varName}\\s*\\.\\s*(\\w+)\\s*\\(([^)]*)\\)`,
        "g"
      );
      while ((m = instanceCallRegex.exec(file.content)) !== null) {
        const methodName = m[1];
        const argsStr = m[2];
        if (methodName === 'class' || methodName === 'this' || methodName === 'getClass') continue;
        const sig = inferMethodSignature(
          methodName,
          argsStr,
          file.content,
          m.index,
          allFiles,
          false
        );
        // Track param count for mode calculation
        if (!methodParamCounts.has(methodName)) methodParamCounts.set(methodName, []);
        methodParamCounts.get(methodName)!.push(sig.params.length);
        if (!methods.has(methodName) || methods.get(methodName)!.params.length < sig.params.length) {
          methods.set(methodName, sig);
        }
      }

      // Check for field accesses: varName.fieldName (not followed by '(')
      const fieldRegex = new RegExp(
        `${varName}\\s*\\.\\s*(\\w+)(?!\\s*\\()`,
        "g"
      );
      while ((m = fieldRegex.exec(file.content)) !== null) {
        const fieldName = m[1];
        if (fieldName === 'class' || fieldName === 'this') continue;
        // Skip if it's actually a method call we missed
        if (methods.has(fieldName)) continue;
        // v13.10: Skip truncated method names caused by lookahead backtracking
        // e.g., "getNodeAsStrin" is a prefix of method "getNodeAsString"
        const isTruncatedMethod = [...methods.keys()].some(mName => mName.startsWith(fieldName) && mName.length > fieldName.length);
        if (isTruncatedMethod) continue;
        // Also skip if the next char in source is a word char (indicates truncation)
        const matchEnd = m.index + m[0].length;
        if (matchEnd < file.content.length && /\w/.test(file.content[matchEnd])) continue;
        if (!fields.has(fieldName)) {
          fields.set(fieldName, { name: fieldName, type: inferFieldType(fieldName) });
        }
      }
    }

    // Check for constructor calls with args: new MissingClass(args)
    const ctorRegex = new RegExp(`new\\s+${missingClass}\\s*\\(([^)]*)\\)`, "g");
    while ((m = ctorRegex.exec(file.content)) !== null) {
      const argsStr = m[1].trim();
      if (argsStr.length > 0) {
        hasConstructorWithArgs = true;
        const args = splitArgs(argsStr);
        if (args.length > constructorArgTypes.length) {
          constructorArgTypes = args.map((arg, i) =>
            inferArgType(arg, file.content, m!.index)
          );
        }
      }
    }
  }

  // v13.10: Correct method signatures using mode (most frequent param count)
  // This fixes false positives from regex [^)]* not handling nested parentheses
  for (const [methodName, counts] of methodParamCounts) {
    if (counts.length <= 1) continue;
    // Find mode (most frequent param count)
    const freq = new Map<number, number>();
    for (const c of counts) freq.set(c, (freq.get(c) || 0) + 1);
    let modeCount = counts[0];
    let modeFreq = 0;
    for (const [count, f] of freq) {
      if (f > modeFreq || (f === modeFreq && count < modeCount)) {
        modeCount = count;
        modeFreq = f;
      }
    }
    const currentSig = methods.get(methodName);
    if (currentSig && currentSig.params.length > modeCount) {
      // Truncate params to mode count
      currentSig.params = currentSig.params.slice(0, modeCount);
      methods.set(methodName, currentSig);
    }
  }

  // 3. Check for transitive missing classes in return types AND generic type params
  const SKIP_TYPES = new Set(['void','Object','String','int','long','boolean','double','float','Integer','Long','Boolean','Double','Float','Short','Byte','Character','Number','List','Map','Set','Date','BigDecimal','LocalDate','Exception','RuntimeException','Throwable','Error']);
  const collectTransitiveTypes = (type: string): string[] => {
    const types: string[] = [];
    const genericIdx = type.indexOf('<');
    const rawType = genericIdx > 0 ? type.substring(0, genericIdx) : type;
    if (!SKIP_TYPES.has(rawType) && /^[A-Z]/.test(rawType) && !rawType.startsWith('java.')) types.push(rawType);
    // v13.10: Also check generic type parameters (e.g., List<DeclicTirageDTO>)
    const genericMatch = type.match(/<([A-Z]\w+)>/);
    if (genericMatch && !SKIP_TYPES.has(genericMatch[1])) types.push(genericMatch[1]);
    return types;
  };
  for (const [name, sig] of methods) {
    const typesToCheck = [...collectTransitiveTypes(sig.returnType)];
    for (const p of sig.params) typesToCheck.push(...collectTransitiveTypes(p.type));
    for (const rawRt of typesToCheck) {
      if (/[<>\[\]\s,()]/.test(rawRt)) continue;
      if (existingClasses.has(rawRt) || rawRt === missingClass || depth >= maxDepth) continue;
      // This type is also missing — recurse
      const transitive = generateSmartStub(
        rawRt,
        pkg,
        allFiles,
        existingClasses,
        depth + 1,
        maxDepth
      );
      transitiveStubs.set(rawRt, transitive.stubContent);
      transitive.transitiveStubs.forEach((v, k) => transitiveStubs.set(k, v));
    }
  }
  // v13.10: Also check constructor arg types for transitive stubs
  for (const ctorType of constructorArgTypes) {
    for (const rawRt of collectTransitiveTypes(ctorType)) {
      if (/[<>\[\]\s,()]/.test(rawRt)) continue;
      if (existingClasses.has(rawRt) || rawRt === missingClass || depth >= maxDepth) continue;
      const transitive = generateSmartStub(rawRt, pkg, allFiles, existingClasses, depth + 1, maxDepth);
      transitiveStubs.set(rawRt, transitive.stubContent);
      transitive.transitiveStubs.forEach((v, k) => transitiveStubs.set(k, v));
    }
  }

  // 4. Render the stub (v12.13: pass classPackageMap for correct import resolution)
  const classPackageMap = buildClassPackageMap(allFiles);
  const stubContent = renderStub(pkg, missingClass, methods, fields, hasConstructorWithArgs, constructorArgTypes, classPackageMap);

  return { className: missingClass, pkg, stubContent, transitiveStubs };
}

// ─── Variable Discovery ──────────────────────────────────────────────────────

function findVariablesOfType(className: string, files: GeneratedFile[]): Set<string> {
  const varNames = new Set<string>();

  for (const file of files) {
    if (!file.content.includes(className)) continue;

    // Pattern: ClassName varName = ...
    const declRegex = new RegExp(
      `(?:^|[\\s(,])${className}(?:<[^>]*>)?\\s+(\\w+)\\s*[=;,)]`,
      "gm"
    );
    let m;
    while ((m = declRegex.exec(file.content)) !== null) {
      const varName = m[1];
      if (varName !== className && varName.length > 1 && varName[0] === varName[0].toLowerCase()) {
        varNames.add(varName);
      }
    }

    // Pattern: (ClassName) cast
    const castRegex = new RegExp(
      `\\(${className}\\)\\s*(\\w+)`,
      "g"
    );
    while ((m = castRegex.exec(file.content)) !== null) {
      varNames.add(m[1]);
    }

    // Pattern: ClassName varName in for-each
    const forEachRegex = new RegExp(
      `for\\s*\\(\\s*${className}\\s+(\\w+)\\s*:`,
      "g"
    );
    while ((m = forEachRegex.exec(file.content)) !== null) {
      varNames.add(m[1]);
    }
  }

  return varNames;
}

// ─── Method Signature Inference ──────────────────────────────────────────────

function inferMethodSignature(
  methodName: string,
  argsStr: string,
  fileContent: string,
  callIndex: number,
  allFiles: GeneratedFile[],
  isStatic: boolean
): MethodSignature {
  // Infer return type from usage context
  const returnType = inferReturnType(methodName, fileContent, callIndex);

  // Infer parameter types
  const args = splitArgs(argsStr);
  const params = args.map((arg, i) => ({
    name: `arg${i}`,
    type: inferArgType(arg.trim(), fileContent, callIndex),
  }));

  return { name: methodName, returnType, params, isStatic };
}

function inferReturnType(methodName: string, content: string, callIndex: number): string {
  // Get surrounding context (200 chars before and after)
  const start = Math.max(0, callIndex - 200);
  const end = Math.min(content.length, callIndex + 300);
  const context = content.substring(start, end);

  // Pattern: Type varName = ...obj.methodName(...)
  const assignRegex = new RegExp(
    `(\\w+(?:<[^>]*>)?)\\s+\\w+\\s*=\\s*[^;]*\\.${methodName}\\s*\\(`
  );
  const assignMatch = context.match(assignRegex);
  if (assignMatch) {
    const type = assignMatch[1];
    if (type !== 'var' && type !== 'final' && type !== 'return' && type !== 'new') {
      return normalizeType(type);
    }
  }

  // Pattern: return obj.methodName(...) in a method with declared return type
  const returnRegex = new RegExp(`return\\s+[^;]*\\.${methodName}\\s*\\(`);
  if (returnRegex.test(context)) {
    // Try to find the enclosing method's return type
    const methodDeclRegex = /(?:public|private|protected)\s+(?:static\s+)?(\w+(?:<[^>]*>)?)\s+\w+\s*\(/g;
    const fullContext = content.substring(Math.max(0, callIndex - 1000), callIndex);
    let lastMethodType = "";
    let mm;
    while ((mm = methodDeclRegex.exec(fullContext)) !== null) {
      lastMethodType = mm[1];
    }
    if (lastMethodType && lastMethodType !== 'void' && lastMethodType !== 'new') {
      return normalizeType(lastMethodType);
    }
  }

  // Pattern: if (obj.methodName(...)) → boolean
  const ifRegex = new RegExp(`if\\s*\\([^)]*\\.${methodName}\\s*\\(`);
  if (ifRegex.test(context)) return "boolean";

  // Pattern: while (obj.methodName(...)) → boolean
  const whileRegex = new RegExp(`while\\s*\\([^)]*\\.${methodName}\\s*\\(`);
  if (whileRegex.test(context)) return "boolean";

  // Pattern: for (Type x : obj.methodName(...)) → List<Type>
  const forEachRegex = new RegExp(`for\\s*\\(\\s*(\\w+)\\s+\\w+\\s*:[^)]*\\.${methodName}\\s*\\(`);
  const forMatch = context.match(forEachRegex);
  if (forMatch) return `java.util.List<${forMatch[1]}>`;

  // Pattern: obj.methodName(...).someStringMethod() → String
  const chainStringRegex = new RegExp(`\\.${methodName}\\s*\\([^)]*\\)\\s*\\.\\s*(contains|equals|startsWith|endsWith|length|trim|substring|toLowerCase|toUpperCase|isEmpty|charAt|indexOf|replace)\\s*\\(`);
  if (chainStringRegex.test(context)) return "String";

  // Pattern: obj.methodName(...).size() or .isEmpty() → List or Collection
  const chainCollRegex = new RegExp(`\\.${methodName}\\s*\\([^)]*\\)\\s*\\.\\s*(size|isEmpty|add|remove|get|iterator)\\s*\\(`);
  if (chainCollRegex.test(context)) return "java.util.List<Object>";

  // Pattern: statement alone (no assignment, no return, no condition) → void
  const stmtRegex = new RegExp(`^\\s*\\w+\\.${methodName}\\s*\\([^)]*\\)\\s*;`, "m");
  if (stmtRegex.test(context)) return "void";

  // Heuristic from method name
  if (methodName.startsWith("get") || methodName.startsWith("find") || methodName.startsWith("load")) {
    if (methodName.toLowerCase().includes("list") || methodName.toLowerCase().includes("all")) {
      return "java.util.List<Object>";
    }
    // v13.10: Detect type hints in method name (getNodeAsString → String, getAsInt → int)
    if (methodName.endsWith("String") || methodName.endsWith("AsString") || methodName.includes("AsString")) {
      return "String";
    }
    if (methodName.endsWith("Int") || methodName.endsWith("AsInt") || methodName.endsWith("Integer")) {
      return "int";
    }
    if (methodName.endsWith("Long") || methodName.endsWith("AsLong")) {
      return "long";
    }
    if (methodName.endsWith("Boolean") || methodName.endsWith("AsBool") || methodName.endsWith("AsBoolean")) {
      return "boolean";
    }
    if (methodName.endsWith("Double") || methodName.endsWith("AsDouble")) {
      return "double";
    }
    if (methodName.endsWith("Date")) {
      return "java.util.Date";
    }
    return "Object";
  }
  if (methodName.startsWith("set") || methodName.startsWith("add") || methodName.startsWith("remove") ||
      methodName.startsWith("delete") || methodName.startsWith("insert") || methodName.startsWith("update")) {
    return "void";
  }
  if (methodName.startsWith("is") || methodName.startsWith("has") || methodName.startsWith("can") ||
      methodName.startsWith("should") || methodName.startsWith("check")) {
    return "boolean";
  }
  if (methodName.startsWith("count") || methodName.startsWith("size")) {
    return "int";
  }
  if (methodName.startsWith("to") && methodName.endsWith("String")) {
    return "String";
  }

  // Default fallback
  return "Object";
}

function inferArgType(arg: string, content: string, callIndex: number): string {
  const trimmed = arg.trim();

  // Null literal
  if (trimmed === "null") return "Object";

  // String literal
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return "String";

  // Numeric literal
  if (/^\d+L$/.test(trimmed)) return "long";
  if (/^\d+\.\d+[fF]$/.test(trimmed)) return "float";
  if (/^\d+\.\d+$/.test(trimmed)) return "double";
  if (/^\d+$/.test(trimmed)) return "int";

  // Boolean literal
  if (trimmed === "true" || trimmed === "false") return "boolean";

  // Method call: something.method() - try to infer from context
  if (trimmed.includes(".")) {
    // Check for common patterns
    if (trimmed.includes("toString()") || trimmed.includes("getString") || trimmed.includes("getCode") ||
        trimmed.includes("getName") || trimmed.includes("getMessage") || trimmed.includes("getType") ||
        trimmed.includes("getLang") || trimmed.includes("getStatus")) {
      return "String";
    }
    if (trimmed.includes("getId") || trimmed.includes("getNum")) return "Long";
    if (trimmed.includes("getDate") || trimmed.includes("getTime")) return "java.util.Date";
    if (trimmed.includes("getAmount") || trimmed.includes("getMontant")) return "java.math.BigDecimal";
    if (trimmed.includes("getList") || trimmed.includes("getAll")) return "java.util.List<Object>";
    if (trimmed.includes("size()") || trimmed.includes("length()")) return "int";
    if (trimmed.includes("is") || trimmed.includes("has")) return "boolean";
    return "Object";
  }

  // Variable name — look for its declaration in context
  const context = content.substring(
    Math.max(0, callIndex - 2000),
    callIndex
  );
  const declRegex = new RegExp(
    `(\\w+(?:<[^>]*>)?)\\s+${escapeRegex(trimmed)}\\s*[=;,)]`
  );
  const declMatch = context.match(declRegex);
  if (declMatch) {
    const type = declMatch[1];
    if (type !== 'var' && type !== 'final' && type !== 'new' && type !== 'return') {
      return normalizeType(type);
    }
  }

  // Name-based heuristics
  const lower = trimmed.toLowerCase();
  if (lower.includes("request") || lower.includes("req")) return "Object";
  if (lower.includes("response") || lower.includes("resp")) return "Object";
  if (lower === "e" || lower === "ex" || lower === "exception") return "Exception";
  if (lower.includes("id") && lower.length <= 4) return "Long";
  if (lower.includes("name") || lower.includes("code") || lower.includes("type") ||
      lower.includes("status") || lower.includes("message") || lower.includes("label")) return "String";
  if (lower.includes("amount") || lower.includes("montant") || lower.includes("solde")) return "java.math.BigDecimal";
  if (lower.includes("date")) return "java.util.Date";
  if (lower.includes("list") || lower.includes("items")) return "java.util.List<Object>";
  if (lower.includes("count") || lower.includes("index") || lower.includes("size")) return "int";
  if (lower.includes("flag") || lower.includes("active") || lower.includes("enabled")) return "boolean";

  return "Object";
}

function inferFieldType(fieldName: string): string {
  const lower = fieldName.toLowerCase();
  if (lower.includes("id")) return "Long";
  if (lower.includes("name") || lower.includes("code") || lower.includes("label") ||
      lower.includes("type") || lower.includes("status")) return "String";
  if (lower.includes("date") || lower.includes("time")) return "java.util.Date";
  if (lower.includes("amount") || lower.includes("montant")) return "java.math.BigDecimal";
  if (lower.includes("count") || lower.includes("size") || lower.includes("number")) return "int";
  if (lower.includes("active") || lower.includes("enabled") || lower.includes("flag")) return "boolean";
  if (lower.includes("list") || lower.includes("items")) return "java.util.List<Object>";
  return "Object";
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function renderStub(
  pkg: string,
  className: string,
  methods: Map<string, MethodSignature>,
  fields: Map<string, FieldSignature>,
  hasCtorWithArgs: boolean,
  ctorArgTypes: string[],
  classPackageMap?: Map<string, string>
): string {
  const imports = new Set<string>();
  const methodBodies: string[] = [];

  // Collect imports from types used
  const addImport = (type: string) => {
    // Strip generic parameters for import resolution
    const rawType = type.includes('<') ? type.substring(0, type.indexOf('<')) : type;
    if (type.includes("List")) { imports.add("java.util.List"); imports.add("java.util.ArrayList"); }
    if (type.includes("Map")) { imports.add("java.util.Map"); imports.add("java.util.HashMap"); }
    if (type.includes("Set")) { imports.add("java.util.Set"); imports.add("java.util.HashSet"); }
    if (type.includes("Collections")) imports.add("java.util.Collections");
    if (type.includes("BigDecimal")) imports.add("java.math.BigDecimal");
    if (type.includes("Date") && !type.includes("LocalDate")) imports.add("java.util.Date");
    if (type.includes("LocalDate")) imports.add("java.time.LocalDate");
    if (type.includes("Reader")) imports.add("java.io.Reader");
    if (type.includes("InputStream")) imports.add("java.io.InputStream");
    if (type.includes("OutputStream")) imports.add("java.io.OutputStream");
    // v13.10: Extended exclusion list — java.lang types that don't need imports
    const JAVA_LANG_TYPES = new Set(['String','Object','Integer','Long','Boolean','Double','Float','Byte','Short','Character','Void','Number','Throwable','Exception','RuntimeException','Error','Class','Comparable','Iterable','AutoCloseable','Cloneable','Runnable','Thread','List','Map','Set','Date','BigDecimal','LocalDate','Reader','InputStream','OutputStream','Collections']);
    if (/^[A-Z]/.test(rawType) && !rawType.startsWith('java.') && !JAVA_LANG_TYPES.has(rawType)) {
      const actualPkg = classPackageMap?.get(rawType);
      if (actualPkg && actualPkg !== pkg) {
        // v13.10: Only import if from a different package (same-package classes don't need imports in Java)
        imports.add(`${actualPkg}.${rawType}`);
      }
      // v13.10: If class not found in classPackageMap, don't add import from same pkg
      // (it either exists in same package and doesn't need import, or doesn't exist at all)
    }
    // v12.13: Also resolve generic type parameters (e.g., List<Dotation> → import Dotation)
    const genericMatch = type.match(/<([A-Z]\w+)>/);
    if (genericMatch) {
      const innerType = genericMatch[1];
      if (!JAVA_LANG_TYPES.has(innerType)) {
        const innerPkg = classPackageMap?.get(innerType);
        if (innerPkg && innerPkg !== pkg) {
          imports.add(`${innerPkg}.${innerType}`);
        }
        // v13.10: Don't import from same package
      }
    }
  };

  // Generate constructor
  methodBodies.push(`    public ${className}() {}`);
  if (hasCtorWithArgs && ctorArgTypes.length > 0) {
    const ctorParams = ctorArgTypes.map((t, i) => `${simplifyType(t)} arg${i}`).join(", ");
    ctorArgTypes.forEach(addImport);
    methodBodies.push(`    public ${className}(${ctorParams}) {}`);
  }

  // Generate methods
  for (const [name, sig] of methods) {
    addImport(sig.returnType);
    sig.params.forEach(p => addImport(p.type));

    const paramsStr = sig.params.map((p, i) => `${simplifyType(p.type)} ${p.name}`).join(", ");
    const staticMod = sig.isStatic ? "static " : "";
    const returnStr = getReturnStatement(sig.returnType);
    const returnTypeStr = simplifyType(sig.returnType);

    if (sig.returnType === "void") {
      methodBodies.push(`    public ${staticMod}void ${name}(${paramsStr}) {}`);
    } else {
      methodBodies.push(`    public ${staticMod}${returnTypeStr} ${name}(${paramsStr}) { ${returnStr} }`);
    }
  }

  // Generate fields (public for simplicity)
  const fieldDecls: string[] = [];
  for (const [name, field] of fields) {
    addImport(field.type);
    fieldDecls.push(`    public ${simplifyType(field.type)} ${name};`);
  }

  // Build import section
  const importLines = Array.from(imports)
    .filter(i => i.includes("."))
    .map(i => `import ${i};`)
    .join("\n");

  return `package ${pkg};

${importLines ? importLines + "\n" : ""}/**
 * Auto-generated smart stub for ${className}.
 * Methods inferred from usage in generated code.
 * @generated by Compleo v12.11 SmartStubGenerator
 */
public class ${className} {

${fieldDecls.length > 0 ? fieldDecls.join("\n") + "\n\n" : ""}${methodBodies.join("\n\n")}
}
`;
}

function renderEmptyStub(pkg: string, className: string): string {
  return `package ${pkg};

/**
 * Auto-generated stub for ${className} (max recursion depth reached).
 * @generated by Compleo v12.11 SmartStubGenerator
 */
public class ${className} {
    public ${className}() {}
}
`;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function splitArgs(argsStr: string): string[] {
  if (!argsStr.trim()) return [];
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of argsStr) {
    if (ch === "(" || ch === "<" || ch === "[") depth++;
    else if (ch === ")" || ch === ">" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function normalizeType(type: string): string {
  // Remove generic wildcards for simplicity
  if (type === "var" || type === "final") return "Object";
  return type;
}

function simplifyType(type: string): string {
  // java.util.List<Object> → List<Object>
  if (type.startsWith("java.util.List")) return type.replace("java.util.List", "List");
  if (type.startsWith("java.util.Map")) return type.replace("java.util.Map", "Map");
  if (type.startsWith("java.math.BigDecimal")) return "BigDecimal";
  if (type.startsWith("java.util.Date")) return "Date";
  if (type.startsWith("java.time.LocalDate")) return "LocalDate";
  // v13.10: Replace invalid types (lowercase, Java/SQL keywords) with Object
  const INVALID_TYPES = new Set(['from','select','where','into','class','new','return','this','super','null','true','false','void','if','else','for','while','do','switch','case','break','continue','try','catch','finally','throw','throws','import','package','public','private','protected','static','final','abstract','interface','extends','implements','instanceof','var','val']);
  if (INVALID_TYPES.has(type) || (type.length > 0 && /^[a-z]/.test(type) && !['int','long','float','double','boolean','byte','short','char'].includes(type))) {
    return 'Object';
  }
  return type;
}

function getReturnStatement(returnType: string): string {
  if (returnType === "void") return "";
  if (returnType === "boolean") return "return false;";
  if (returnType === "int" || returnType === "long" || returnType === "float" || returnType === "double") return "return 0;";
  if (returnType === "Integer" || returnType === "Long") return "return 0L;";
  if (returnType.includes("List")) return "return new ArrayList<>();";
  if (returnType.includes("Map")) return "return new java.util.HashMap<>();";
  if (returnType === "String") return 'return "";';
  return "return null;";
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
