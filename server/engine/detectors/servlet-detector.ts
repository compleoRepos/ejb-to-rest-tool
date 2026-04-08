/**
 * Détecteur de Servlets (HttpServlet, @WebServlet, web.xml).
 * Tier 1 — Cible : Spring REST Controller.
 */
import type {
  TechnologyDetector,
  DetectedComponent,
  ServletComponent,
  DetectedMethod,
} from "../registry/types";

export class ServletDetector implements TechnologyDetector {
  readonly technology = "SERVLET" as const;
  readonly tier = 1 as const;
  readonly label = "Servlet";

  canDetect(content: string, fileName: string): boolean {
    if (!fileName.endsWith(".java")) return false;
    return (
      /extends\s+HttpServlet/.test(content) ||
      /@WebServlet/.test(content) ||
      /import\s+javax\.servlet\.http\.HttpServlet/.test(content) ||
      /import\s+jakarta\.servlet\.http\.HttpServlet/.test(content)
    );
  }

  detect(content: string, fileName: string, allFiles?: { path: string; content: string }[]): DetectedComponent[] {
    const classMatch = content.match(/(?:public\s+)?class\s+(\w+)\s+extends\s+HttpServlet/);
    if (!classMatch) return [];

    const className = classMatch[1];
    const packageMatch = content.match(/^package\s+([\w.]+);/m);
    const packageName = packageMatch ? packageMatch[1] : "";

    // Extraire les URL patterns
    const urlPatterns: string[] = [];
    const webServletMatch = content.match(/@WebServlet\s*\(\s*(?:urlPatterns\s*=\s*)?(?:\{([^}]+)\}|"([^"]+)")/);
    if (webServletMatch) {
      const raw = webServletMatch[1] || webServletMatch[2];
      raw.split(",").forEach((p) => {
        const trimmed = p.trim().replace(/"/g, "");
        if (trimmed) urlPatterns.push(trimmed);
      });
    }

    // Chercher dans web.xml si disponible
    if (urlPatterns.length === 0 && allFiles) {
      for (const f of allFiles) {
        if (f.path.endsWith("web.xml")) {
          const servletNameMatch = new RegExp(
            `<servlet-class>[^<]*${className}</servlet-class>[\\s\\S]*?<servlet-name>([^<]+)</servlet-name>`,
            "m"
          ).exec(f.content);
          if (servletNameMatch) {
            const sName = servletNameMatch[1].trim();
            const mappingRegex = new RegExp(
              `<servlet-name>${sName}</servlet-name>[\\s\\S]*?<url-pattern>([^<]+)</url-pattern>`,
              "g"
            );
            let m;
            while ((m = mappingRegex.exec(f.content)) !== null) {
              urlPatterns.push(m[1].trim());
            }
          }
          // Also try reverse order (servlet-name before servlet-class)
          const altMatch = new RegExp(
            `<servlet-name>([^<]+)</servlet-name>[\\s\\S]*?<servlet-class>[^<]*\\.${className}</servlet-class>`,
            "m"
          ).exec(f.content);
          if (altMatch && urlPatterns.length === 0) {
            const sName = altMatch[1].trim();
            const mappingRegex = new RegExp(
              `<servlet-name>${sName}</servlet-name>[\\s\\S]*?<url-pattern>([^<]+)</url-pattern>`,
              "g"
            );
            let m;
            while ((m = mappingRegex.exec(f.content)) !== null) {
              urlPatterns.push(m[1].trim());
            }
          }
        }
      }
    }

    // Extraire les méthodes doGet, doPost, doPut, doDelete
    const methods: DetectedMethod[] = [];
    const methodRegex = /protected\s+void\s+(doGet|doPost|doPut|doDelete)\s*\(/g;
    let mm;
    while ((mm = methodRegex.exec(content)) !== null) {
      const httpVerb = mm[1].replace("do", "").toUpperCase() as "GET" | "POST" | "PUT" | "DELETE";
      methods.push({
        name: mm[1],
        returnType: "void",
        params: [
          { name: "request", type: "HttpServletRequest" },
          { name: "response", type: "HttpServletResponse" },
        ],
        httpVerb,
        annotations: [],
      });
    }

    // Détecter les request.getParameter
    const requestParams: { name: string; type: string }[] = [];
    const paramRegex = /request\.getParameter\s*\(\s*"([^"]+)"\s*\)/g;
    let pm;
    while ((pm = paramRegex.exec(content)) !== null) {
      if (!requestParams.find((p) => p.name === pm[1])) {
        requestParams.push({ name: pm[1], type: "String" });
      }
    }

    const usesSession = /request\.getSession|HttpSession/.test(content);
    const usesForward = /RequestDispatcher|\.forward\(|\.include\(/.test(content);

    const source = /@WebServlet/.test(content)
      ? ("annotation" as const)
      : /extends\s+HttpServlet/.test(content)
        ? ("extends" as const)
        : ("web.xml" as const);

    const component: ServletComponent = {
      technology: "SERVLET",
      className,
      packageName,
      filePath: fileName,
      confidence: this.computeConfidence(methods, urlPatterns, requestParams),
      metadata: {
        servletName: className,
        urlPatterns,
        methods,
        usesSession,
        usesForward,
        requestParams,
        source,
      },
    };

    return [component];
  }

  getConfidence(component: DetectedComponent): number {
    return component.confidence;
  }

  private computeConfidence(
    methods: DetectedMethod[],
    urlPatterns: string[],
    requestParams: { name: string; type: string }[]
  ): number {
    let score = 60;
    if (methods.length > 0) score += 15;
    if (urlPatterns.length > 0) score += 15;
    if (requestParams.length > 0) score += 10;
    return Math.min(score, 99);
  }
}
