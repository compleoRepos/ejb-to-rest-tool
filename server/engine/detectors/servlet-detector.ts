/**
 * Détecteur de Servlets (HttpServlet, @WebServlet, web.xml).
 * Tier 1 — Cible : Spring REST Controller.
 *
 * v5.10.0: Multi-route detection — analyse les if/switch sur
 * getServletPath()/getPathInfo() pour extraire les sous-routes.
 *
 * @author Compleo
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
      const methodBody = this.extractMethodBody(content, mm.index);

      // Detect sub-routes within the method body
      const subRoutes = this.detectSubRoutes(methodBody, httpVerb);

      if (subRoutes.length > 0) {
        // Multi-route: create one DetectedMethod per sub-route
        for (const route of subRoutes) {
          methods.push({
            name: route.handlerName,
            returnType: "void",
            params: [
              { name: "request", type: "HttpServletRequest" },
              { name: "response", type: "HttpServletResponse" },
            ],
            httpVerb,
            urlPattern: route.urlPattern,
            annotations: [],
          });
        }
      } else {
        // Single route (no branching detected)
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
    }

    // Détecter les request.getParameter (per-route if possible)
    const requestParams: { name: string; type: string }[] = [];
    const paramRegex = /request\.getParameter\s*\(\s*"([^"]+)"\s*\)/g;
    let pm: RegExpExecArray | null;
    while ((pm = paramRegex.exec(content)) !== null) {
      const paramName = pm[1];
      if (!requestParams.find((p) => p.name === paramName)) {
        requestParams.push({ name: paramName, type: "String" });
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

  // ─── Multi-route detection ────────────────────────────────────────────

  /**
   * Extraire le corps d'une méthode à partir de sa position dans le source.
   */
  private extractMethodBody(content: string, startIndex: number): string {
    // Find the opening brace
    let braceStart = content.indexOf("{", startIndex);
    if (braceStart === -1) return "";

    let depth = 0;
    let i = braceStart;
    for (; i < content.length; i++) {
      if (content[i] === "{") depth++;
      else if (content[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    return content.substring(braceStart, i + 1);
  }

  /**
   * Détecter les sous-routes dans le corps d'une méthode doXxx.
   * Patterns supportés :
   *   - if (path.equals("/xxx")) { ... }
   *   - if ("/xxx".equals(path)) { ... }
   *   - if (path.contains("/xxx")) { ... }
   *   - if (path.startsWith("/xxx")) { ... }
   *   - switch (path) { case "/xxx": ... }
   *   - if (action.equals("xxx")) { ... }  (request.getParameter("action"))
   */
  private detectSubRoutes(methodBody: string, httpVerb: string): SubRoute[] {
    const routes: SubRoute[] = [];
    const seen = new Set<string>();

    // Pattern 1a: method call — getServletPath().equals("/xxx")
    const ifMethodCallRegex = /(?:getServletPath|getPathInfo)\s*\(\s*\)\s*\.\s*(?:equals|contains|startsWith|endsWith)\s*\(\s*"([^"]+)"\s*\)/g;
    let m;
    while ((m = ifMethodCallRegex.exec(methodBody)) !== null) {
      const urlPattern = m[1].startsWith("/") ? m[1] : "/" + m[1];
      if (!seen.has(urlPattern)) {
        seen.add(urlPattern);
        routes.push({
          urlPattern,
          handlerName: this.routeToHandlerName(urlPattern, httpVerb),
        });
      }
    }

    // Pattern 1b: local variable — path.equals("/xxx"), uri.equals("/xxx")
    const ifPathRegex = /(?:path|servletPath|pathInfo|uri)\s*\.\s*(?:equals|contains|startsWith|endsWith)\s*\(\s*"([^"]+)"\s*\)/g;
    while ((m = ifPathRegex.exec(methodBody)) !== null) {
      const urlPattern = m[1].startsWith("/") ? m[1] : "/" + m[1];
      if (!seen.has(urlPattern)) {
        seen.add(urlPattern);
        routes.push({
          urlPattern,
          handlerName: this.routeToHandlerName(urlPattern, httpVerb),
        });
      }
    }

    // Pattern 2: "xxx".equals(path) or "/xxx".equals(getServletPath())
    const reverseEqualsRegex = /"([^"]+)"\s*\.\s*equals\s*\(\s*(?:path|servletPath|pathInfo|request\s*\.\s*(?:getServletPath|getPathInfo)\s*\(\s*\))\s*\)/g;
    while ((m = reverseEqualsRegex.exec(methodBody)) !== null) {
      const urlPattern = m[1].startsWith("/") ? m[1] : "/" + m[1];
      if (!seen.has(urlPattern)) {
        seen.add(urlPattern);
        routes.push({
          urlPattern,
          handlerName: this.routeToHandlerName(urlPattern, httpVerb),
        });
      }
    }

    // Pattern 3: switch/case with string literals
    const caseRegex = /case\s+"([^"]+)"\s*:/g;
    while ((m = caseRegex.exec(methodBody)) !== null) {
      const urlPattern = m[1].startsWith("/") ? m[1] : "/" + m[1];
      if (!seen.has(urlPattern)) {
        seen.add(urlPattern);
        routes.push({
          urlPattern,
          handlerName: this.routeToHandlerName(urlPattern, httpVerb),
        });
      }
    }

    // Pattern 4: action parameter branching
    // if (action.equals("xxx")) or if ("xxx".equals(action))
    const actionRegex = /(?:action|command|operation)\s*\.\s*equals\s*\(\s*"([^"]+)"\s*\)|"([^"]+)"\s*\.\s*equals\s*\(\s*(?:action|command|operation)\s*\)/g;
    while ((m = actionRegex.exec(methodBody)) !== null) {
      const action = m[1] || m[2];
      const urlPattern = "/" + action;
      if (!seen.has(urlPattern)) {
        seen.add(urlPattern);
        routes.push({
          urlPattern,
          handlerName: this.actionToHandlerName(action, httpVerb),
        });
      }
    }

    return routes;
  }

  /**
   * Convertir un URL pattern en nom de handler Java valide.
   * /comptes/solde → handleGetComptesSolde
   * /api/v1/comptes/{id}/solde → handleGetComptesSolde
   * v5.10.1: FIX 4b — filtre api, vN, {params} pour éviter les noms invalides.
   */
  private routeToHandlerName(urlPattern: string, httpVerb: string): string {
    const verb = httpVerb.charAt(0).toUpperCase() + httpVerb.slice(1).toLowerCase();
    const segments = urlPattern
      .replace(/^\/+/, "")          // Supprimer slashes de début
      .split("/")
      .filter(Boolean)
      .filter(s => s !== "api")            // Enlever "api"
      .filter(s => !/^v\d+$/.test(s))      // Enlever "v1", "v2"
      .filter(s => !/^\{.*\}$/.test(s))    // Enlever les {params}
      .map(s => s.replace(/[^a-zA-Z0-9]/g, ""))
      .filter(s => s.length > 0)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1));
    return `handle${verb}${segments.join("") || "Root"}`;
  }

  /**
   * Convertir un nom d'action en nom de handler Java.
   * consulterSolde → handlePostConsulterSolde
   */
  private actionToHandlerName(action: string, httpVerb: string): string {
    const verb = httpVerb.charAt(0).toUpperCase() + httpVerb.slice(1).toLowerCase();
    const name = action.charAt(0).toUpperCase() + action.slice(1);
    return `handle${verb}${name}`;
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

interface SubRoute {
  urlPattern: string;
  handlerName: string;
}
