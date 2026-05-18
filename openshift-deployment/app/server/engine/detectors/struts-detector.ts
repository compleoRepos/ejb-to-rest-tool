/**
 * Detecteur Struts 1 et Struts 2 (Action, ActionForm, struts-config.xml).
 * Tier 1 - Cible : Spring REST Controller.
 */
import type {
  TechnologyDetector,
  DetectedComponent,
  StrutsComponent,
  DetectedField,
} from "../registry/types";

export class StrutsDetector implements TechnologyDetector {
  readonly technology = "STRUTS_1" as const;
  readonly tier = 1 as const;
  readonly label = "Struts";

  canDetect(content: string, fileName: string): boolean {
    if (fileName.endsWith(".java")) {
      return (
        /extends\s+(?:Action|DispatchAction|MappingDispatchAction|LookupDispatchAction)\b/.test(content) ||
        /extends\s+ActionForm/.test(content) ||
        /import\s+org\.apache\.struts/.test(content) ||
        /import\s+com\.opensymphony\.xwork2/.test(content) ||
        /extends\s+ActionSupport/.test(content)
      );
    }
    if (fileName.endsWith("struts-config.xml") || fileName.endsWith("struts.xml")) {
      return true;
    }
    return false;
  }

  detect(content: string, fileName: string, allFiles?: { path: string; content: string }[]): DetectedComponent[] {
    if (fileName.endsWith(".java")) {
      return this.detectJavaFile(content, fileName, allFiles);
    }
    return [];
  }

  getConfidence(component: DetectedComponent): number {
    return component.confidence;
  }

  private detectJavaFile(content: string, fileName: string, allFiles?: { path: string; content: string }[]): DetectedComponent[] {
    // Ignorer les ActionForm (ils seront references par l'Action)
    if (/extends\s+ActionForm/.test(content) && !/extends\s+(?:Action|DispatchAction)\b/.test(content)) return [];

    const isStruts2 = /extends\s+ActionSupport/.test(content) || /import\s+com\.opensymphony/.test(content);

    const classMatch = content.match(/(?:public\s+)?class\s+(\w+)\s+extends\s+(?:Action|DispatchAction|MappingDispatchAction|LookupDispatchAction|ActionSupport)\b/);
    if (!classMatch) return [];

    const className = classMatch[1];
    const packageMatch = content.match(/^package\s+([\w.]+);/m);
    const packageName = packageMatch ? packageMatch[1] : "";

    // Chercher la config Struts pour cette action
    let actionPath = "/" + className.replace(/Action$/, "").toLowerCase();
    let actionFormClass: string | undefined;
    const forwards: { name: string; path: string }[] = [];
    const formFields: DetectedField[] = [];
    const validationRules: string[] = [];

    if (allFiles) {
      for (const f of allFiles) {
        if (f.path.endsWith("struts-config.xml")) {
          // Chercher l'action mapping
          const actionRegex = new RegExp(
            '<action[^>]*path="([^"]*)"[^>]*type="[^"]*' + className + '"[^>]*>([\\s\\S]*?)</action>',
            "m"
          );
          const actionMatch = actionRegex.exec(f.content);
          if (actionMatch) {
            actionPath = actionMatch[1];
            // Extraire le form-bean name
            const nameMatch = actionMatch[0].match(/name="([^"]+)"/);
            if (nameMatch) {
              // Trouver la classe du form-bean
              const fbRegex = new RegExp('<form-bean\\s+name="' + nameMatch[1] + '"\\s+type="([^"]+)"');
              const fbMatch = fbRegex.exec(f.content);
              if (fbMatch) actionFormClass = fbMatch[1];
            }
            // Extraire les forwards
            const fwdRegex = /<forward\s+name="([^"]+)"\s+path="([^"]+)"/g;
            let fw;
            while ((fw = fwdRegex.exec(actionMatch[2])) !== null) {
              forwards.push({ name: fw[1], path: fw[2] });
            }
          }
        }
      }

      // Extraire les champs du formulaire
      if (actionFormClass) {
        for (const f of allFiles) {
          if (f.path.endsWith(".java") && f.content.includes(actionFormClass.split(".").pop() || "")) {
            const fieldRegex = /private\s+(\w[\w<>,\s]*?)\s+(\w+)\s*[;=]/g;
            let fm;
            while ((fm = fieldRegex.exec(f.content)) !== null) {
              if (fm[2] === "serialVersionUID") continue;
              formFields.push({
                name: fm[2],
                type: fm[1].trim(),
              });
            }
            // Extraire les regles de validation
            const validateMatch = f.content.match(/validate\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/);
            if (validateMatch) {
              const body = validateMatch[1];
              if (/isEmpty|trim\(\)\.isEmpty/.test(body)) validationRules.push("@NotBlank");
              if (/null/.test(body)) validationRules.push("@NotNull");
              if (/matches|Pattern/.test(body)) validationRules.push("@Pattern");
              if (/compareTo|BigDecimal/.test(body)) validationRules.push("@DecimalMin/@DecimalMax");
            }
          }
        }
      }
    }

    const component: StrutsComponent = {
      technology: isStruts2 ? "STRUTS_2" : "STRUTS_1",
      className,
      packageName,
      filePath: fileName,
      confidence: this.computeConfidence(forwards, formFields, actionFormClass),
      metadata: {
        actionPath,
        actionFormClass,
        formFields,
        validationRules,
        forwards,
        strutsVersion: isStruts2 ? 2 : 1,
      },
    };

    return [component];
  }

  private computeConfidence(
    forwards: { name: string; path: string }[],
    formFields: DetectedField[],
    formClass?: string
  ): number {
    let score = 70;
    if (forwards.length > 0) score += 10;
    if (formFields.length > 0) score += 10;
    if (formClass) score += 10;
    return Math.min(score, 99);
  }
}
