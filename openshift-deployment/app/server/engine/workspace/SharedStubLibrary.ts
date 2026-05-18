/**
 * SharedStubLibrary — Module 3 de COMPLEO v13.0 Workspace Mode.
 *
 * Au lieu de générer des stubs par-projet, agrège le signal d'usage sur TOUS
 * les projets du workspace, puis produit UN ensemble de stubs cohérents qui
 * forment une bibliothèque Java déployable (module Maven).
 *
 * Caractéristique clé : une classe comme `Envelope` utilisée dans 18/19 projets
 * a sa signature agrégée combinant les méthodes appelées dans les 18 projets
 * → stub beaucoup plus riche et précis qu'un stub local.
 * Et le stub est UNIQUE (pas régénéré pour chaque projet → pas de non-déterminisme).
 *
 * @author Compleo
 */

import type { WorkspaceGraph, Workspace } from './DependencyAnalyzer';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ClassUsageData {
  fqcn: string;                    // fully qualified class name
  methodCalls: Map<string, MethodSignature>;  // methodName → inferred signature
  fieldAccesses: Set<string>;      // field names accessed
  constructorArgs: string[];       // constructor argument patterns
  implementsOrExtends: string[];   // if used as superclass/interface
  usedInProjects: Set<string>;     // project names that use this class
  isInterface: boolean;            // inferred from usage patterns
  isAbstract: boolean;             // inferred from usage patterns
}

export interface MethodSignature {
  name: string;
  returnType: string;
  paramTypes: string[];
  isStatic: boolean;
  throwsTypes: string[];
  callCount: number;               // nombre total d'appels cross-projet
}

export interface SharedStubBundle {
  stubFiles: Map<string, string>;   // path → Java source
  pomXml: string;                   // pom.xml du module Maven
  moduleName: string;               // ex: "bmce-framework-stubs"
  version: string;                  // ex: "1.0.0-transitional"
  classCount: number;
}

// ─── Implémentation ──────────────────────────────────────────────────────────

export class SharedStubLibrary {

  /**
   * Génère la bibliothèque de stubs partagée pour les packages externes.
   */
  generate(
    graph: WorkspaceGraph,
    workspace: Workspace,
    externalPackagesToStub: string[],
    moduleName: string = 'workspace-framework-stubs'
  ): SharedStubBundle {
    const stubFiles = new Map<string, string>();
    let classCount = 0;

    // ─── 1. Collecter TOUS les usages cross-projet par classe externe ─────
    const classUsages = new Map<string, ClassUsageData>();

    for (const pkg of externalPackagesToStub) {
      // Trouver toutes les classes de ce package utilisées dans le workspace
      const classesInPkg = new Set<string>();
      for (const [, deps] of graph.externalDependencies) {
        for (const dep of deps) {
          // Matcher par préfixe (ex: "ma.eai.commons" matche "ma.eai.commons.services.parsing")
          if (dep.package === pkg || dep.package.startsWith(pkg + '.')) {
            dep.classes.forEach(c => classesInPkg.add(`${dep.package}.${c}`));
          }
        }
      }

      // Pour chaque classe : scanner TOUS les fichiers du workspace pour collecter les usages
      for (const fqcn of classesInPkg) {
        const usage = this.collectCrossProjectUsage(fqcn, workspace);
        if (usage.methodCalls.size > 0 || usage.fieldAccesses.size > 0 || usage.usedInProjects.size > 0) {
          classUsages.set(fqcn, usage);
        }
      }
    }

    // ─── 2. Générer les stubs ─────────────────────────────────────────────
    for (const [fqcn, usage] of classUsages) {
      const dotIdx = fqcn.lastIndexOf('.');
      const pkg = fqcn.substring(0, dotIdx);
      const className = fqcn.substring(dotIdx + 1);

      const javaSource = this.renderAggregatedStub(pkg, className, usage);
      const path = `src/main/java/${pkg.replace(/\./g, '/')}/${className}.java`;
      stubFiles.set(path, javaSource);
      classCount++;
    }

    // ─── 3. pom.xml du module ─────────────────────────────────────────────
    const pomXml = this.renderPom(moduleName, classCount);
    stubFiles.set('pom.xml', pomXml);

    return {
      stubFiles,
      pomXml,
      moduleName,
      version: '1.0.0-transitional',
      classCount,
    };
  }

  /**
   * Collecte les usages d'une classe à travers TOUS les projets du workspace.
   */
  private collectCrossProjectUsage(fqcn: string, workspace: Workspace): ClassUsageData {
    const dotIdx = fqcn.lastIndexOf('.');
    const className = fqcn.substring(dotIdx + 1);

    const usage: ClassUsageData = {
      fqcn,
      methodCalls: new Map(),
      fieldAccesses: new Set(),
      constructorArgs: [],
      implementsOrExtends: [],
      usedInProjects: new Set(),
      isInterface: false,
      isAbstract: false,
    };

    for (const [projectName, files] of workspace) {
      for (const [, content] of files) {
        if (!content.includes(className)) continue;

        // Vérifier que le fichier importe bien cette classe
        const importPattern = new RegExp(`import\\s+(?:static\\s+)?${fqcn.replace(/\./g, '\\.')}\\s*;`);
        if (!importPattern.test(content)) continue;

        usage.usedInProjects.add(projectName);

        // Détecter les appels de méthodes : variable.method(args) ou ClassName.method(args)
        this.extractMethodCalls(content, className, usage);

        // Détecter les accès aux champs
        this.extractFieldAccesses(content, className, usage);

        // Détecter les constructeurs : new ClassName(args)
        this.extractConstructors(content, className, usage);

        // Détecter extends/implements
        this.extractInheritance(content, className, usage);
      }
    }

    return usage;
  }

  private extractMethodCalls(content: string, className: string, usage: ClassUsageData): void {
    // Pattern: identifier.methodName(args) — on cherche les méthodes après un point
    // Aussi: ClassName.staticMethod(args)
    const methodRegex = new RegExp(
      `(?:${className}|\\w+)\\s*\\.\\s*(\\w+)\\s*\\(([^)]*)\\)`,
      'g'
    );

    let m: RegExpExecArray | null;
    while ((m = methodRegex.exec(content)) !== null) {
      const methodName = m[1];
      const argsStr = m[2].trim();

      // Ignorer les méthodes Java standard
      if (['equals', 'hashCode', 'toString', 'getClass', 'notify', 'wait'].includes(methodName)) continue;

      const paramCount = argsStr ? argsStr.split(',').length : 0;
      const paramTypes = this.inferParamTypes(argsStr);
      const returnType = this.inferReturnType(content, m.index, methodName);
      const isStatic = content.substring(Math.max(0, m.index - 50), m.index).includes(className + '.');

      const existing = usage.methodCalls.get(methodName);
      if (existing) {
        existing.callCount++;
        // Garder la signature avec le plus de paramètres (plus informative)
        if (paramTypes.length > existing.paramTypes.length) {
          existing.paramTypes = paramTypes;
        }
      } else {
        usage.methodCalls.set(methodName, {
          name: methodName,
          returnType,
          paramTypes,
          isStatic,
          throwsTypes: [],
          callCount: 1,
        });
      }
    }
  }

  private extractFieldAccesses(content: string, className: string, usage: ClassUsageData): void {
    // Pattern: identifier.FIELD_NAME (all caps = constant)
    const fieldRegex = new RegExp(`(?:${className}|\\w+)\\.([A-Z][A-Z_0-9]+)(?![\\w(])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = fieldRegex.exec(content)) !== null) {
      usage.fieldAccesses.add(m[1]);
    }
  }

  private extractConstructors(content: string, className: string, usage: ClassUsageData): void {
    const ctorRegex = new RegExp(`new\\s+${className}\\s*\\(([^)]*)\\)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = ctorRegex.exec(content)) !== null) {
      const args = m[1].trim();
      if (args && !usage.constructorArgs.includes(args)) {
        usage.constructorArgs.push(args);
      }
    }
  }

  private extractInheritance(content: string, className: string, usage: ClassUsageData): void {
    if (new RegExp(`extends\\s+${className}`).test(content)) {
      usage.isAbstract = true;
    }
    if (new RegExp(`implements\\s+[\\w,\\s]*${className}`).test(content)) {
      usage.isInterface = true;
    }
  }

  /**
   * Infère les types de paramètres à partir de la string d'arguments.
   */
  private inferParamTypes(argsStr: string): string[] {
    if (!argsStr) return [];
    const args = argsStr.split(',').map(a => a.trim());
    return args.map(arg => {
      if (/^"/.test(arg)) return 'String';
      if (/^\d+L?$/.test(arg)) return 'long';
      if (/^\d+\.\d+/.test(arg)) return 'double';
      if (/^\d+$/.test(arg)) return 'int';
      if (/^(true|false)$/.test(arg)) return 'boolean';
      if (/^null$/.test(arg)) return 'Object';
      if (/^new\s+(\w+)/.test(arg)) {
        const match = arg.match(/^new\s+(\w+)/);
        return match ? match[1] : 'Object';
      }
      return 'Object';
    });
  }

  /**
   * Infère le type de retour d'une méthode à partir du contexte d'utilisation.
   */
  private inferReturnType(content: string, callIndex: number, methodName: string): string {
    // Chercher une assignation : Type var = xxx.method(...)
    const before = content.substring(Math.max(0, callIndex - 200), callIndex);
    const assignMatch = before.match(/(\w+(?:<[\w,\s<>]+>)?)\s+\w+\s*=\s*$/);
    if (assignMatch) return assignMatch[1];

    // Chercher un cast : (Type) xxx.method(...)
    const castMatch = before.match(/\((\w+(?:<[\w,\s<>]+>)?)\)\s*$/);
    if (castMatch) return castMatch[1];

    // Heuristiques basées sur le nom
    if (/^(get|find|fetch|load|read|retrieve)/.test(methodName)) return 'Object';
    if (/^(is|has|can|should)/.test(methodName)) return 'boolean';
    if (/^(set|put|add|remove|delete|update|save|write|send|notify)/.test(methodName)) return 'void';
    if (/^(count|size|length|indexOf)/.test(methodName)) return 'int';
    if (/^(toString|getName|getPath|getValue)/.test(methodName)) return 'String';

    return 'Object';
  }

  /**
   * Génère le code Java d'un stub agrégé.
   */
  private renderAggregatedStub(pkg: string, className: string, usage: ClassUsageData): string {
    const lines: string[] = [];

    // Package
    lines.push(`package ${pkg};`);
    lines.push('');

    // Imports nécessaires
    const imports = new Set<string>();
    imports.add('java.util.*');
    imports.add('java.io.*');
    for (const [, method] of usage.methodCalls) {
      for (const pt of method.paramTypes) {
        if (pt === 'List' || pt === 'Map' || pt === 'Set') imports.add('java.util.*');
      }
    }
    for (const imp of imports) {
      lines.push(`import ${imp};`);
    }
    lines.push('');

    // Javadoc
    lines.push('/**');
    lines.push(` * Stub transitoire pour ${className}.`);
    lines.push(` * Généré par COMPLEO v13.0 SharedStubLibrary.`);
    lines.push(` * Agrège les usages de ${usage.usedInProjects.size} projets.`);
    lines.push(` * Méthodes détectées : ${usage.methodCalls.size}`);
    lines.push(' */');

    // Déclaration de classe
    const classType = usage.isInterface ? 'interface' : (usage.isAbstract ? 'abstract class' : 'class');
    lines.push(`public ${classType} ${className} {`);
    lines.push('');

    // Constantes (champs statiques)
    for (const field of usage.fieldAccesses) {
      lines.push(`    public static final String ${field} = "${field}";`);
    }
    if (usage.fieldAccesses.size > 0) lines.push('');

    // Constructeur(s)
    if (!usage.isInterface) {
      // Constructeur par défaut
      lines.push(`    public ${className}() { }`);

      // Constructeur avec args si détecté
      if (usage.constructorArgs.length > 0) {
        const maxArgs = usage.constructorArgs.reduce(
          (max, args) => Math.max(max, args.split(',').length), 0
        );
        if (maxArgs > 0) {
          const params = Array.from({ length: maxArgs }, (_, i) => `Object arg${i}`).join(', ');
          lines.push(`    public ${className}(${params}) { }`);
        }
      }
      lines.push('');
    }

    // Méthodes (triées par nombre d'appels décroissant)
    const sortedMethods = [...usage.methodCalls.values()]
      .sort((a, b) => b.callCount - a.callCount);

    for (const method of sortedMethods) {
      const staticMod = method.isStatic ? 'static ' : '';
      const params = method.paramTypes
        .map((t, i) => `${t} arg${i}`)
        .join(', ');

      const throwsClause = method.throwsTypes.length > 0
        ? ` throws ${method.throwsTypes.join(', ')}`
        : '';

      if (usage.isInterface) {
        lines.push(`    ${method.returnType} ${method.name}(${params})${throwsClause};`);
      } else {
        const returnStatement = this.getDefaultReturn(method.returnType);
        lines.push(`    public ${staticMod}${method.returnType} ${method.name}(${params})${throwsClause} {`);
        lines.push(`        ${returnStatement}`);
        lines.push('    }');
      }
      lines.push('');
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Génère le pom.xml du module Maven de stubs.
   */
  private renderPom(moduleName: string, classCount: number): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.compleo.stubs</groupId>
    <artifactId>${moduleName}</artifactId>
    <version>1.0.0-transitional</version>
    <packaging>jar</packaging>

    <name>${moduleName}</name>
    <description>
        Bibliothèque de stubs transitoires générée par COMPLEO v13.0 SharedStubLibrary.
        Contient ${classCount} classes stub agrégées depuis l'analyse cross-projet du workspace.
        Ces stubs permettent la compilation des projets pendant la phase de migration.
    </description>

    <properties>
        <maven.compiler.source>11</maven.compiler.source>
        <maven.compiler.target>11</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
                <configuration>
                    <source>11</source>
                    <target>11</target>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>`;
  }

  private getDefaultReturn(returnType: string): string {
    switch (returnType) {
      case 'void': return '// stub';
      case 'boolean': return 'return false;';
      case 'int': return 'return 0;';
      case 'long': return 'return 0L;';
      case 'double': return 'return 0.0;';
      case 'float': return 'return 0.0f;';
      case 'String': return 'return "";';
      default: return 'return null;';
    }
  }
}
