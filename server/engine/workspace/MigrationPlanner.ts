/**
 * MigrationPlanner — Module 2 de COMPLEO v13.0 Workspace Mode.
 *
 * Trie topologiquement les projets du workspace, organise en tiers,
 * estime l'effort, et identifie les frameworks externes à migrer en priorité.
 *
 * Algorithme :
 * 1. Identifier les frameworks externes regroupables (>5 imports cumulés)
 * 2. Tier 0 = framework-stubs (migration prioritaire)
 * 3. Tier ≥1 = projets ordonnés par topological sort sur dependencyEdges
 * 4. Effort estimation : max(0.5, loc / 2000) jours
 * 5. canParallelize = true pour tous les items d'un même tier
 *
 * @author Compleo
 */

import type { WorkspaceGraph, ExternalDep } from './DependencyAnalyzer';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TierItem {
  type: 'project' | 'framework-stub';
  name: string;
  loc: number;
  fileCount: number;
  effortDays: number;
}

export interface Tier {
  level: number;
  label: string;
  items: TierItem[];
  rationale: string;
  canParallelize: boolean;
}

export interface FrameworkGroup {
  rootPackage: string;       // ex: "ma.eai.commons"
  totalImports: number;
  topClasses: string[];      // ex: ["Envelope", "Parser", "ParsingException"]
  recommendedTargetName: string; // ex: "nexa-commons"
  projectsUsing: number;
}

export interface MigrationPlan {
  tiers: Tier[];
  totalProjects: number;
  totalEstimatedEffortDays: number;
  externalFrameworks: FrameworkGroup[];
}

// ─── Implémentation ──────────────────────────────────────────────────────────

export class MigrationPlanner {

  /**
   * Génère un plan de migration ordonné en tiers à partir du graphe de dépendances.
   */
  plan(graph: WorkspaceGraph): MigrationPlan {
    // ─── 1. Identifier les frameworks externes regroupables ─────────────────
    const frameworkGroups = this.identifyFrameworkGroups(graph);

    // ─── 2. Tier 0 = framework stubs ───────────────────────────────────────
    const tier0: Tier = {
      level: 0,
      label: 'Foundations',
      items: frameworkGroups.map(fg => ({
        type: 'framework-stub' as const,
        name: fg.recommendedTargetName,
        loc: fg.topClasses.length * 50, // estimation ~50 LOC par stub
        fileCount: fg.topClasses.length,
        effortDays: Math.max(0.5, (fg.topClasses.length * 50) / 2000),
      })),
      rationale: 'Frameworks propriétaires à stubber/migrer en premier pour débloquer les projets business.',
      canParallelize: true,
    };

    // ─── 3. Tri topologique des projets ────────────────────────────────────
    const projectTiers = this.topologicalSort(graph);

    // ─── 4. Construire les tiers ≥1 ───────────────────────────────────────
    const tiers: Tier[] = [tier0];

    for (let i = 0; i < projectTiers.length; i++) {
      const tierProjects = projectTiers[i];
      const label = this.getTierLabel(i + 1, projectTiers.length);

      tiers.push({
        level: i + 1,
        label,
        items: tierProjects.map(projName => {
          const node = graph.projects.find(p => p.name === projName)!;
          return {
            type: 'project' as const,
            name: projName,
            loc: node.loc,
            fileCount: node.fileCount,
            effortDays: Math.max(0.5, Math.round((node.loc / 2000) * 10) / 10),
          };
        }),
        rationale: this.getTierRationale(i + 1, projectTiers.length, tierProjects.length),
        canParallelize: true, // Par définition du tri topologique
      });
    }

    // ─── 5. Calculer les totaux ───────────────────────────────────────────
    const totalEffort = tiers.reduce(
      (sum, tier) => sum + tier.items.reduce((s, item) => s + item.effortDays, 0),
      0
    );

    return {
      tiers,
      totalProjects: graph.projects.length,
      totalEstimatedEffortDays: Math.round(totalEffort * 10) / 10,
      externalFrameworks: frameworkGroups,
    };
  }

  /**
   * Génère un résumé textuel du plan de migration.
   */
  summarize(plan: MigrationPlan): string {
    const lines: string[] = [];
    lines.push(`# Plan de Migration — ${plan.totalProjects} projets`);
    lines.push(`**Effort total estimé :** ${plan.totalEstimatedEffortDays} jours-homme`);
    lines.push(`**Nombre de tiers :** ${plan.tiers.length}`);
    lines.push('');

    for (const tier of plan.tiers) {
      lines.push(`## Tier ${tier.level} — ${tier.label} (${tier.items.length} items)`);
      lines.push(`*${tier.rationale}*`);
      lines.push(`Parallélisable : ${tier.canParallelize ? 'Oui' : 'Non'}`);
      lines.push('');
      for (const item of tier.items) {
        const icon = item.type === 'framework-stub' ? '📦' : '🔧';
        lines.push(`- ${icon} **${item.name}** — ${item.loc} LOC, ${item.fileCount} fichiers, ~${item.effortDays}j`);
      }
      lines.push('');
    }

    if (plan.externalFrameworks.length > 0) {
      lines.push('## Frameworks Externes Détectés');
      for (const fw of plan.externalFrameworks) {
        lines.push(`- **${fw.rootPackage}** → ${fw.recommendedTargetName} (${fw.totalImports} imports, ${fw.projectsUsing} projets)`);
        lines.push(`  Classes clés : ${fw.topClasses.slice(0, 10).join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  // ─── Helpers privés ─────────────────────────────────────────────────────────

  /**
   * Identifie les frameworks externes en regroupant par préfixe commun.
   * Seuls les groupes avec >5 imports cumulés sont retenus.
   */
  private identifyFrameworkGroups(graph: WorkspaceGraph): FrameworkGroup[] {
    const frameworkMap = new Map<string, {
      imports: number;
      classes: Set<string>;
      projects: Set<string>;
    }>();

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

    return [...frameworkMap.entries()]
      .filter(([, v]) => v.imports >= 5)
      .map(([rootPackage, v]) => ({
        rootPackage,
        totalImports: v.imports,
        topClasses: [...v.classes].sort().slice(0, 20),
        recommendedTargetName: this.suggestTargetName(rootPackage),
        projectsUsing: v.projects.size,
      }))
      .sort((a, b) => b.totalImports - a.totalImports);
  }

  /**
   * Tri topologique des projets en niveaux (tiers).
   * Niveau N = projets qui dépendent uniquement de niveaux 0..N-1.
   * Si pas de dépendances inter-projets → tous au même tier.
   */
  private topologicalSort(graph: WorkspaceGraph): string[][] {
    const projectNames = new Set(graph.projects.map(p => p.name));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, Set<string>>();

    // Initialiser
    for (const name of projectNames) {
      inDegree.set(name, 0);
      adjacency.set(name, new Set());
    }

    // Construire le graphe (ne garder que les edges intra-workspace)
    for (const edge of graph.dependencyEdges) {
      if (projectNames.has(edge.from) && projectNames.has(edge.to)) {
        adjacency.get(edge.to)!.add(edge.from);
        inDegree.set(edge.from, (inDegree.get(edge.from) || 0) + 1);
      }
    }

    // BFS par niveaux (Kahn's algorithm)
    const levels: string[][] = [];
    const remaining = new Set(projectNames);

    while (remaining.size > 0) {
      // Trouver les nœuds sans dépendances non résolues
      const currentLevel: string[] = [];
      for (const name of remaining) {
        if ((inDegree.get(name) || 0) === 0) {
          currentLevel.push(name);
        }
      }

      // Si aucun nœud trouvé → cycle, forcer tous les restants dans le dernier tier
      if (currentLevel.length === 0) {
        levels.push([...remaining]);
        break;
      }

      // Retirer du graphe et décrémenter les in-degrees
      for (const name of currentLevel) {
        remaining.delete(name);
        for (const dependent of adjacency.get(name) || []) {
          if (remaining.has(dependent)) {
            inDegree.set(dependent, (inDegree.get(dependent) || 0) - 1);
          }
        }
      }

      levels.push(currentLevel.sort());
    }

    return levels;
  }

  /**
   * Suggère un nom de module Spring Boot de remplacement pour un framework legacy.
   */
  private suggestTargetName(rootPackage: string): string {
    const mappings: Record<string, string> = {
      'ma.eai.commons': 'nexa-commons',
      'ma.eai.ingdev': 'nexa-fwk',
      'ma.eai.midw': 'nexa-middleware',
      'ma.eai.boa': 'nexa-xbanking',
      'ma.eai.log': 'nexa-logging',
      'ma.eai.security': 'nexa-security',
    };

    // Chercher un mapping exact ou par préfixe
    for (const [prefix, target] of Object.entries(mappings)) {
      if (rootPackage.startsWith(prefix)) return target;
    }

    // Fallback : transformer le package en nom kebab-case
    const parts = rootPackage.split('.');
    const meaningful = parts.slice(Math.max(0, parts.length - 2));
    return meaningful.join('-') + '-spring';
  }

  private getTierLabel(level: number, totalLevels: number): string {
    if (totalLevels === 1) return 'Business Services';
    if (level === 1) return 'Domain Framework';
    if (level === totalLevels) return 'Business Services';
    return `Domain Layer ${level}`;
  }

  private getTierRationale(level: number, totalLevels: number, itemCount: number): string {
    if (totalLevels === 1) {
      return `${itemCount} projets business indépendants — migration parallélisable.`;
    }
    if (level === 1) {
      return `Projets fondamentaux sans dépendances inter-projets — à migrer en premier.`;
    }
    return `Projets dépendant des tiers précédents — migration après validation des fondations.`;
  }

  /**
   * Extrait le package racine (3 premiers segments).
   */
  private getRootPackage(pkg: string): string {
    const parts = pkg.split('.');
    if (parts.length <= 3) return pkg;
    return parts.slice(0, 3).join('.');
  }
}
