/**
 * MissingModuleAnalyzer v5.6.1 — Détection proactive des dépendances manquantes.
 * Analyse les appels JNDI cross-module et infère les contrats d'interface
 * AVANT que le module cible ne soit uploadé.
 *
 * Flux :
 *   1. Extraire tous les JNDI lookups du projet
 *   2. Filtrer ceux qui ne sont pas dans les modules existants
 *   3. Analyser les appels pour inférer le contrat (méthode, params, retour)
 *   4. Calculer la criticité (BLOCKING, HIGH, MEDIUM, LOW)
 *   5. Générer : Interface Java + Stub Spring Boot + Documentation
 *
 * @author Hamza NORDINE
 */

import type { ProjectIR, UseCaseIR } from "../java-parser";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InferredParam {
  name: string;
  type: string;
}

export interface InferredClass {
  className: string;
  inferredMethodName: string;
  inferredReturnType: string;
  inferredParams: InferredParam[];
  evidences: string[];
}

export interface CallerInfo {
  callerClass: string;
  callerMethod: string;
  callSiteCode: string;
  surroundingCode: string;
}

export interface GeneratedContract {
  interfaceCode: string;
  stubCode: string;
  dtoCode: string[];
  documentationMd: string;
}

export interface MissingModule {
  moduleName: string;
  jndiPath: string;
  inferredClasses: InferredClass[];
  inferredDomain: string;
  confidence: number;
  calledBy: CallerInfo[];
  criticalityLevel: "BLOCKING" | "HIGH" | "MEDIUM" | "LOW";
  generatedContract: GeneratedContract;
}

interface JndiLookup {
  path: string;
  sourceClass: string;
  sourceRawCode: string;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export class MissingModuleAnalyzer {

  /**
   * Analyse un projet IR et détecte les modules manquants.
   * @param ir - Le ProjectIR du projet analysé
   * @param existingModules - Les ProjectIR des modules déjà dans le workspace
   * @returns Liste des modules manquants avec contrats inférés
   */
  analyze(ir: ProjectIR, existingModules: ProjectIR[] = []): MissingModule[] {
    const missing: MissingModule[] = [];

    // 1. Extraire tous les JNDI lookups
    const allJndi = this.extractAllJndiLookups(ir);

    // 2. Grouper par module cible pour dédupliquer
    const byModule = new Map<string, JndiLookup[]>();
    for (const jndi of allJndi) {
      const parsed = this.parseJndi(jndi.path);
      if (!parsed.moduleName) continue;

      // Vérifier si le module est déjà présent
      const isPresent = existingModules.some(m =>
        this.moduleMatches(m.artifactId, parsed.moduleName) ||
        m.useCases.some(uc => uc.className === parsed.className)
      );

      if (!isPresent) {
        const key = parsed.moduleName;
        if (!byModule.has(key)) byModule.set(key, []);
        byModule.get(key)!.push(jndi);
      }
    }

    // 3. Pour chaque module manquant, analyser et générer le contrat
    for (const [moduleName, lookups] of byModule) {
      const inferredClasses: InferredClass[] = [];
      const allCallers: CallerInfo[] = [];

      for (const lookup of lookups) {
        const parsed = this.parseJndi(lookup.path);
        const callers = this.findCallers(ir, lookup.path, parsed.className);
        allCallers.push(...callers);

        const inferredClass = this.inferClassContract(
          parsed.className, callers, ir
        );
        inferredClasses.push(inferredClass);
      }

      const criticality = this.assessCriticality(allCallers, inferredClasses);
      const confidence = this.calculateConfidence(allCallers);
      const contract = this.generateContract(moduleName, inferredClasses, ir);

      missing.push({
        moduleName,
        jndiPath: lookups[0].path,
        inferredClasses,
        inferredDomain: this.inferDomain(inferredClasses[0]?.className ?? "", moduleName),
        confidence,
        calledBy: allCallers,
        criticalityLevel: criticality,
        generatedContract: contract,
      });
    }

    // Sort by criticality (BLOCKING first)
    const order: Record<string, number> = { BLOCKING: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    missing.sort((a, b) => (order[a.criticalityLevel] ?? 4) - (order[b.criticalityLevel] ?? 4));

    return missing;
  }

  // ─── JNDI Extraction ────────────────────────────────────────────────────

  extractAllJndiLookups(ir: ProjectIR): JndiLookup[] {
    const lookups: JndiLookup[] = [];
    const seen = new Set<string>();

    const sources: Array<{ className: string; rawSource: string }> = [
      ...ir.useCases.map(uc => ({ className: uc.className, rawSource: uc.rawSource ?? "" })),
      ...(ir.ejb2xBeans ?? []).map((b: any) => ({ className: b.className, rawSource: b.rawSource ?? "" })),
    ];

    for (const src of sources) {
      const code = src.rawSource;
      if (!code) continue;

      // Pattern 1: @EJB(lookup = "java:global/...")
      const ejbPattern = /@EJB\s*\(\s*(?:.*?,\s*)?lookup\s*=\s*"([^"]+)"/g;
      let match;
      while ((match = ejbPattern.exec(code)) !== null) {
        const path = match[1];
        const key = `${src.className}::${path}`;
        if (!seen.has(key)) {
          seen.add(key);
          lookups.push({ path, sourceClass: src.className, sourceRawCode: code });
        }
      }

      // Pattern 2: ctx.lookup("java:global/...")
      const ctxPattern = /\.lookup\s*\(\s*"([^"]+)"\s*\)/g;
      while ((match = ctxPattern.exec(code)) !== null) {
        const path = match[1];
        if (!path.startsWith("java:")) continue;
        const key = `${src.className}::${path}`;
        if (!seen.has(key)) {
          seen.add(key);
          lookups.push({ path, sourceClass: src.className, sourceRawCode: code });
        }
      }
    }

    return lookups;
  }

  // ─── JNDI Parsing ──────────────────────────────────────────────────────

  parseJndi(path: string): { moduleName: string; className: string } {
    // java:global/ejb-consultation/ConsulterSoldeUC!com.bank.ConsulterSoldeRemote
    const cleanPath = path.split("!")[0];
    const parts = cleanPath.replace(/^java:(global|app|module)\//, "").split("/");

    if (parts.length >= 2) {
      return { moduleName: parts[0], className: parts[parts.length - 1] };
    }
    if (parts.length === 1) {
      return { moduleName: "", className: parts[0] };
    }
    return { moduleName: "", className: "" };
  }

  // ─── Module Matching ───────────────────────────────────────────────────

  private moduleMatches(artifactId: string, moduleName: string): boolean {
    if (artifactId === moduleName) return true;
    const normalize = (s: string) => s.toLowerCase().replace(/[-_]/g, "");
    return normalize(artifactId) === normalize(moduleName) ||
      normalize(artifactId).includes(normalize(moduleName)) ||
      normalize(moduleName).includes(normalize(artifactId));
  }

  // ─── Caller Analysis ───────────────────────────────────────────────────

  findCallers(ir: ProjectIR, jndiPath: string, targetClassName: string): CallerInfo[] {
    const callers: CallerInfo[] = [];

    for (const uc of ir.useCases) {
      const code = uc.rawSource ?? "";
      if (code.includes(jndiPath) || code.includes(targetClassName)) {
        // Extract the method that contains the call
        const methodMatch = code.match(
          new RegExp(`(public|private|protected)\\s+\\w+\\s+(\\w+)\\s*\\([^)]*\\)[^{]*\\{[^}]*${targetClassName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^}]*\\}`, "s")
        );

        const callerMethod = methodMatch?.[2] ?? "execute";

        // Extract surrounding code context
        const lines = code.split("\n");
        const callLineIdx = lines.findIndex(l =>
          l.includes(jndiPath) || l.includes(targetClassName)
        );
        const start = Math.max(0, callLineIdx - 3);
        const end = Math.min(lines.length, callLineIdx + 4);
        const surroundingCode = lines.slice(start, end).join("\n");

        // Extract the call site line
        const callSiteLine = callLineIdx >= 0 ? lines[callLineIdx] : "";

        callers.push({
          callerClass: uc.className,
          callerMethod,
          callSiteCode: callSiteLine.trim(),
          surroundingCode,
        });
      }
    }

    return callers;
  }

  // ─── Contract Inference ─────────────────────────────────────────────────

  inferClassContract(
    className: string,
    callers: CallerInfo[],
    projectIR: ProjectIR
  ): InferredClass {
    const evidences: string[] = [];
    const params: InferredParam[] = [];
    let returnType = "Object";

    for (const caller of callers) {
      const callSite = caller.callSiteCode;

      // Pattern: result = xxxService.methode(param1, param2)
      const callMatch = callSite.match(/(\w+)\s*=\s*\w+\.\w+\s*\(([^)]*)\)/);
      if (callMatch) {
        returnType = this.inferTypeFromUsage(callMatch[1], caller.surroundingCode);
        evidences.push(`Retour utilisé comme : ${callMatch[1]}`);

        const args = callMatch[2].split(",").map(a => a.trim()).filter(Boolean);
        for (const arg of args) {
          const argType = this.inferTypeFromContext(arg, caller.surroundingCode, projectIR);
          params.push({ name: arg, type: argType });
          evidences.push(`Paramètre inféré : ${arg}: ${argType}`);
        }
      }

      // Pattern: if (xxxService.methode(param).contains("ACTIF"))
      const condMatch = callSite.match(/if\s*\(.*\.(\w+)\s*\(([^)]*)\)/);
      if (condMatch && !callMatch) {
        returnType = "String";
        evidences.push("Retour String inféré depuis .contains()");
      }

      // Pattern: @EJB lookup evidence
      if (callSite.includes("@EJB") || callSite.includes("lookup")) {
        evidences.push(`@EJB lookup dans ${caller.callerClass}`);
      }
    }

    // Infer method name from class name: ConsulterSoldeUC → consulterSolde()
    const methodName = className
      .replace(/UC$/, "")
      .replace(/^(.)/, c => c.toLowerCase());

    // Infer DTOs from existing project types
    const dtoNames = this.inferDtoNames(className, projectIR);

    return {
      className,
      inferredMethodName: methodName,
      inferredReturnType: dtoNames.response ?? returnType,
      inferredParams: params.length > 0
        ? params
        : [{ name: "request", type: dtoNames.request ?? "Object" }],
      evidences,
    };
  }

  // ─── Type Inference Helpers ─────────────────────────────────────────────

  private inferTypeFromUsage(varName: string, surroundingCode: string): string {
    // Check for type declaration: Type varName = ...
    const typeMatch = surroundingCode.match(
      new RegExp(`(\\w+(?:<[^>]+>)?)\\s+${varName}\\s*=`)
    );
    if (typeMatch) return typeMatch[1];

    // Common patterns
    if (varName.toLowerCase().includes("solde") || varName.toLowerCase().includes("amount")) return "BigDecimal";
    if (varName.toLowerCase().includes("status") || varName.toLowerCase().includes("statut")) return "String";
    if (varName.toLowerCase().includes("count") || varName.toLowerCase().includes("nombre")) return "int";
    if (varName.toLowerCase().includes("list") || varName.toLowerCase().includes("liste")) return "List<Object>";

    return "Object";
  }

  private inferTypeFromContext(argName: string, surroundingCode: string, ir: ProjectIR): string {
    // Check for type declaration in surrounding code
    const typeMatch = surroundingCode.match(
      new RegExp(`(\\w+(?:<[^>]+>)?)\\s+${argName}\\s*[=;,)]`)
    );
    if (typeMatch) return typeMatch[1];

    // Check if it matches a known DTO
    const matchingDto = ir.dtos.find(d =>
      d.className.toLowerCase().includes(argName.toLowerCase())
    );
    if (matchingDto) return matchingDto.className;

    // Common naming patterns
    if (argName.toLowerCase().includes("num") || argName.toLowerCase().includes("compte")) return "String";
    if (argName.toLowerCase().includes("montant") || argName.toLowerCase().includes("amount")) return "BigDecimal";
    if (argName.toLowerCase().includes("date")) return "LocalDate";
    if (argName.toLowerCase().includes("id")) return "Long";
    if (argName.toLowerCase().includes("cin") || argName.toLowerCase().includes("rib")) return "String";

    return "String";
  }

  private inferDtoNames(
    className: string,
    ir: ProjectIR
  ): { request?: string; response?: string } {
    const baseName = className.replace(/UC$/, "");

    const requestDto = ir.dtos.find(d =>
      d.className.includes(baseName) &&
      (d.className.includes("VoIn") || d.className.includes("Request"))
    );
    const responseDto = ir.dtos.find(d =>
      d.className.includes(baseName) &&
      (d.className.includes("VoOut") || d.className.includes("Response"))
    );

    return {
      request: requestDto?.className.replace("VoIn", "RequestDTO"),
      response: responseDto?.className.replace("VoOut", "ResponseDTO"),
    };
  }

  // ─── Domain Inference ───────────────────────────────────────────────────

  inferDomain(className: string, moduleName: string): string {
    const combined = `${className} ${moduleName}`.toLowerCase();

    const domains: Record<string, string[]> = {
      CONSULTATION: ["consulter", "consultation", "solde", "historique", "releve"],
      VIREMENT: ["virement", "transfer", "virer"],
      KYC: ["kyc", "verifier", "identite", "identity"],
      CREDIT: ["credit", "pret", "loan"],
      SCORING: ["scoring", "score", "notation"],
      AUDIT: ["audit", "trace", "log"],
      NOTIFICATION: ["notification", "notifier", "alert", "sms", "email"],
      PAIEMENT: ["paiement", "payment", "pay"],
      CARTE: ["carte", "card"],
      COMPTE: ["compte", "account"],
    };

    for (const [domain, keywords] of Object.entries(domains)) {
      if (keywords.some(k => combined.includes(k))) return domain;
    }

    // Fallback: extract from module name
    return moduleName
      .replace(/^ejb-/, "")
      .replace(/-ejb$/, "")
      .toUpperCase();
  }

  // ─── Criticality Assessment ─────────────────────────────────────────────

  assessCriticality(
    callers: CallerInfo[],
    inferredClasses: InferredClass[]
  ): "BLOCKING" | "HIGH" | "MEDIUM" | "LOW" {
    const callerCount = callers.length;
    const hasBlockingEvidence = callers.some(c =>
      c.callSiteCode.includes("throw") ||
      c.callSiteCode.includes("return") ||
      c.surroundingCode.includes("@Transactional")
    );

    if (hasBlockingEvidence && callerCount >= 2) return "BLOCKING";
    if (callerCount >= 3) return "HIGH";
    if (callerCount >= 2) return "MEDIUM";
    return "LOW";
  }

  // ─── Confidence Calculation ─────────────────────────────────────────────

  calculateConfidence(callers: CallerInfo[]): number {
    if (callers.length === 0) return 0.3;

    let score = 0.5; // Base confidence

    // More callers = more evidence
    score += Math.min(callers.length * 0.1, 0.3);

    // Detailed call sites increase confidence
    for (const caller of callers) {
      if (caller.callSiteCode.includes("=")) score += 0.05; // Assignment reveals return type
      if (caller.callSiteCode.includes("(") && caller.callSiteCode.includes(",")) score += 0.05; // Multiple params
    }

    return Math.min(score, 0.95);
  }

  // ─── Contract Generation ────────────────────────────────────────────────

  generateContract(
    moduleName: string,
    inferredClasses: InferredClass[],
    ir: ProjectIR
  ): GeneratedContract {
    const basePackage = ir.groupId?.replace(/\./g, "/") ? ir.groupId : "com.compleo.generated";
    const pkg = `${basePackage}.external`;

    const allInterfaces: string[] = [];
    const allStubs: string[] = [];
    const allDtos: string[] = [];
    let docMd = `# Dépendances externes : ${moduleName}\n\n`;
    docMd += `**Statut** : Non uploadé — Contrats inférés automatiquement\n\n`;

    for (const cls of inferredClasses) {
      const serviceName = cls.className.replace(/UC$/, "Service");

      // Interface Java
      const interfaceCode = [
        `package ${pkg};`,
        ``,
        `/**`,
        ` * Interface du service ${serviceName}.`,
        ` * Contrat inféré automatiquement par Compleo depuis les usages.`,
        ` *`,
        ` * Module source attendu : ${moduleName}`,
        ` *`,
        ` * Ce contrat est une INFERENCE basee sur les appels detectes.`,
        ` * Il sera REMPLACE automatiquement quand ${moduleName}`,
        ` * sera uploade dans ce workspace.`,
        ` *`,
        ` * Preuves d'inference :`,
        ...cls.evidences.map(e => ` * - ${e}`),
        ` */`,
        `public interface ${serviceName} {`,
        ``,
        `    /**`,
        `     * ${cls.inferredMethodName}`,
        `     * Infere depuis les appels dans le projet courant.`,
        `     */`,
        `    ${cls.inferredReturnType} ${cls.inferredMethodName}(`,
        `        ${cls.inferredParams.map(p => `${p.type} ${p.name}`).join(",\n        ")}`,
        `    );`,
        `}`,
      ].join("\n");

      allInterfaces.push(interfaceCode);

      // Stub Spring Boot
      const camelServiceName = serviceName.charAt(0).toLowerCase() + serviceName.slice(1);
      const stubCode = [
        `package ${pkg}.stub;`,
        ``,
        `import ${pkg}.${serviceName};`,
        `import lombok.extern.slf4j.Slf4j;`,
        `import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;`,
        `import org.springframework.context.annotation.Primary;`,
        `import org.springframework.stereotype.Service;`,
        ``,
        `/**`,
        ` * STUB — ${serviceName}`,
        ` *`,
        ` * Ce stub sera REMPLACE automatiquement quand le module`,
        ` * "${moduleName}" sera uploade et migre vers Spring Boot.`,
        ` *`,
        ` * Pour implementer manuellement :`,
        ` *   1. Creer une classe qui implemente ${serviceName}`,
        ` *   2. Annoter avec @Service @Primary`,
        ` *   3. Appeler votre systeme de core banking`,
        ` *`,
        ` * @see ${serviceName} pour le contrat complet`,
        ` */`,
        `@Slf4j`,
        `@Service`,
        `@Primary`,
        `@ConditionalOnMissingBean(name = "${camelServiceName}Real")`,
        `public class ${serviceName}Stub implements ${serviceName} {`,
        ``,
        `    @Override`,
        `    public ${cls.inferredReturnType} ${cls.inferredMethodName}(`,
        `        ${cls.inferredParams.map(p => `${p.type} ${p.name}`).join(",\n        ")}`,
        `    ) {`,
        `        log.warn(`,
        `            "STUB ${serviceName}.${cls.inferredMethodName}() appele. " +`,
        `            "Uploader le module ${moduleName} dans Compleo pour " +`,
        `            "remplacer ce stub par une implementation reelle."`,
        `        );`,
        ``,
        `        // TODO: Remplacer par l'appel au module ${moduleName}`,
        `        throw new UnsupportedOperationException(`,
        `            "${serviceName} non disponible. " +`,
        `            "Module ${moduleName} non encore migre."`,
        `        );`,
        `    }`,
        `}`,
      ].join("\n");

      allStubs.push(stubCode);

      // Documentation section
      docMd += `## ${serviceName}\n\n`;
      docMd += `### Contrat infere\n\n`;
      docMd += "```java\n";
      docMd += `${cls.inferredReturnType} ${cls.inferredMethodName}(\n`;
      docMd += `    ${cls.inferredParams.map(p => `${p.type} ${p.name}`).join(", ")}\n`;
      docMd += ")\n```\n\n";
      docMd += `### Preuves d'inference\n\n`;
      docMd += cls.evidences.map(e => `- ${e}`).join("\n") + "\n\n";
    }

    return {
      interfaceCode: allInterfaces.join("\n\n"),
      stubCode: allStubs.join("\n\n"),
      dtoCode: allDtos,
      documentationMd: docMd,
    };
  }
}
