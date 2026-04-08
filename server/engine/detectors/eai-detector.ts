/**
 * Detecteur EAI/BOA custom (@UseCase, BaseUseCase, VoIn/VoOut).
 * Tier 1 - Cible : Spring REST Controller + Service.
 * Reutilise le parser existant java-parser.ts pour la compatibilite.
 */
import type {
  TechnologyDetector,
  DetectedComponent,
  EaiComponent,
} from "../registry/types";

export class EaiDetector implements TechnologyDetector {
  readonly technology = "EAI_CUSTOM" as const;
  readonly tier = 1 as const;
  readonly label = "EAI/BOA Custom";

  canDetect(content: string, fileName: string): boolean {
    if (!fileName.endsWith(".java")) return false;
    return (
      /@UseCase/.test(content) ||
      /extends\s+BaseUseCase/.test(content) ||
      /extends\s+AbstractUseCase/.test(content) ||
      (/VoIn\b/.test(content) && /VoOut\b/.test(content))
    );
  }

  detect(content: string, fileName: string, allFiles?: { path: string; content: string }[]): DetectedComponent[] {
    const classMatch = content.match(/(?:public\s+)?class\s+(\w+)/);
    if (!classMatch) return [];

    const className = classMatch[1];
    const packageMatch = content.match(/^package\s+([\w.]+);/m);
    const packageName = packageMatch ? packageMatch[1] : "";

    // Extraire VoIn/VoOut
    let voInType = "Void";
    let voOutType = "Void";

    // Pattern 1: cast (XxxVoIn) voIn
    const castInMatch = content.match(/\((\w+VoIn)\)\s*voIn/);
    if (castInMatch) voInType = castInMatch[1];

    // Pattern 2: new XxxVoOut()
    const newOutMatch = content.match(/new\s+(\w+VoOut)\s*\(/);
    if (newOutMatch) voOutType = newOutMatch[1];

    // Pattern 3: import explicite
    if (voInType === "Void") {
      const importIn = content.match(/import\s+[\w.]+\.(\w+VoIn)\s*;/);
      if (importIn) voInType = importIn[1];
    }
    if (voOutType === "Void") {
      const importOut = content.match(/import\s+[\w.]+\.(\w+VoOut)\s*;/);
      if (importOut) voOutType = importOut[1];
    }

    // Pattern 4: convention de nommage
    if (voInType === "Void" && allFiles) {
      const baseName = className.replace(/UC$/, "");
      for (const f of allFiles) {
        if (f.path.endsWith(baseName + "VoIn.java")) {
          voInType = baseName + "VoIn";
        }
        if (f.path.endsWith(baseName + "VoOut.java")) {
          voOutType = baseName + "VoOut";
        }
      }
    }

    // Extraire la description @UseCase
    let description: string | undefined;
    const descMatch = content.match(/@UseCase\s*\([^)]*description\s*=\s*"([^"]+)"/);
    if (descMatch) description = descMatch[1];

    // Extraire le domaine
    let domain = "unknown";
    if (packageName) {
      const parts = packageName.split(".");
      const idx = parts.indexOf("usecases") || parts.indexOf("usecase");
      if (idx > 0) domain = parts[idx - 1];
      else if (parts.length >= 3) domain = parts[parts.length - 2];
    }

    // Extraire les services injectes
    const injectedServices: string[] = [];
    const injectRegex = /@(?:Inject|EJB|Resource)\s+(?:private\s+)?(\w+)\s+(\w+)/g;
    let m;
    while ((m = injectRegex.exec(content)) !== null) {
      injectedServices.push(m[1]);
    }

    // Detecter @Transactional
    const transactional = /@Transactional/.test(content) || /@TransactionAttribute/.test(content);

    const component: EaiComponent = {
      technology: "EAI_CUSTOM",
      className,
      packageName,
      filePath: fileName,
      confidence: this.computeConfidence(voInType, voOutType, description),
      metadata: {
        useCaseName: className,
        voInType,
        voOutType,
        domain,
        description,
        injectedServices,
        transactional,
      },
    };

    return [component];
  }

  getConfidence(component: DetectedComponent): number {
    return component.confidence;
  }

  private computeConfidence(voIn: string, voOut: string, desc?: string): number {
    let score = 70;
    if (voIn !== "Void") score += 10;
    if (voOut !== "Void") score += 10;
    if (desc) score += 5;
    return Math.min(score, 95);
  }
}
