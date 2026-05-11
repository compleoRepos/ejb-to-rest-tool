/**
 * DependencyAnalyzer — Module 1 de COMPLEO v13.0 Workspace Mode.
 *
 * Scanne un workspace (N projets), construit le DAG de dépendances inter-projets :
 * - Identifie les packages déclarés par chaque projet (ownership)
 * - Catégorise les imports en interne (cross-projet) vs externe (framework)
 * - Construit les edges du graphe (A → B si A importe un package owned par B)
 *
 * @author Compleo
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Workspace = Map<projectName, Map<filePath, fileContent>> */
export type Workspace = Map<string, Map<string, string>>;

export interface ProjectNode {
  name: string;
  packagesProvided: string[];   // packages déclarés dans ce projet
  packagesImported: string[];   // packages importés (internes ou externes)
  fileCount: number;
  loc: number;
}

export interface ExternalDep {
  package: string;        // ex: ma.eai.commons.services.parsing
  importCount: number;
  classes: string[];      // ex: ['Envelope', 'Parser', 'ParsingException']
}

export interface DependencyEdge {
  from: string;
  to: string;
  via: string[];          // packages qui créent la dépendance
}

export interface WorkspaceGraph {
  projects: ProjectNode[];
  internalPackageOwnership: Map<string, string>;   // package → projet propriétaire
  externalDependencies: Map<string, ExternalDep[]>; // par projet
  dependencyEdges: DependencyEdge[];
}

// ─── Implémentation ──────────────────────────────────────────────────────────

export class DependencyAnalyzer {

  /**
   * Analyse un workspace complet et retourne le graphe de dépendances.
   */
  analyze(workspace: Workspace): WorkspaceGraph {
    const projects: ProjectNode[] = [];
    const packageOwnership = new Map<string, string>();
    const externalDeps = new Map<string, Map<string, Set<string>>>();
    // projectName → (packageName → Set<className>)

    // ─── Étape 1 : Identifier les packages déclarés par chaque projet ─────────
    for (const [projectName, files] of workspace) {
      const provided = new Set<string>();
      let loc = 0;
      let fileCount = 0;

      for (const [path, content] of files) {
        if (!path.endsWith('.java')) continue;
        fileCount++;
        loc += content.split('\n').length;

        const pkgMatch = content.match(/^\s*package\s+([\w.]+)\s*;/m);
        if (pkgMatch) {
          provided.add(pkgMatch[1]);
          // Premier projet à déclarer ce package en est le propriétaire
          if (!packageOwnership.has(pkgMatch[1])) {
            packageOwnership.set(pkgMatch[1], projectName);
          }
        }
      }

      projects.push({
        name: projectName,
        packagesProvided: [...provided],
        packagesImported: [],
        fileCount,
        loc,
      });
    }

    // ─── Étape 2 : Extraire imports et catégoriser interne/externe ─────────────
    for (const [projectName, files] of workspace) {
      const importedPackages = new Set<string>();
      const projectExtDeps = new Map<string, Set<string>>();

      for (const [, content] of files) {
        const importRegex = /^\s*import\s+(?:static\s+)?([\w.]+)\s*;/gm;
        let m: RegExpExecArray | null;
        while ((m = importRegex.exec(content)) !== null) {
          const fqcn = m[1];
          const dotIdx = fqcn.lastIndexOf('.');
          if (dotIdx === -1) continue;
          const pkg = fqcn.substring(0, dotIdx);
          const className = fqcn.substring(dotIdx + 1);

          // Ignorer les packages Java standard
          if (this.isJavaStandard(pkg)) continue;
          // Ignorer les packages Spring/Jakarta bien connus
          if (this.isWellKnownFramework(pkg)) continue;

          importedPackages.add(pkg);

          // Externe : pas owned par un projet du workspace
          if (!packageOwnership.has(pkg)) {
            if (!projectExtDeps.has(pkg)) projectExtDeps.set(pkg, new Set());
            projectExtDeps.get(pkg)!.add(className);
          }
        }
      }

      // Mettre à jour le ProjectNode
      const node = projects.find(p => p.name === projectName)!;
      if (node) {
        node.packagesImported = [...importedPackages];
      }

      // Stocker les dépendances externes
      externalDeps.set(projectName, projectExtDeps);
    }

    // ─── Étape 3 : Construire les edges (A → B si A importe un package owned par B) ──
    const edges: DependencyEdge[] = [];
    for (const node of projects) {
      const targets = new Map<string, string[]>();
      for (const imp of node.packagesImported) {
        const owner = packageOwnership.get(imp);
        if (owner && owner !== node.name) {
          if (!targets.has(owner)) targets.set(owner, []);
          targets.get(owner)!.push(imp);
        }
      }
      for (const [to, via] of targets) {
        edges.push({ from: node.name, to, via });
      }
    }

    // ─── Formater externalDeps en sortie attendue ─────────────────────────────
    const formattedExt = new Map<string, ExternalDep[]>();
    for (const [proj, depsMap] of externalDeps) {
      const list: ExternalDep[] = [];
      for (const [pkg, classes] of depsMap) {
        list.push({
          package: pkg,
          importCount: classes.size,
          classes: [...classes].sort(),
        });
      }
      formattedExt.set(proj, list.sort((a, b) => b.importCount - a.importCount));
    }

    return {
      projects,
      internalPackageOwnership: packageOwnership,
      externalDependencies: formattedExt,
      dependencyEdges: edges,
    };
  }

  /**
   * Retourne les packages racines externes les plus utilisés dans le workspace.
   * Utile pour identifier les frameworks à stubber en priorité.
   */
  getTopExternalFrameworks(graph: WorkspaceGraph, minImports: number = 5): {
    rootPackage: string;
    totalImports: number;
    topClasses: string[];
    projectsUsing: number;
  }[] {
    // Agréger par préfixe racine (2-3 segments)
    const frameworkMap = new Map<string, { imports: number; classes: Set<string>; projects: Set<string> }>();

    for (const [projectName, deps] of graph.externalDependencies) {
      for (const dep of deps) {
        const root = this.getRootPackage(dep.package);
        if (!frameworkMap.has(root)) {
          frameworkMap.set(root, { imports: 0, classes: new Set(), projects: new Set() });
        }
        const entry = frameworkMap.get(root)!;
        entry.imports += dep.importCount;
        dep.classes.forEach(c => entry.classes.add(c));
        entry.projects.add(projectName);
      }
    }

    // Filtrer et trier
    return [...frameworkMap.entries()]
      .filter(([, v]) => v.imports >= minImports)
      .map(([rootPackage, v]) => ({
        rootPackage,
        totalImports: v.imports,
        topClasses: [...v.classes].sort().slice(0, 20),
        projectsUsing: v.projects.size,
      }))
      .sort((a, b) => b.totalImports - a.totalImports);
  }

  /**
   * Génère un diagramme Mermaid du DAG de dépendances.
   */
  toMermaidDiagram(graph: WorkspaceGraph): string {
    const lines: string[] = ['graph TD'];

    // Nœuds projets
    for (const p of graph.projects) {
      const label = `${p.name}\\n(${p.fileCount} files, ${p.loc} LOC)`;
      lines.push(`  ${this.sanitizeId(p.name)}["${label}"]`);
    }

    // Edges
    for (const edge of graph.dependencyEdges) {
      const label = edge.via.length <= 2
        ? edge.via.join(', ')
        : `${edge.via.length} packages`;
      lines.push(`  ${this.sanitizeId(edge.from)} -->|"${label}"| ${this.sanitizeId(edge.to)}`);
    }

    return lines.join('\n');
  }

  // ─── Helpers privés ─────────────────────────────────────────────────────────

  private isJavaStandard(pkg: string): boolean {
    return /^(java|javax|jakarta|sun|com\.sun|jdk)\./.test(pkg);
  }

  private isWellKnownFramework(pkg: string): boolean {
    return /^(org\.springframework|org\.hibernate|org\.apache|org\.slf4j|org\.junit|org\.mockito|com\.fasterxml|io\.swagger|lombok)\./.test(pkg);
  }

  /**
   * Extrait le package racine (3 premiers segments) pour regrouper les frameworks.
   * Ex: "ma.eai.commons.services.parsing" → "ma.eai.commons"
   */
  private getRootPackage(pkg: string): string {
    const parts = pkg.split('.');
    // Heuristique : garder 3 segments pour les packages courts, 3 pour les longs
    if (parts.length <= 3) return pkg;
    return parts.slice(0, 3).join('.');
  }

  private sanitizeId(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '_');
  }
}
