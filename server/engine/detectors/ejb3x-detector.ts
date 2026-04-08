/**
 * Detecteur EJB 3.x (@Stateless, @Stateful, @Singleton, @MessageDriven sans JMS).
 * Tier 1 - Cible : Spring Service / Component.
 * Note: Les @MessageDriven JMS sont geres par le JmsDetector.
 */
import type {
  TechnologyDetector,
  DetectedComponent,
  DetectedMethod,
} from "../registry/types";

export class Ejb3xDetector implements TechnologyDetector {
  readonly technology = "EJB_3X_STATELESS" as const;
  readonly tier = 1 as const;
  readonly label = "EJB 3.x";

  canDetect(content: string, fileName: string): boolean {
    if (!fileName.endsWith(".java")) return false;
    // Exclure les EAI/BOA (geres par EaiDetector)
    if (/@UseCase/.test(content) || /extends\s+BaseUseCase/.test(content)) return false;
    // Exclure les MDB JMS (geres par JmsDetector)
    if (/@MessageDriven/.test(content) && /MessageListener/.test(content)) return false;

    return (
      /@Stateless/.test(content) ||
      /@Stateful/.test(content) ||
      /@Singleton/.test(content)
    );
  }

  detect(content: string, fileName: string): DetectedComponent[] {
    const classMatch = content.match(/(?:public\s+)?class\s+(\w+)/);
    if (!classMatch) return [];

    const className = classMatch[1];
    const packageMatch = content.match(/^package\s+([\w.]+);/m);
    const packageName = packageMatch ? packageMatch[1] : "";

    // Determiner le sous-type EJB 3.x
    let technology: "EJB_3X_STATELESS" | "EJB_3X_STATEFUL" | "EJB_3X_SINGLETON" = "EJB_3X_STATELESS";
    if (/@Stateful/.test(content)) technology = "EJB_3X_STATEFUL";
    if (/@Singleton/.test(content)) technology = "EJB_3X_SINGLETON";

    // Extraire les methodes publiques
    const methods: DetectedMethod[] = [];
    const methodRegex = /public\s+(\w[\w<>,\s]*?)\s+(\w+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = methodRegex.exec(content)) !== null) {
      const name = m[2];
      if (name === className) continue; // constructeur
      methods.push({
        name,
        returnType: m[1].trim(),
        params: this.parseParams(m[3]),
        annotations: this.extractMethodAnnotations(content, m.index),
      });
    }

    // Extraire les interfaces implementees
    const interfaceMatch = content.match(/implements\s+([\w,\s]+)/);
    const interfaces = interfaceMatch
      ? interfaceMatch[1].split(",").map((i) => i.trim()).filter((i) => i)
      : [];

    const component: DetectedComponent = {
      technology,
      className,
      packageName,
      filePath: fileName,
      confidence: this.computeConfidence(methods, interfaces),
      metadata: {
        sessionType: technology.replace("EJB_3X_", ""),
        businessMethods: methods,
        interfaces,
        transactional: /@TransactionAttribute/.test(content) || /@Transactional/.test(content),
      },
    };

    return [component];
  }

  getConfidence(component: DetectedComponent): number {
    return component.confidence;
  }

  private parseParams(raw: string): { name: string; type: string }[] {
    if (!raw.trim()) return [];
    return raw.split(",").map((p) => {
      const parts = p.trim().split(/\s+/);
      return {
        name: parts[parts.length - 1] || "arg",
        type: parts.slice(0, -1).join(" ") || "Object",
      };
    });
  }

  private extractMethodAnnotations(content: string, methodIndex: number): string[] {
    const preceding = content.substring(Math.max(0, methodIndex - 300), methodIndex);
    const annotations: string[] = [];
    const annRegex = /@(\w+)/g;
    let m;
    // Only look at the last few lines before the method
    const lastLines = preceding.split("\n").slice(-5).join("\n");
    while ((m = annRegex.exec(lastLines)) !== null) {
      if (!["Override", "SuppressWarnings", "Deprecated"].includes(m[1])) {
        annotations.push("@" + m[1]);
      }
    }
    return annotations;
  }

  private computeConfidence(methods: DetectedMethod[], interfaces: string[]): number {
    let score = 75;
    if (methods.length > 0) score += 10;
    if (interfaces.length > 0) score += 10;
    return Math.min(score, 95);
  }
}
