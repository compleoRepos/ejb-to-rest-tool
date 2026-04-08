/**
 * Detecteur JAX-RS (@Path, @GET, @POST, etc.).
 * Tier 2 - Cible : Spring REST Controller (migration legere).
 */
import type {
  TechnologyDetector,
  DetectedComponent,
  JaxRsComponent,
  DetectedMethod,
} from "../registry/types";

export class JaxRsDetector implements TechnologyDetector {
  readonly technology = "JAX_RS" as const;
  readonly tier = 2 as const;
  readonly label = "JAX-RS";

  canDetect(content: string, fileName: string): boolean {
    if (!fileName.endsWith(".java")) return false;
    return (
      /@Path\s*\(/.test(content) ||
      /import\s+javax\.ws\.rs/.test(content) ||
      /import\s+jakarta\.ws\.rs/.test(content)
    );
  }

  detect(content: string, fileName: string): DetectedComponent[] {
    const classMatch = content.match(/(?:public\s+)?class\s+(\w+)/);
    if (!classMatch) return [];

    const className = classMatch[1];
    const packageMatch = content.match(/^package\s+([\w.]+);/m);
    const packageName = packageMatch ? packageMatch[1] : "";

    // Extraire le basePath
    let basePath = "/";
    const pathMatch = content.match(/@Path\s*\(\s*"([^"]+)"\s*\)/);
    if (pathMatch) basePath = pathMatch[1];

    // Extraire les methodes
    const methods: DetectedMethod[] = [];
    const methodRegex = /(@(?:GET|POST|PUT|DELETE|PATCH)\s*\n?\s*(?:@Path\s*\(\s*"([^"]+)"\s*\)\s*\n?\s*)?)?public\s+(\w[\w<>,\s]*?)\s+(\w+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = methodRegex.exec(content)) !== null) {
      const verbMatch = m[1]?.match(/@(GET|POST|PUT|DELETE|PATCH)/);
      if (!verbMatch) continue;

      methods.push({
        name: m[4],
        returnType: m[3].trim(),
        params: this.parseParams(m[5]),
        httpVerb: verbMatch[1] as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
        urlPattern: m[2] || "",
        annotations: [verbMatch[0]],
      });
    }

    // Extraire @Produces / @Consumes
    const produces: string[] = [];
    const consumes: string[] = [];
    const producesMatch = content.match(/@Produces\s*\(\s*(?:\{([^}]+)\}|"([^"]+)")\s*\)/);
    if (producesMatch) {
      (producesMatch[1] || producesMatch[2]).split(",").forEach((p) => {
        produces.push(p.trim().replace(/"/g, ""));
      });
    }
    const consumesMatch = content.match(/@Consumes\s*\(\s*(?:\{([^}]+)\}|"([^"]+)")\s*\)/);
    if (consumesMatch) {
      (consumesMatch[1] || consumesMatch[2]).split(",").forEach((p) => {
        consumes.push(p.trim().replace(/"/g, ""));
      });
    }

    const component: JaxRsComponent = {
      technology: "JAX_RS",
      className,
      packageName,
      filePath: fileName,
      confidence: this.computeConfidence(methods),
      metadata: {
        basePath,
        methods,
        produces,
        consumes,
      },
    };

    return [component];
  }

  getConfidence(component: DetectedComponent): number {
    return component.confidence;
  }

  private parseParams(raw: string): { name: string; type: string; annotations?: string[] }[] {
    if (!raw.trim()) return [];
    return raw.split(",").map((p) => {
      const trimmed = p.trim();
      const annotations: string[] = [];
      const annMatch = trimmed.match(/@(\w+)\s*\(\s*"([^"]+)"\s*\)/g);
      if (annMatch) annotations.push(...annMatch);
      const parts = trimmed.replace(/@\w+\s*\([^)]*\)\s*/g, "").trim().split(/\s+/);
      return {
        name: parts[parts.length - 1] || "arg",
        type: parts.slice(0, -1).join(" ") || "Object",
        annotations: annotations.length > 0 ? annotations : undefined,
      };
    });
  }

  private computeConfidence(methods: DetectedMethod[]): number {
    let score = 75;
    if (methods.length > 0) score += 15;
    if (methods.length > 3) score += 10;
    return Math.min(score, 99);
  }
}
