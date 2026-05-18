/**
 * PostGenerationMigrator v12.3 — Post-generation phase that replaces TODO stubs
 * with actual migrated business logic using LLM + rule-based fallback.
 *
 * This runs AFTER generateSpringBootProject() and BEFORE quality scoring in the agent pipeline.
 * It scans generated service/adapter files for TODO patterns and replaces them with migrated code
 * using the original method bodies extracted by the parser.
 *
 * v12.3 additions:
 *   - ServletBodySplitter: splits Servlet doGet/doPost into Controller + Service (FIX 1)
 *   - Enhanced @Remote resolution: scans ALL source files for Bean implementations (FIX 2)
 *   - DtoFieldMapper: auto-generates DTOs and mappers from entity fields (FIX 3)
 *
 * @author Hamza NORDINE — Compleo
 */

import type { GeneratedFile } from "../../spring/shared";
import type { ProjectIR, UseCaseIR } from "../../java-parser";
import { MethodTransformer, type MethodContext, type MethodMigrationResult } from "./MethodTransformer";
import { splitServletBody, isServletBodyMigrable } from "./ServletBodySplitter";
import { extractEntityFields, generateInlineDtoMapping, generateDtoAndMapper } from "./DtoFieldMapper";
import { runFrameworkReplacements, type FrameworkReplacerStats } from "./FrameworkReplacer";

export interface PostMigrationStats {
  totalTodosFound: number;
  todosReplaced: number;
  todosByLLM: number;
  todosByRules: number;
  todosByServletSplitter: number;
  todosByDtoMapper: number;
  todosByRemoteResolution: number;
  todosKept: number;
  totalTimeMs: number;
  frameworkReplacements?: FrameworkReplacerStats;
}

export interface MethodBodyMap {
  /** className_methodName → body string */
  [key: string]: {
    body: string;
    bodyLOC: number;
    hasBusinessLogic: boolean;
    returnType: string;
    parameters: { name: string; type: string }[];
    className: string;
    methodName: string;
  };
}

/**
 * Build a map of all method bodies from the IR (UseCases + services + raw files).
 */
export function buildMethodBodyMap(ir: ProjectIR): MethodBodyMap {
  const map: MethodBodyMap = {};

  // From UseCases (direct EJB methods)
  for (const uc of ir.useCases) {
    if (!uc.rawSource) continue;

    // Extract method body from rawSource using the same regex as the parser
    const className = uc.className.includes("_") ? uc.className.split("_")[0] : uc.className;
    const methodName = uc.className.includes("_") ? uc.className.split("_").slice(1).join("_") : "execute";

    // Try to extract the specific method body
    const body = extractMethodBodyFromSource(uc.rawSource, methodName);
    if (body && body.trim().length > 20) {
      const bodyLOC = body.split("\n").filter(l => l.trim().length > 0).length;
      const hasBusinessLogic = detectBusinessLogic(body);

      map[`${className}_${methodName}`] = {
        body,
        bodyLOC,
        hasBusinessLogic,
        returnType: uc.voOutType || "void",
        parameters: (uc as any).methodParameters || [],
        className,
        methodName,
      };
    }
  }

  // From raw files — extract all public method bodies
  const rawFiles = (ir as any)._rawFiles ?? [];
  for (const file of rawFiles) {
    if (!file.content) continue;
    const fileClassName = file.path?.split("/").pop()?.replace(".java", "") ?? "";
    const methods = extractAllMethodBodies(file.content, fileClassName);
    for (const m of methods) {
      const key = `${fileClassName}_${m.methodName}`;
      if (!map[key]) {
        map[key] = m;
      }
    }
  }

  // Resolve @Remote interface methods → find body in implementing Bean
  // For each UseCase that injects services, try to resolve the Bean body
  for (const uc of ir.useCases) {
    for (const injected of uc.injectedServices) {
      // The injected type is e.g. "AccountService", the bean is "AccountServiceBean"
      const interfaceName = injected.type;
      const beanNames = [
        `${interfaceName}Bean`,
        `${interfaceName}Impl`,
        `${interfaceName}EJB`,
        interfaceName.replace(/Service$/, "ServiceBean"),
        interfaceName.replace(/Remote$/, "Bean"),
      ];
      for (const beanName of beanNames) {
        // Find all methods from this bean and alias them under the interface name
        for (const [key, value] of Object.entries(map)) {
          if (key.startsWith(`${beanName}_`)) {
            const methodName = key.split("_").slice(1).join("_");
            const interfaceKey = `${interfaceName}_${methodName}`;
            if (!map[interfaceKey]) {
              map[interfaceKey] = { ...value, className: interfaceName };
            }
          }
        }
      }
    }
  }

  // Also resolve from services in IR
  for (const svc of ir.services) {
    if (svc.methods) {
      for (const method of svc.methods) {
        if ((method as any).body && (method as any).body.trim().length > 20) {
          const key = `${svc.className}_${method.name}`;
          if (!map[key]) {
            const body = (method as any).body;
            map[key] = {
              body,
              bodyLOC: body.split("\n").filter((l: string) => l.trim().length > 0).length,
              hasBusinessLogic: detectBusinessLogic(body),
              returnType: method.returnType || "void",
              parameters: method.parameters || [],
              className: svc.className,
              methodName: method.name,
            };
          }
        }
      }
    }
  }

  return map;
}

/**
 * Run post-generation migration on all generated service/adapter files.
 * Replaces TODO stubs with migrated business logic.
 */
export async function runPostGenerationMigration(
  files: GeneratedFile[],
  ir: ProjectIR,
  options?: { maxMethodsPerRun?: number; skipLLM?: boolean }
): Promise<PostMigrationStats> {
  const stats: PostMigrationStats = {
    totalTodosFound: 0,
    todosReplaced: 0,
    todosByLLM: 0,
    todosByRules: 0,
    todosByServletSplitter: 0,
    todosByDtoMapper: 0,
    todosByRemoteResolution: 0,
    todosKept: 0,
    totalTimeMs: 0,
  };

  const startTime = Date.now();
  const methodBodyMap = buildMethodBodyMap(ir);
  const transformer = new MethodTransformer();
  const maxMethods = options?.maxMethodsPerRun ?? 30;
  let methodsProcessed = 0;

  // Collect available services and repositories from generated files
  const availableServices = extractServiceNames(files);
  const availableRepositories = extractRepositoryNames(files);

  // ─── Phase A: Servlet Body Splitting (FIX 1) ───────────────────────────────
  for (const file of files) {
    if (!file.path.endsWith(".java")) continue;
    if (!file.path.includes("/service/") && !file.path.includes("/controller/")) continue;

    const servletTodos = findServletTodoPatterns(file.content);
    for (const todo of servletTodos) {
      stats.totalTodosFound++;
      if (methodsProcessed >= maxMethods) { stats.todosKept++; continue; }

      // Find the original Servlet body
      const servletBody = findServletBody(todo, methodBodyMap, ir);
      if (!servletBody) { stats.todosKept++; continue; }

      // Check if migrable (≤15 lines, no complex patterns)
      if (!isServletBodyMigrable(servletBody)) {
        stats.todosKept++;
        continue;
      }

      const splitResult = splitServletBody(servletBody, todo.methodName, todo.className);
      if (splitResult.canMigrate) {
        file.content = replaceTodoWithCode(file.content, todo, splitResult.serviceCode, "servlet-splitter");
        stats.todosReplaced++;
        stats.todosByServletSplitter++;
      } else {
        stats.todosKept++;
      }
      methodsProcessed++;
    }
  }

  // ─── Phase B: DTO Field Mapping (FIX 3) ────────────────────────────────────
  for (const file of files) {
    if (!file.path.endsWith(".java")) continue;
    if (!file.path.includes("/service/") && !file.path.includes("/adapter/")) continue;

    const dtoTodos = findDtoTodoPatterns(file.content);
    for (const todo of dtoTodos) {
      stats.totalTodosFound++;
      if (methodsProcessed >= maxMethods) { stats.todosKept++; continue; }

      // Find the entity fields from the IR or generated entity files
      const entityFields = resolveEntityFields(todo.className, ir, files);
      if (entityFields.length === 0) { stats.todosKept++; continue; }

      const mappingCode = generateInlineDtoMapping(todo.className, entityFields, todo.className.charAt(0).toLowerCase() + todo.className.slice(1));
      if (mappingCode && !mappingCode.includes('No mappable fields')) {
        file.content = replaceTodoWithCode(file.content, todo, mappingCode, "dto-mapper");
        stats.todosReplaced++;
        stats.todosByDtoMapper++;
      } else {
        stats.todosKept++;
      }
      methodsProcessed++;
    }
  }

  // ─── Phase C: General TODO replacement (original + @Remote resolution) ─────
  for (const file of files) {
    if (!file.path.endsWith(".java")) continue;
    if (!file.path.includes("/service/") && !file.path.includes("/adapter/")) continue;

    // Find TODO patterns in the file (excluding Servlet and DTO ones already processed)
    const todoPatterns = findTodoPatterns(file.content);
    if (todoPatterns.length === 0) continue;

    stats.totalTodosFound += todoPatterns.length;

    for (const todo of todoPatterns) {
      if (methodsProcessed >= maxMethods) {
        stats.todosKept++;
        continue;
      }

      // Try to find the corresponding method body (enhanced @Remote resolution)
      const methodBody = findMethodBody(todo, methodBodyMap);
      if (!methodBody || !methodBody.hasBusinessLogic) {
        stats.todosKept++;
        continue;
      }

      // Track if this was resolved via @Remote
      const isRemoteResolution = todo.text.includes('@Remote') || todo.text.includes('migrated from');

      // Transform the method body
      const ctx: MethodContext = {
        className: methodBody.className,
        methodName: methodBody.methodName,
        returnType: methodBody.returnType,
        parameters: methodBody.parameters,
        body: methodBody.body,
        availableServices,
        availableRepositories,
      };

      try {
        // Pass skipLLM to the transformer — if true, only rule-based is used
        const result = await transformer.transform(ctx, { skipLLM: options?.skipLLM ?? false });

        if (result.strategy !== "todo") {
          // Replace the TODO block with migrated code
          file.content = replaceTodoWithCode(file.content, todo, result.code, result.strategy);
          stats.todosReplaced++;
          if (isRemoteResolution) stats.todosByRemoteResolution++;
          else if (result.strategy === "llm") stats.todosByLLM++;
          else stats.todosByRules++;
        } else {
          stats.todosKept++;
        }
      } catch {
        stats.todosKept++;
      }

      methodsProcessed++;
    }
  }

  // ─── Phase D: Framework Replacements (v12.4) ──────────────────────────────
  const fwResult = runFrameworkReplacements(files as Array<{ path: string; content: string; technology?: string }>);
  if (fwResult.stats.totalReplacements > 0) {
    // Apply the modified content back to original files (preserving category and other fields)
    for (let i = 0; i < files.length; i++) {
      files[i].content = fwResult.files[i].content;
    }
    stats.frameworkReplacements = fwResult.stats;
  }

  stats.totalTimeMs = Date.now() - startTime;
  return stats;
}

// ─── Servlet TODO Detection ─────────────────────────────────────────────────

function findServletTodoPatterns(content: string): TodoPattern[] {
  const patterns: TodoPattern[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match: // TODO: Migrer la logique métier de X.doPost/doGet
    const match = line.match(/\/\/\s*TODO:?\s*Migrer la logique m[ée]tier de\s+(\w+)\.(doPost|doGet)/i);
    if (match) {
      patterns.push({
        startIndex: i,
        endIndex: i,
        text: line,
        methodName: match[2],
        className: match[1],
      });
    }
  }

  return patterns;
}

function findServletBody(todo: TodoPattern, map: MethodBodyMap, ir: ProjectIR): string | null {
  // Try to find the Servlet body from the map
  const key = `${todo.className}_${todo.methodName}`;
  if (map[key]) return map[key].body;

  // Try with Servlet suffix
  const servletKey = `${todo.className}Servlet_${todo.methodName}`;
  if (map[servletKey]) return map[servletKey].body;

  // Try from raw files in IR
  const rawFiles = (ir as any)._rawFiles ?? [];
  for (const file of rawFiles) {
    if (!file.content) continue;
    const fileName = file.path?.split("/").pop()?.replace(".java", "") ?? "";
    if (fileName.toLowerCase().includes(todo.className.toLowerCase())) {
      const body = extractMethodBodyFromSource(file.content, todo.methodName);
      if (body) return body;
    }
  }

  return null;
}

// ─── DTO TODO Detection ─────────────────────────────────────────────────────

function findDtoTodoPatterns(content: string): TodoPattern[] {
  const patterns: TodoPattern[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match: // TODO: Mapper les champs depuis X vers existing
    const match = line.match(/\/\/\s*TODO:?\s*Mapper les champs depuis\s+(\w+)/i);
    if (match) {
      patterns.push({
        startIndex: i,
        endIndex: i,
        text: line,
        methodName: 'toDTO',
        className: match[1],
      });
    }
  }

  return patterns;
}

function resolveEntityFields(entityName: string, ir: ProjectIR, files: GeneratedFile[]): Array<{ name: string; type: string; annotations?: string[] }> {
  // Try from generated entity files
  for (const file of files) {
    if (file.path.includes('/entity/') && file.path.includes(entityName)) {
      return extractEntityFields(file.content);
    }
  }

  // Try from IR DTOs
  for (const dto of ir.dtos) {
    if (dto.className === entityName || dto.className === `${entityName}DTO`) {
      return dto.fields.map(f => ({ name: f.name, type: f.type }));
    }
  }

  // Try from raw source files
  const rawFiles = (ir as any)._rawFiles ?? [];
  for (const file of rawFiles) {
    if (!file.content) continue;
    const fileName = file.path?.split("/").pop()?.replace(".java", "") ?? "";
    if (fileName === entityName) {
      return extractEntityFields(file.content);
    }
  }

  return [];
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

interface TodoPattern {
  startIndex: number;
  endIndex: number;
  text: string;
  methodName: string;
  className: string;
}

function findTodoPatterns(content: string): TodoPattern[] {
  const patterns: TodoPattern[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match: // TODO: Implement business logic from legacy ClassName
    let match = line.match(/\/\/\s*TODO:?\s*Implement\s+(?:business logic from legacy|call to)\s+(\w+)/);
    if (match) {
      const className = match[1];
      // Try to find method name from context (previous line might have method signature)
      let methodName = "execute";
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const sigMatch = lines[j].match(/public\s+\w+\s+(\w+)\s*\(/);
        if (sigMatch) { methodName = sigMatch[1]; break; }
      }
      patterns.push({
        startIndex: i,
        endIndex: i,
        text: line,
        methodName,
        className,
      });
      continue;
    }

    // Match: // TODO: Implement <method> — migrated from @Remote ClassName
    match = line.match(/\/\/\s*TODO:?\s*Implement\s+(\w+)\s*[—\-]+\s*migrated from\s+@Remote\s+(\w+)/);
    if (match) {
      patterns.push({
        startIndex: i,
        endIndex: i + 1, // Also includes the next TODO line
        text: line,
        methodName: match[1],
        className: match[2],
      });
      continue;
    }

    // Match: // TODO: Implement step N — label
    match = line.match(/\/\/\s*TODO:?\s*Implement step\s+\d+\s*[—\-]+\s*(.+)/);
    if (match) {
      // Find the className from surrounding context
      let className = "Unknown";
      for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
        const ctxMatch = lines[j].match(/Migrated from:?\s*(\w+)/);
        if (ctxMatch) { className = ctxMatch[1]; break; }
      }
      let methodName = "execute";
      for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
        const sigMatch = lines[j].match(/public\s+\w+\s+(\w+)\s*\(/);
        if (sigMatch) { methodName = sigMatch[1]; break; }
      }
      patterns.push({
        startIndex: i,
        endIndex: i,
        text: line,
        methodName,
        className,
      });
    }
  }

  return patterns;
}

function findMethodBody(todo: TodoPattern, map: MethodBodyMap): MethodBodyMap[string] | null {
  // Try exact match first
  const exactKey = `${todo.className}_${todo.methodName}`;
  if (map[exactKey]) return map[exactKey];

  // Try without suffix (Bean, EJB, Impl)
  const baseName = todo.className.replace(/(Bean|EJB|Impl|Service|Adapter)$/, "");
  const baseKey = `${baseName}_${todo.methodName}`;
  if (map[baseKey]) return map[baseKey];

  // Try fuzzy match on method name
  for (const [key, value] of Object.entries(map)) {
    if (key.endsWith(`_${todo.methodName}`)) return value;
  }

  return null;
}

function replaceTodoWithCode(
  content: string, todo: TodoPattern, migratedCode: string, strategy: string
): string {
  const lines = content.split("\n");

  // Find the TODO line and the surrounding stub block
  let blockStart = todo.startIndex;
  let blockEnd = todo.endIndex;

  // Expand block to include related TODO/comment lines
  while (blockStart > 0 && /^\s*\/\//.test(lines[blockStart - 1])) {
    blockStart--;
  }
  while (blockEnd < lines.length - 1 && /^\s*\/\//.test(lines[blockEnd + 1])) {
    blockEnd++;
  }
  // Also include the throw statement if it follows
  if (blockEnd < lines.length - 1 && /throw new UnsupportedOperationException/.test(lines[blockEnd + 1])) {
    blockEnd++;
  }

  // Replace the block with migrated code
  const migrationComment = `        // ─── Migrated by v12.3 (${strategy}) ───`;
  const replacement = [migrationComment, migratedCode].join("\n");
  lines.splice(blockStart, blockEnd - blockStart + 1, replacement);

  return lines.join("\n");
}

function extractServiceNames(files: GeneratedFile[]): string[] {
  const names: string[] = [];
  for (const f of files) {
    if (f.path.includes("/service/") && f.path.endsWith("Service.java")) {
      const match = f.path.match(/\/(\w+Service)\.java$/);
      if (match) names.push(match[1]);
    }
  }
  return names;
}

function extractRepositoryNames(files: GeneratedFile[]): string[] {
  const names: string[] = [];
  for (const f of files) {
    if (f.path.includes("/repository/") && f.path.endsWith("Repository.java")) {
      const match = f.path.match(/\/(\w+Repository)\.java$/);
      if (match) names.push(match[1]);
    }
  }
  return names;
}

function extractMethodBodyFromSource(source: string, methodName: string): string | null {
  const regex = new RegExp(
    `(?:public|protected)\\s+[\\w<>,\\s\\[\\]]+?\\s+${escapeRegex(methodName)}\\s*\\([^)]*\\)\\s*(?:throws\\s+[\\w,\\s]+)?\\s*\\{`,
    "g"
  );
  const match = regex.exec(source);
  if (!match) return null;

  const bodyStart = match.index + match[0].length;
  let braceCount = 1;
  let bodyEnd = bodyStart;
  for (let i = bodyStart; i < source.length && braceCount > 0; i++) {
    if (source[i] === "{") braceCount++;
    else if (source[i] === "}") braceCount--;
    if (braceCount === 0) { bodyEnd = i; break; }
  }

  return source.substring(bodyStart, bodyEnd).trim();
}

function extractAllMethodBodies(content: string, className: string): Array<{
  body: string; bodyLOC: number; hasBusinessLogic: boolean;
  returnType: string; parameters: { name: string; type: string }[];
  className: string; methodName: string;
}> {
  const results: Array<{
    body: string; bodyLOC: number; hasBusinessLogic: boolean;
    returnType: string; parameters: { name: string; type: string }[];
    className: string; methodName: string;
  }> = [];

  const methodRegex = /public\s+([\w<>,\s\[\]]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g;
  let m;
  while ((m = methodRegex.exec(content)) !== null) {
    const returnType = m[1].trim();
    const methodName = m[2];
    const paramsStr = m[3];

    // Skip constructor
    if (methodName === className) continue;

    const bodyStart = m.index + m[0].length;
    let braceCount = 1;
    let bodyEnd = bodyStart;
    for (let i = bodyStart; i < content.length && braceCount > 0; i++) {
      if (content[i] === "{") braceCount++;
      else if (content[i] === "}") braceCount--;
      if (braceCount === 0) { bodyEnd = i; break; }
    }

    const body = content.substring(bodyStart, bodyEnd).trim();
    const bodyLOC = body.split("\n").filter(l => l.trim().length > 0).length;
    const hasBusinessLogic = detectBusinessLogic(body);

    const parameters = paramsStr.split(",").map(p => p.trim()).filter(Boolean).map(p => {
      const parts = p.split(/\s+/);
      return { name: parts[parts.length - 1], type: parts.slice(0, -1).join(" ") };
    });

    results.push({ body, bodyLOC, hasBusinessLogic, returnType, parameters, className, methodName });
  }

  return results;
}

function detectBusinessLogic(body: string): boolean {
  const loc = body.split("\n").filter(l => l.trim().length > 0).length;
  return loc > 2 && (
    /em\.(persist|merge|remove|find|createQuery|createNativeQuery)/.test(body) ||
    /\w+Service\.\w+\(|\w+Bean\.\w+\(|\w+EJB\.\w+\(/.test(body) ||
    /prepareStatement|executeQuery|executeUpdate|getConnection/.test(body) ||
    /BigDecimal|\.(add|subtract|multiply|divide)\(/.test(body) ||
    /\bfor\s*\(|\bwhile\s*\(/.test(body) && /\.(get|set|add|remove)\w*\(/.test(body) ||
    /\bif\s*\([^)]*\b(status|state|amount|solde|balance|montant|type|code)\b/.test(body)
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
