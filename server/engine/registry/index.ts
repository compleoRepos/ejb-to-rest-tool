/**
 * TechnologyRegistry — Registre central des détecteurs et générateurs.
 * Pattern Registry + Strategy : ajouter une technologie = enregistrer 1 detector + 1 generator.
 * @author Compleo
 */

import type {
  TechnologyType,
  TechnologyDetector,
  CodeGenerator,
  DetectedComponent,
  GeneratedFile,
  ValidationResult,
  MigrationNote,
} from "./types";

export class TechnologyRegistry {
  private detectors: Map<TechnologyType, TechnologyDetector> = new Map();
  private generators: Map<TechnologyType, CodeGenerator> = new Map();

  registerDetector(detector: TechnologyDetector): void {
    this.detectors.set(detector.technology, detector);
  }

  registerGenerator(generator: CodeGenerator): void {
    this.generators.set(generator.technology, generator);
  }

  getDetector(tech: TechnologyType): TechnologyDetector | undefined {
    return this.detectors.get(tech);
  }

  getGenerator(tech: TechnologyType): CodeGenerator | undefined {
    return this.generators.get(tech);
  }

  getAllDetectors(): TechnologyDetector[] {
    return Array.from(this.detectors.values());
  }

  getAllGenerators(): CodeGenerator[] {
    return Array.from(this.generators.values());
  }

  getRegisteredTechnologies(): TechnologyType[] {
    return Array.from(this.detectors.keys());
  }

  /**
   * Analyse un ensemble de fichiers avec tous les détecteurs enregistrés.
   */
  detectAll(files: { path: string; content: string }[]): DetectedComponent[] {
    const allComponents: DetectedComponent[] = [];

    for (const file of files) {
      for (const detector of this.detectors.values()) {
        if (detector.canDetect(file.content, file.path)) {
          const components = detector.detect(file.content, file.path, files);
          allComponents.push(...components);
        }
      }
    }

    return this.deduplicateComponents(allComponents);
  }

  /**
   * Génère le code Spring Boot pour tous les composants détectés.
   */
  generateAll(components: DetectedComponent[], basePackage: string): GeneratedFile[] {
    const allFiles: GeneratedFile[] = [];

    for (const component of components) {
      const generator = this.generators.get(component.technology);
      if (generator && generator.canGenerate(component)) {
        const files = generator.generate(component, components, basePackage);
        allFiles.push(...files);
      }
    }

    return this.deduplicateFiles(allFiles);
  }

  /**
   * Valide tous les fichiers générés.
   */
  validateAll(files: GeneratedFile[]): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    const warnings: string[] = [];

    // Validation par technologie
    const byTech = this.groupByTechnology(files);
    for (const [tech, techFiles] of byTech) {
      const generator = this.generators.get(tech);
      if (generator) {
        const result = generator.validate(techFiles);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }
    }

    // Validations globales
    this.validateNoDuplicateImports(files, warnings);
    this.validateNoObjectType(files, warnings);
    this.validateBalancedBraces(files, errors);

    return {
      valid: errors.filter((e) => e.severity === "error").length === 0,
      errors,
      warnings,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private deduplicateComponents(components: DetectedComponent[]): DetectedComponent[] {
    const seen = new Map<string, DetectedComponent>();
    for (const c of components) {
      const key = `${c.technology}:${c.className}:${c.filePath}`;
      const existing = seen.get(key);
      if (!existing || c.confidence > existing.confidence) {
        seen.set(key, c);
      }
    }
    return Array.from(seen.values());
  }

  private deduplicateFiles(files: GeneratedFile[]): GeneratedFile[] {
    const seen = new Map<string, GeneratedFile>();
    for (const f of files) {
      if (!seen.has(f.path)) {
        seen.set(f.path, f);
      }
    }
    return Array.from(seen.values());
  }

  private groupByTechnology(files: GeneratedFile[]): Map<TechnologyType, GeneratedFile[]> {
    const map = new Map<TechnologyType, GeneratedFile[]>();
    for (const f of files) {
      const list = map.get(f.technology) || [];
      list.push(f);
      map.set(f.technology, list);
    }
    return map;
  }

  private validateNoDuplicateImports(files: GeneratedFile[], warnings: string[]): void {
    for (const file of files) {
      const imports = file.content.match(/^import .+;$/gm) || [];
      const unique = new Set(imports);
      if (imports.length !== unique.size) {
        warnings.push(`Imports dupliqués dans ${file.path}`);
      }
    }
  }

  private validateNoObjectType(files: GeneratedFile[], warnings: string[]): void {
    for (const file of files) {
      if (file.category === "migration_note" || file.category === "infrastructure") continue;
      const objectMatches = file.content.match(/\bObject\b/g);
      if (objectMatches && objectMatches.length > 0) {
        // Exclure les faux positifs (ObjectMapper, ObjectFactory, etc.)
        const realObjects = file.content.match(/(?<![A-Za-z])Object(?![A-Za-z])/g) || [];
        const falsePositives = file.content.match(/Object(?:Mapper|Factory|Message|Input|Output|Stream)/g) || [];
        if (realObjects.length > falsePositives.length) {
          warnings.push(`Type "Object" détecté dans ${file.path} — vérifier la résolution de types`);
        }
      }
    }
  }

  private validateBalancedBraces(files: GeneratedFile[], errors: ValidationResult["errors"]): void {
    for (const file of files) {
      if (!file.path.endsWith(".java")) continue;
      let depth = 0;
      for (const ch of file.content) {
        if (ch === "{") depth++;
        if (ch === "}") depth--;
        if (depth < 0) break;
      }
      if (depth !== 0) {
        errors.push({
          file: file.path,
          message: `Accolades non équilibrées (delta: ${depth})`,
          severity: "error",
        });
      }
    }
  }
}

// Singleton global
export const registry = new TechnologyRegistry();
