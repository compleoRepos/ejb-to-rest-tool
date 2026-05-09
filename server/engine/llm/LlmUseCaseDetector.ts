/**
 * LlmUseCaseDetector — v10.16
 *
 * Détecte les Use Cases dans les projets Java legacy qui n'utilisent pas
 * les patterns standards (@UseCase, BaseUseCase, @Stateless, @WebService).
 *
 * Stratégie multi-niveaux :
 *   1. Détection rule-based des patterns de dispatch (switch/case, if/else sur action)
 *   2. Extraction des services injectés et de leurs méthodes publiques
 *   3. Fallback LLM pour les cas ambigus (nommage, classification)
 *
 * Intégré dans CompleoEngine.analyze() comme fallback quand 0 UC sont détectés.
 *
 * @author Compleo
 * @since v10.16
 */

import type { UseCaseIR, InjectedService } from "../../java-parser";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DetectedUseCase {
  className: string;
  methodName: string;
  voInType: string;
  voOutType: string;
  description: string;
  domain: string;
  sourceFile: string;
  rawSource: string;
  parameters: { name: string; type: string }[];
  confidence: "high" | "medium" | "low";
  detectionMethod: "switch_dispatch" | "service_method" | "controller_endpoint" | "llm_inferred";
}

export interface LlmUseCaseDetectorResult {
  useCases: UseCaseIR[];
  detectedCount: number;
  method: string;
  warnings: string[];
}

interface JavaFile {
  path: string;
  content: string;
  packageName?: string;
  className?: string;
}

// ─── Détecteur principal ──────────────────────────────────────────────────────

export class LlmUseCaseDetector {

  /**
   * Détecte les UC dans un ensemble de fichiers Java.
   * Appelé quand le parser rule-based ne trouve aucun UC.
   */
  detect(files: JavaFile[]): LlmUseCaseDetectorResult {
    const warnings: string[] = [];
    const javaFiles = files.filter(f => f.path.endsWith(".java"));

    // Étape 1 : Chercher les controllers avec dispatch switch/case
    const dispatchUCs = this.detectSwitchDispatch(javaFiles);
    if (dispatchUCs.length > 0) {
      warnings.push(`[v10.16 LlmUseCaseDetector] ${dispatchUCs.length} UC détectés via switch/case dispatch`);
      return {
        useCases: dispatchUCs.map(uc => this.toUseCaseIR(uc)),
        detectedCount: dispatchUCs.length,
        method: "switch_dispatch",
        warnings,
      };
    }

    // Étape 2 : Chercher les controllers REST avec @RequestMapping/@PostMapping
    const controllerUCs = this.detectControllerEndpoints(javaFiles);
    if (controllerUCs.length > 0) {
      warnings.push(`[v10.16 LlmUseCaseDetector] ${controllerUCs.length} UC détectés via controller endpoints`);
      return {
        useCases: controllerUCs.map(uc => this.toUseCaseIR(uc)),
        detectedCount: controllerUCs.length,
        method: "controller_endpoint",
        warnings,
      };
    }

    // Étape 3 : Extraire les services avec méthodes publiques métier
    const serviceUCs = this.detectServiceMethods(javaFiles);
    if (serviceUCs.length > 0) {
      warnings.push(`[v10.16 LlmUseCaseDetector] ${serviceUCs.length} UC détectés via service methods`);
      return {
        useCases: serviceUCs.map(uc => this.toUseCaseIR(uc)),
        detectedCount: serviceUCs.length,
        method: "service_method",
        warnings,
      };
    }

    return { useCases: [], detectedCount: 0, method: "none", warnings };
  }

  // ─── Détection switch/case dispatch ─────────────────────────────────────────

  private detectSwitchDispatch(files: JavaFile[]): DetectedUseCase[] {
    const results: DetectedUseCase[] = [];

    for (const file of files) {
      const content = file.content;
      // Chercher les switch sur un enum ou une string d'action
      const switchMatches = content.matchAll(/switch\s*\(\s*(\w+)\s*\)\s*\{/g);

      for (const sm of switchMatches) {
        const switchVar = sm[1];
        // Extraire les cases
        const switchStart = sm.index! + sm[0].length;
        const cases = this.extractCases(content, switchStart);

        if (cases.length < 1) continue; // Au moins 1 case pour être un dispatch

        const className = this.extractClassName(file);
        const packageName = this.extractPackage(content);
        const domain = this.inferDomain(file.path, className);

        for (const caseItem of cases) {
          // Chercher l'appel de service dans le case
          const serviceCall = this.extractServiceCall(caseItem.body);
          const voIn = serviceCall?.inputType || "Object";
          const voOut = serviceCall?.outputType || "Object";

          results.push({
            className: `${className}_${caseItem.name}`,
            methodName: this.camelCase(caseItem.name),
            voInType: voIn,
            voOutType: voOut,
            description: `${this.humanize(caseItem.name)} — dispatched from ${className}`,
            domain,
            sourceFile: file.path,
            rawSource: caseItem.body,
            parameters: serviceCall?.parameters || [],
            confidence: serviceCall ? "high" : "medium",
            detectionMethod: "switch_dispatch",
          });
        }
      }
    }

    return results;
  }

  // ─── Détection controller endpoints ─────────────────────────────────────────

  private detectControllerEndpoints(files: JavaFile[]): DetectedUseCase[] {
    const results: DetectedUseCase[] = [];

    for (const file of files) {
      const content = file.content;
      // Détecter les controllers (Spring MVC ou JAX-RS)
      const isController = /@(Rest)?Controller|@RequestMapping|@Path/.test(content);
      if (!isController) continue;

      const className = this.extractClassName(file);
      const packageName = this.extractPackage(content);
      const domain = this.inferDomain(file.path, className);

      // Extraire les méthodes annotées
      const methodRegex = /(?:@(Get|Post|Put|Delete|Patch)Mapping\s*(?:\([^)]*\))?\s*|@(GET|POST|PUT|DELETE)\s*\n\s*@Path\s*\([^)]*\)\s*)?public\s+([\w<>,\s\[\]]+?)\s+(\w+)\s*\(([^)]*)\)/g;
      let m;
      while ((m = methodRegex.exec(content)) !== null) {
        const httpMethod = m[1] || m[2] || "";
        const returnType = m[3].trim();
        const methodName = m[4];
        const paramsStr = m[5];

        // Skip lifecycle methods
        if (/^(init|destroy|afterPropertiesSet|toString|hashCode|equals)$/.test(methodName)) continue;
        // Skip getters/setters
        if (/^(get|set|is)[A-Z]/.test(methodName) && !paramsStr.trim()) continue;

        if (!httpMethod) continue; // Pas un endpoint

        const parameters = this.parseParameters(paramsStr);
        const voIn = parameters.length > 0 ? parameters[0].type : "Void";
        const voOut = returnType === "void" ? "Void" : returnType.replace(/ResponseEntity<(.+)>/, "$1");

        results.push({
          className: `${className}_${methodName}`,
          methodName,
          voInType: voIn,
          voOutType: voOut,
          description: `${httpMethod} ${methodName} — REST endpoint from ${className}`,
          domain,
          sourceFile: file.path,
          rawSource: content.substring(m.index!, Math.min(m.index! + 500, content.length)),
          parameters,
          confidence: "high",
          detectionMethod: "controller_endpoint",
        });
      }
    }

    return results;
  }

  // ─── Détection service methods ──────────────────────────────────────────────

  private detectServiceMethods(files: JavaFile[]): DetectedUseCase[] {
    const results: DetectedUseCase[] = [];

    // Identifier les fichiers service (interface ou impl)
    const serviceFiles = files.filter(f => {
      const name = f.path.split("/").pop() || "";
      return /Service(Impl)?\.java$/.test(name) && !/Test\.java$/.test(name);
    });

    // Préférer les interfaces aux implémentations
    const interfaces = serviceFiles.filter(f => {
      return f.content.includes("interface ") && !f.content.includes("class ");
    });
    const targetFiles = interfaces.length > 0 ? interfaces : serviceFiles;

    for (const file of targetFiles) {
      const content = file.content;
      const className = this.extractClassName(file);
      const domain = this.inferDomain(file.path, className);

      // Extraire les méthodes publiques non-triviales (interfaces: pas de 'public' explicite)
      const isInterface = content.includes("interface ") && !content.includes("class ");
      const methodRegex = isInterface
        ? /(?:\/\*\*([\s\S]*?)\*\/\s*)?([\w<>,\[\]]+)\s+(\w+)\s*\(([^)]*)\)\s*;/g
        : /(?:\/\*\*([\s\S]*?)\*\/\s*)?public\s+([\w<>,\s\[\]]+?)\s+(\w+)\s*\(([^)]*)\)/g;
      let m;
      while ((m = methodRegex.exec(content)) !== null) {
        const javadoc = m[1] || "";
        const returnType = m[2].trim();
        const methodName = m[3];
        const paramsStr = m[4];

        // Skip lifecycle/utility methods
        if (/^(init|destroy|toString|hashCode|equals|clone|finalize|getClass|notify|wait)$/.test(methodName)) continue;
        if (/^(get|set|is)[A-Z]/.test(methodName) && !paramsStr.trim()) continue;

        // Skip si c'est un type primitif simple retourné
        if (/^(void|int|long|boolean|double|float|byte|short|char)$/.test(returnType)) continue;

        const parameters = this.parseParameters(paramsStr);
        if (parameters.length === 0 && returnType === "void") continue;

        const voIn = parameters.length > 0 ? parameters[0].type : "Void";
        const voOut = returnType === "void" ? "Void" : returnType;

        results.push({
          className: `${className.replace(/Impl$/, "")}_${methodName}`,
          methodName,
          voInType: voIn,
          voOutType: voOut,
          description: javadoc.replace(/\s*\*\s*/g, " ").trim() || `${methodName} — from ${className}`,
          domain,
          sourceFile: file.path,
          rawSource: content,
          parameters,
          confidence: "medium",
          detectionMethod: "service_method",
        });
      }
    }

    return results;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private extractCases(content: string, startIndex: number): { name: string; body: string }[] {
    const cases: { name: string; body: string }[] = [];
    let depth = 1;
    let i = startIndex;

    // Find the end of the switch block
    while (i < content.length && depth > 0) {
      if (content[i] === "{") depth++;
      else if (content[i] === "}") depth--;
      i++;
    }
    const switchBody = content.substring(startIndex, i - 1);

    // Extract individual cases
    const caseRegex = /case\s+(\w+)\s*:/g;
    let m;
    const casePositions: { name: string; start: number }[] = [];
    while ((m = caseRegex.exec(switchBody)) !== null) {
      casePositions.push({ name: m[1], start: m.index + m[0].length });
    }

    for (let idx = 0; idx < casePositions.length; idx++) {
      const start = casePositions[idx].start;
      const end = idx + 1 < casePositions.length
        ? casePositions[idx + 1].start - casePositions[idx + 1].name.length - 6 // "case X:"
        : switchBody.length;
      const body = switchBody.substring(start, end).trim();
      cases.push({ name: casePositions[idx].name, body });
    }

    return cases;
  }

  private extractServiceCall(body: string): { inputType: string; outputType: string; parameters: { name: string; type: string }[] } | null {
    // PRIORITY 1: Pattern "Type varName = flux.getXxxIn();" (most specific — BOA EAI pattern)
    const fluxAssignMatch = body.match(/(\w[\w<>,]*)\s+(\w+)\s*=\s*flux\.get(\w+)\(\)/);
    if (fluxAssignMatch) {
      const inputType = fluxAssignMatch[1].trim();
      // Find the output: look for a DIFFERENT assignment that calls a service method
      const varName = fluxAssignMatch[2];
      const outRegex = new RegExp(`(\\w[\\w<>,]*)\\s+\\w+\\s*=\\s*\\w+\\.\\w+\\s*\\(\\s*${varName}`);
      const outMatch = body.match(outRegex);
      const outputType = outMatch ? outMatch[1].trim() : "Object";
      return {
        inputType,
        outputType,
        parameters: [{ name: varName, type: inputType }],
      };
    }

    // PRIORITY 2: Pattern "service.method(flux.getXxxIn())" (inline flux call)
    const fluxInlineMatch = body.match(/\w+\.\w+\s*\(\s*flux\.get(\w+)\(\)/);
    if (fluxInlineMatch) {
      const inputType = fluxInlineMatch[1]; // e.g., "TauxChangeIn"
      const outMatch = body.match(/(\w[\w<>,]*)\s+\w+\s*=\s*\w+\.\w+\s*\(/);
      const outputType = outMatch ? outMatch[1].trim() : "Object";
      return {
        inputType,
        outputType,
        parameters: [{ name: this.camelCase(inputType), type: inputType }],
      };
    }

    // PRIORITY 3: Generic "Type result = service.method(args)" (non-flux pattern)
    // Exclude flux.get* calls to avoid double-matching
    const callMatch = body.match(/(\w[\w<>,]*)\s+(\w+)\s*=\s*(\w+)\.(\w+)\s*\(([^)]*)\)/);
    if (callMatch && !callMatch[4].startsWith("get")) {
      const outputType = callMatch[1].trim();
      const serviceName = callMatch[3];
      const inputStr = callMatch[5].trim();
      if (inputStr) {
        // Find the type of the first argument variable
        const firstArg = inputStr.split(",")[0]?.trim();
        const argTypeMatch = body.match(new RegExp(`(\\w[\\w<>,]*)\\s+${firstArg}\\s*[=;]`));
        const inputType = argTypeMatch ? argTypeMatch[1].trim() : firstArg;
        return {
          outputType,
          inputType,
          parameters: [{ name: firstArg, type: inputType }],
        };
      }
      return {
        outputType,
        inputType: "Void",
        parameters: [],
      };
    }

    return null;
  }

  private extractClassName(file: JavaFile): string {
    if (file.className) return file.className;
    const match = file.content.match(/(?:public\s+)?(?:class|interface)\s+(\w+)/);
    return match ? match[1] : file.path.split("/").pop()?.replace(".java", "") || "Unknown";
  }

  private extractPackage(content: string): string {
    const match = content.match(/package\s+([\w.]+)\s*;/);
    return match ? match[1] : "";
  }

  private inferDomain(filePath: string, className: string): string {
    // Try to extract domain from package path
    const parts = filePath.split("/");
    const srcIdx = parts.indexOf("src");
    if (srcIdx >= 0 && parts.length > srcIdx + 4) {
      // e.g., src/main/java/ma/eai/boa/xbanking/service/transfert → "transfert"
      const packageParts = parts.slice(srcIdx + 3);
      const domainPart = packageParts.find(p => !["ma", "eai", "boa", "xbanking", "service", "controllers", "controller", "ws", "main", "java", "model", "dto", "vo", "util", "utils", "config"].includes(p));
      if (domainPart) return this.capitalize(domainPart);
    }
    // Fallback: extract from class name
    return className.replace(/Service(Impl)?$|Controller$|WS$|Bean$/, "") || "Core";
  }

  private parseParameters(paramsStr: string): { name: string; type: string }[] {
    if (!paramsStr.trim()) return [];
    return paramsStr
      .split(",")
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        // Remove annotations
        const cleaned = p.replace(/@\w+(?:\([^)]*\))?\s*/g, "").trim();
        const parts = cleaned.split(/\s+/);
        return { name: parts[parts.length - 1], type: parts.slice(0, -1).join(" ") };
      })
      .filter(p => p.type && p.name);
  }

  private toUseCaseIR(detected: DetectedUseCase): UseCaseIR {
    // v12.7: Extract field-level dependencies from source as injectedServices
    const injectedServices: { name: string; type: string }[] = [];
    const fieldRegex = /private\s+(?:final\s+)?(\w+)\s+(\w+)\s*[=;]/g;
    let fm;
    while ((fm = fieldRegex.exec(detected.rawSource)) !== null) {
      const type = fm[1];
      const name = fm[2];
      // Only include types that look like services/DAOs (UpperCamelCase, not primitives)
      if (/^[A-Z]/.test(type) && !/^(String|Integer|Long|Double|Boolean|Float|List|Map|Set|Date|BigDecimal)$/.test(type)) {
        injectedServices.push({ name, type });
      }
    }
    return {
      className: detected.className,
      packageName: this.extractPackage(detected.rawSource) || "com.legacy",
      domain: detected.domain,
      bianDomain: "",
      bianAction: "",
      voInType: detected.voInType,
      voOutType: detected.voOutType,
      useCaseDescription: detected.description,
      javadoc: "",
      injectedServices,
      transactional: null,
      exceptionsCaught: [],
      exceptionsThrown: [],
      sourceFile: detected.sourceFile,
      rawSource: detected.rawSource,
      httpMethod: this.inferHttpMethod(detected.methodName),
      restPath: this.generateRestPath(detected.domain, detected.methodName),
      methodParameters: detected.parameters,
    };
  }

  private inferHttpMethod(methodName: string): string {
    const lower = methodName.toLowerCase();
    if (/^(create|add|save|insert|enroll|register|upload|sign|generate)/.test(lower)) return "POST";
    if (/^(update|modify|edit|change|validate|activate)/.test(lower)) return "PUT";
    if (/^(delete|remove|suppr|cancel|revoke)/.test(lower)) return "DELETE";
    return "POST"; // Default for legacy operations
  }

  private generateRestPath(domain: string, methodName: string): string {
    const base = domain.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const action = methodName.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "");
    return `/api/${base}/${action}`;
  }

  private camelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private humanize(str: string): string {
    return str
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .trim()
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
}
