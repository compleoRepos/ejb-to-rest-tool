/**
 * Detecteur Java Batch (ItemReader, ItemProcessor, ItemWriter, JSR-352).
 * Tier 1 - Cible : Spring Batch.
 */
import type {
  TechnologyDetector,
  DetectedComponent,
  BatchComponent,
} from "../registry/types";

export class BatchDetector implements TechnologyDetector {
  readonly technology = "BATCH" as const;
  readonly tier = 1 as const;
  readonly label = "Java Batch";

  canDetect(content: string, fileName: string): boolean {
    if (!fileName.endsWith(".java")) return false;
    return (
      /implements\s+(?:ItemReader|ItemProcessor|ItemWriter)/.test(content) ||
      /import\s+javax\.batch/.test(content) ||
      /import\s+jakarta\.batch/.test(content) ||
      /@BatchProperty/.test(content)
    );
  }

  detect(content: string, fileName: string): DetectedComponent[] {
    const classMatch = content.match(/(?:public\s+)?class\s+(\w+)/);
    if (!classMatch) return [];

    const className = classMatch[1];
    const packageMatch = content.match(/^package\s+([\w.]+);/m);
    const packageName = packageMatch ? packageMatch[1] : "";

    // Determiner le role
    let role: "READER" | "PROCESSOR" | "WRITER" | "JOB_CONFIG" = "JOB_CONFIG";
    if (/implements\s+ItemReader/.test(content)) role = "READER";
    else if (/implements\s+ItemProcessor/.test(content)) role = "PROCESSOR";
    else if (/implements\s+ItemWriter/.test(content)) role = "WRITER";

    // Extraire les types d'items
    let itemType: string | undefined;
    let outputType: string | undefined;

    if (role === "READER") {
      const readMatch = content.match(/public\s+(\w+)\s+readItem/);
      if (readMatch) itemType = readMatch[1];
    }
    if (role === "PROCESSOR") {
      const processMatch = content.match(/public\s+(\w+)\s+processItem/);
      if (processMatch) outputType = processMatch[1];
      // Input type from the cast
      const castMatch = content.match(/\((\w+)\)\s*item/);
      if (castMatch) itemType = castMatch[1];
    }
    if (role === "WRITER") {
      const writeMatch = content.match(/\((\w+)\)\s*item/);
      if (writeMatch) itemType = writeMatch[1];
    }

    // Extraire les @BatchProperty
    const batchProperties: { name: string; type: string }[] = [];
    const propRegex = /@BatchProperty\s*(?:\(\s*name\s*=\s*"([^"]+)"\s*\))?\s*private\s+(\w+)\s+(\w+)/g;
    let m;
    while ((m = propRegex.exec(content)) !== null) {
      batchProperties.push({
        name: m[1] || m[3],
        type: m[2],
      });
    }

    const component: BatchComponent = {
      technology: "BATCH",
      className,
      packageName,
      filePath: fileName,
      confidence: this.computeConfidence(role, batchProperties),
      metadata: {
        role,
        itemType,
        outputType,
        batchProperties,
        steps: [],
      },
    };

    return [component];
  }

  getConfidence(component: DetectedComponent): number {
    return component.confidence;
  }

  private computeConfidence(role: string, props: unknown[]): number {
    let score = 70;
    if (role !== "JOB_CONFIG") score += 15;
    if (props.length > 0) score += 10;
    return Math.min(score, 95);
  }
}
