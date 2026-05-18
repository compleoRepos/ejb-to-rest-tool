/**
 * CrossModuleResolver — Resolves JNDI dependencies between workspace projects.
 *
 * When a new project is added to a workspace, this resolver:
 * 1. Extracts all JNDI lookups from the new project's IR
 * 2. Attempts to resolve them against existing workspace projects
 * 3. Checks if existing projects had unresolved lookups to this new project
 * 4. Persists results as CrossModuleLink records
 *
 * @author Compleo
 */

import type { ProjectIR, UseCaseIR } from "../java-parser";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ResolvedLink {
  jndiPath: string;
  sourceSessionId: string;
  sourceClass: string;
  targetSessionId: string;
  targetClass: string;
  targetServiceClass: string;
  status: "RESOLVED" | "NEWLY_RESOLVED";
}

export interface UnresolvedLink {
  jndiPath: string;
  sourceSessionId: string;
  sourceClass: string;
  targetModuleName: string;
  targetClass: string;
  status: "UNRESOLVED";
}

export interface ResolutionResult {
  resolved: ResolvedLink[];
  unresolved: UnresolvedLink[];
  newlyResolvedCount: number;
}

export interface WorkspaceProject {
  sessionId: string;
  projectName: string;
  artifactId: string;
  ir: ProjectIR;
}

export interface JndiLookup {
  path: string;
  sourceClass: string;
}

// ─── CrossModuleResolver ───────────────────────────────────────────────────

export class CrossModuleResolver {

  /**
   * Resolve JNDI links when a new project is added to a workspace.
   *
   * @param newSessionId - Session ID of the newly added project
   * @param newIR - Parsed IR of the new project
   * @param existingProjects - All other projects already in the workspace
   * @returns Resolution result with resolved and unresolved links
   */
  resolveLinks(
    newSessionId: string,
    newIR: ProjectIR,
    existingProjects: WorkspaceProject[]
  ): ResolutionResult {

    const resolved: ResolvedLink[] = [];
    const unresolved: UnresolvedLink[] = [];
    let newlyResolvedCount = 0;

    // 1. Extract all JNDI lookups from the new project
    const jndiLookups = this.extractJndiLookups(newIR);

    // 2. Try to resolve each lookup against existing projects
    for (const jndi of jndiLookups) {
      const { moduleName, className } = this.parseJndiPath(jndi.path);

      const found = existingProjects.find(p =>
        this.matchesModule(p.artifactId, moduleName)
      );

      if (found) {
        // Module is in the workspace — verify class exists
        const targetClass = found.ir.useCases.find(
          uc => uc.className === className
        );

        if (targetClass) {
          resolved.push({
            jndiPath: jndi.path,
            sourceSessionId: newSessionId,
            sourceClass: jndi.sourceClass,
            targetSessionId: found.sessionId,
            targetClass: className,
            targetServiceClass: className.replace(/UC$/, "Service"),
            status: "RESOLVED",
          });
        } else {
          // Module found but class not found — still unresolved
          unresolved.push({
            jndiPath: jndi.path,
            sourceSessionId: newSessionId,
            sourceClass: jndi.sourceClass,
            targetModuleName: moduleName,
            targetClass: className,
            status: "UNRESOLVED",
          });
        }
      } else {
        // Module not yet uploaded
        unresolved.push({
          jndiPath: jndi.path,
          sourceSessionId: newSessionId,
          sourceClass: jndi.sourceClass,
          targetModuleName: moduleName,
          targetClass: className,
          status: "UNRESOLVED",
        });
      }
    }

    // 3. Reverse resolution: check if existing projects called this new project
    for (const existing of existingProjects) {
      const existingJndi = this.extractJndiLookups(existing.ir);

      for (const jndi of existingJndi) {
        const { moduleName, className } = this.parseJndiPath(jndi.path);

        if (this.matchesModule(newIR.artifactId, moduleName)) {
          const targetClass = newIR.useCases.find(
            uc => uc.className === className
          );

          if (targetClass) {
            resolved.push({
              jndiPath: jndi.path,
              sourceSessionId: existing.sessionId,
              sourceClass: jndi.sourceClass,
              targetSessionId: newSessionId,
              targetClass: className,
              targetServiceClass: className.replace(/UC$/, "Service"),
              status: "NEWLY_RESOLVED",
            });
            newlyResolvedCount++;
          }
        }
      }
    }

    return { resolved, unresolved, newlyResolvedCount };
  }

  /**
   * Parse a JNDI path into module name and class name.
   *
   * Supports formats:
   *   "java:global/ejb-consultation/ConsulterSoldeUC"
   *   "java:global/ejb-consultation/ConsulterSoldeUC!com.example.ConsulterSoldeRemote"
   *   "java:app/ejb-consultation/ConsulterSoldeUC"
   */
  parseJndiPath(jndi: string): { moduleName: string; className: string } {
    // Remove java:global/, java:app/, java:module/ prefixes
    const cleaned = jndi
      .replace(/^java:(global|app|module)\//, "")
      .split("!")[0]; // Remove interface suffix if present

    const parts = cleaned.split("/");
    return {
      moduleName: parts[0] ?? "unknown",
      className: parts[parts.length - 1] ?? "unknown",
    };
  }

  /**
   * Extract all JNDI lookups from a project IR.
   *
   * Scans:
   * - @EJB(lookup = "...") annotations
   * - InitialContext.lookup("...") calls
   * - @EJB(name = "...") annotations
   * - Raw source files for JNDI patterns
   */
  extractJndiLookups(ir: ProjectIR): JndiLookup[] {
    const lookups: JndiLookup[] = [];
    const seen = new Set<string>();

    // Scan use cases
    for (const uc of ir.useCases) {
      const paths = this.extractJndiFromSource(uc.rawSource);
      for (const path of paths) {
        const key = `${uc.className}:${path}`;
        if (!seen.has(key)) {
          seen.add(key);
          lookups.push({ path, sourceClass: uc.className });
        }
      }
    }

    // Scan services
    for (const svc of ir.services) {
      // Services don't have rawSource in current IR, but check injected deps
      // that look like JNDI references
    }

    // Scan EJB 2.x beans
    for (const bean of ir.ejb2xBeans ?? []) {
      if (bean.rawSource) {
        const paths = this.extractJndiFromSource(bean.rawSource);
        for (const path of paths) {
          const key = `${bean.className}:${path}`;
          if (!seen.has(key)) {
            seen.add(key);
            lookups.push({ path, sourceClass: bean.className });
          }
        }
      }
    }

    // Scan raw files for any missed JNDI references
    for (const file of ir._rawFiles ?? []) {
      const paths = this.extractJndiFromSource(file.content);
      const fileName = file.path.split("/").pop()?.replace(".java", "") ?? "unknown";
      for (const path of paths) {
        const key = `${fileName}:${path}`;
        if (!seen.has(key)) {
          seen.add(key);
          lookups.push({ path, sourceClass: fileName });
        }
      }
    }

    return lookups;
  }

  /**
   * Extract JNDI paths from Java source code.
   */
  private extractJndiFromSource(source: string): string[] {
    if (!source) return [];

    const paths: string[] = [];

    // Pattern 1: @EJB(lookup = "java:global/...")
    const ejbLookupRegex = /@EJB\s*\(\s*(?:[^)]*\s*,\s*)?lookup\s*=\s*["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = ejbLookupRegex.exec(source)) !== null) {
      if (match[1]) paths.push(match[1]);
    }

    // Pattern 2: @EJB(name = "java:global/...")
    const ejbNameRegex = /@EJB\s*\(\s*(?:[^)]*\s*,\s*)?name\s*=\s*["']([^"']+)["']/g;
    while ((match = ejbNameRegex.exec(source)) !== null) {
      if (match[1] && match[1].startsWith("java:")) paths.push(match[1]);
    }

    // Pattern 3: InitialContext.lookup("java:global/...")
    const contextLookupRegex = /\.lookup\s*\(\s*["']([^"']+)["']\s*\)/g;
    while ((match = contextLookupRegex.exec(source)) !== null) {
      if (match[1] && match[1].startsWith("java:")) paths.push(match[1]);
    }

    // Pattern 4: @EJB with mappedName
    const mappedNameRegex = /@EJB\s*\(\s*(?:[^)]*\s*,\s*)?mappedName\s*=\s*["']([^"']+)["']/g;
    while ((match = mappedNameRegex.exec(source)) !== null) {
      if (match[1] && match[1].startsWith("java:")) paths.push(match[1]);
    }

    return [...new Set(paths)];
  }

  /**
   * Check if an artifactId matches a JNDI module name.
   * Handles partial matches like "bmce-virement-ejb" matching "ejb-virement".
   */
  private matchesModule(artifactId: string, moduleName: string): boolean {
    if (!artifactId || !moduleName) return false;

    const normArtifact = artifactId.toLowerCase();
    const normModule = moduleName.toLowerCase();

    // Exact match
    if (normArtifact === normModule) return true;

    // One contains the other
    if (normArtifact.includes(normModule) || normModule.includes(normArtifact)) return true;

    // Fuzzy: extract meaningful parts (remove common prefixes/suffixes)
    const cleanArtifact = normArtifact.replace(/^(ejb-|bmce-|boa-)/, "").replace(/(-ejb|-service|-impl)$/, "");
    const cleanModule = normModule.replace(/^(ejb-|bmce-|boa-)/, "").replace(/(-ejb|-service|-impl)$/, "");

    return cleanArtifact === cleanModule ||
           cleanArtifact.includes(cleanModule) ||
           cleanModule.includes(cleanArtifact);
  }
}
