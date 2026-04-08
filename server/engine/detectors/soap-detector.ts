/**
 * Detecteur SOAP / JAX-WS (@WebService, @WebMethod).
 * Tier 1 - Cible : Spring REST Controller.
 */
import type {
  TechnologyDetector,
  DetectedComponent,
  SoapComponent,
  DetectedMethod,
} from "../registry/types";

export class SoapDetector implements TechnologyDetector {
  readonly technology = "SOAP" as const;
  readonly tier = 1 as const;
  readonly label = "SOAP/JAX-WS";

  canDetect(content: string, fileName: string): boolean {
    if (!fileName.endsWith(".java")) return false;
    return (
      /@WebService/.test(content) ||
      /@WebMethod/.test(content) ||
      /import\s+javax\.jws\.WebService/.test(content) ||
      /import\s+jakarta\.jws\.WebService/.test(content)
    );
  }

  detect(content: string, fileName: string): DetectedComponent[] {
    const classMatch = content.match(/(?:public\s+)?class\s+(\w+)/);
    if (!classMatch) return [];

    const className = classMatch[1];
    const packageMatch = content.match(/^package\s+([\w.]+);/m);
    const packageName = packageMatch ? packageMatch[1] : "";

    // Extraire serviceName et targetNamespace
    let serviceName = className;
    let targetNamespace: string | undefined;
    const wsMatch = content.match(/@WebService\s*\(([^)]*)\)/s);
    if (wsMatch) {
      const snMatch = wsMatch[1].match(/serviceName\s*=\s*"([^"]+)"/);
      if (snMatch) serviceName = snMatch[1];
      const nsMatch = wsMatch[1].match(/targetNamespace\s*=\s*"([^"]+)"/);
      if (nsMatch) targetNamespace = nsMatch[1];
    }

    // Extraire les operations @WebMethod
    const operations: DetectedMethod[] = [];
    const methodRegex = /(?:@WebMethod\s*(?:\([^)]*\))?\s*)?public\s+(\w[\w<>,\s]*?)\s+(\w+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = methodRegex.exec(content)) !== null) {
      const name = m[2];
      // Ignorer les constructeurs et methodes de cycle de vie
      if (name === className || name.startsWith("set") || name.startsWith("get")) continue;

      // Verifier si c'est une @WebMethod ou si la classe est @WebService (toutes les methodes publiques)
      const lineStart = content.lastIndexOf("\n", m.index);
      const precedingLines = content.substring(Math.max(0, lineStart - 200), m.index);
      const isWebMethod = /@WebMethod/.test(precedingLines) || /@WebService/.test(content);

      if (!isWebMethod) continue;

      // Extraire operationName
      const opNameMatch = precedingLines.match(/@WebMethod\s*\(\s*operationName\s*=\s*"([^"]+)"/);

      operations.push({
        name: opNameMatch ? opNameMatch[1] : name,
        returnType: m[1].trim(),
        params: this.parseParams(m[3]),
        httpVerb: this.inferHttpVerb(name, m[1].trim()),
        annotations: ["@WebMethod"],
        javadoc: this.extractJavadoc(content, m.index),
      });
    }

    const component: SoapComponent = {
      technology: "SOAP",
      className,
      packageName,
      filePath: fileName,
      confidence: this.computeConfidence(operations),
      metadata: {
        serviceName,
        targetNamespace,
        operations,
        wsdlPresent: false,
        migrationNote: `Service SOAP "${serviceName}" avec ${operations.length} operation(s) a convertir en REST.`,
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
      const annMatch = trimmed.match(/@WebParam\s*\(\s*name\s*=\s*"([^"]+)"\s*\)/);
      if (annMatch) annotations.push(`@WebParam("${annMatch[1]}")`);
      const parts = trimmed.replace(/@\w+\s*\([^)]*\)\s*/g, "").trim().split(/\s+/);
      return {
        name: parts[parts.length - 1] || "arg",
        type: parts.slice(0, -1).join(" ") || "Object",
        annotations: annotations.length > 0 ? annotations : undefined,
      };
    });
  }

  private inferHttpVerb(name: string, returnType: string): "GET" | "POST" | "PUT" | "DELETE" {
    const lower = name.toLowerCase();
    if (lower.startsWith("consulter") || lower.startsWith("get") || lower.startsWith("find") || lower.startsWith("list") || lower.startsWith("releve")) return "GET";
    if (lower.startsWith("supprimer") || lower.startsWith("delete") || lower.startsWith("remove")) return "DELETE";
    if (lower.startsWith("modifier") || lower.startsWith("update") || lower.startsWith("maj")) return "PUT";
    return "POST";
  }

  private extractJavadoc(content: string, methodIndex: number): string | undefined {
    const before = content.substring(Math.max(0, methodIndex - 500), methodIndex);
    const javadocMatch = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
    if (!javadocMatch) return undefined;
    return javadocMatch[1]
      .split("\n")
      .map((l) => l.replace(/^\s*\*\s?/, "").trim())
      .filter((l) => l && !l.startsWith("@"))
      .join(" ")
      .trim();
  }

  private computeConfidence(operations: DetectedMethod[]): number {
    let score = 70;
    if (operations.length > 0) score += 15;
    if (operations.length > 3) score += 10;
    return Math.min(score, 99);
  }
}
