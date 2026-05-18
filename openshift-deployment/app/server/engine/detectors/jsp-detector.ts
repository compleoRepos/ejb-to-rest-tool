/**
 * Détecteur de fichiers JSP.
 * Tier 2 — Cible : React components (note de migration).
 */
import type {
  TechnologyDetector,
  DetectedComponent,
  JspComponent,
} from "../registry/types";

export class JspDetector implements TechnologyDetector {
  readonly technology = "JSP" as const;
  readonly tier = 2 as const;
  readonly label = "JSP";

  canDetect(content: string, fileName: string): boolean {
    return fileName.endsWith(".jsp") || fileName.endsWith(".jspx");
  }

  detect(content: string, fileName: string): DetectedComponent[] {
    const name = fileName.split("/").pop() || fileName;

    // Extraire les useBean
    const beansUsed: { id: string; className: string }[] = [];
    const beanRegex = /<jsp:useBean\s+id="([^"]+)"\s+class="([^"]+)"/g;
    let m;
    while ((m = beanRegex.exec(content)) !== null) {
      beansUsed.push({ id: m[1], className: m[2] });
    }

    // Extraire les données exposées (EL expressions)
    const dataExposed: string[] = [];
    const elRegex = /\$\{(\w+(?:\.\w+)?)\}/g;
    while ((m = elRegex.exec(content)) !== null) {
      const root = m[1].split(".")[0];
      if (!dataExposed.includes(root)) dataExposed.push(root);
    }

    // Extraire les formulaires
    const forms: { action: string; method: string; fields: string[] }[] = [];
    const formRegex = /<form[^>]*action="([^"]*)"[^>]*(?:method="([^"]*)")?[^>]*>([\s\S]*?)<\/form>/gi;
    while ((m = formRegex.exec(content)) !== null) {
      const fields: string[] = [];
      const inputRegex = /name="([^"]+)"/g;
      let im;
      while ((im = inputRegex.exec(m[3])) !== null) {
        fields.push(im[1]);
      }
      forms.push({
        action: m[1],
        method: (m[2] || "GET").toUpperCase(),
        fields,
      });
    }

    // Détecter les tags JSTL
    const jstlTags: string[] = [];
    const jstlRegex = /<(c:|fmt:|fn:)(\w+)/g;
    while ((m = jstlRegex.exec(content)) !== null) {
      const tag = `${m[1]}${m[2]}`;
      if (!jstlTags.includes(tag)) jstlTags.push(tag);
    }

    // Détecter le servlet lié
    let linkedServlet: string | undefined;
    const forwardMatch = content.match(/action="[^"]*\/(\w+)(?:Servlet)?"/);
    if (forwardMatch) linkedServlet = forwardMatch[1];

    const component: JspComponent = {
      technology: "JSP",
      className: name.replace(/\.jspx?$/, ""),
      packageName: "",
      filePath: fileName,
      confidence: 90,
      metadata: {
        fileName: name,
        beansUsed,
        dataExposed,
        linkedServlet,
        forms,
        jstlTags,
        migrationNote: `JSP "${name}" doit être converti en composant React. ${forms.length} formulaire(s), ${beansUsed.length} bean(s), ${jstlTags.length} tag(s) JSTL.`,
      },
    };

    return [component];
  }

  getConfidence(component: DetectedComponent): number {
    return component.confidence;
  }
}
