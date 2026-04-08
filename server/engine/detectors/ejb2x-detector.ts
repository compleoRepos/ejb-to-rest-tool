/**
 * Détecteur EJB 2.x (SessionBean, EntityBean, ejb-jar.xml).
 * Tier 1 — Cible : Spring Service.
 */
import type {
  TechnologyDetector,
  DetectedComponent,
  Ejb2xComponent,
  DetectedMethod,
} from "../registry/types";

export class Ejb2xDetector implements TechnologyDetector {
  readonly technology = "EJB_2X" as const;
  readonly tier = 1 as const;
  readonly label = "EJB 2.x";

  canDetect(content: string, fileName: string): boolean {
    if (!fileName.endsWith(".java")) return false;
    return (
      /implements\s+(?:SessionBean|EntityBean)/.test(content) ||
      /extends\s+(?:SessionBean|EntityBean)/.test(content) ||
      (/interface\s+\w+\s+extends\s+EJBObject/.test(content)) ||
      (/interface\s+\w+\s+extends\s+EJBHome/.test(content)) ||
      (/interface\s+\w+\s+extends\s+EJBLocalObject/.test(content))
    );
  }

  detect(content: string, fileName: string, allFiles?: { path: string; content: string }[]): DetectedComponent[] {
    // Détecter le bean (pas les interfaces)
    const beanMatch = content.match(/(?:public\s+)?class\s+(\w+)\s+implements\s+SessionBean/);
    if (!beanMatch) {
      // Vérifier si c'est une interface Remote
      const remoteMatch = content.match(/(?:public\s+)?interface\s+(\w+)\s+extends\s+(?:EJBObject|EJBLocalObject)/);
      if (remoteMatch) {
        return this.detectRemoteInterface(content, fileName, remoteMatch[1]);
      }
      return [];
    }

    const className = beanMatch[1];
    const packageMatch = content.match(/^package\s+([\w.]+);/m);
    const packageName = packageMatch ? packageMatch[1] : "";

    // Extraire les méthodes métier (ejbCreate, ejbRemove, etc. sont des méthodes de cycle de vie)
    const methods: DetectedMethod[] = [];
    const methodRegex = /public\s+(\w[\w<>,\s]*?)\s+(\w+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = methodRegex.exec(content)) !== null) {
      const name = m[2];
      if (["ejbCreate", "ejbRemove", "ejbActivate", "ejbPassivate", "setSessionContext"].includes(name)) continue;
      methods.push({
        name,
        returnType: m[1].trim(),
        params: this.parseParams(m[3]),
        annotations: [],
      });
    }

    // Chercher l'interface Remote correspondante
    let remoteInterface: string | undefined;
    let homeInterface: string | undefined;
    if (allFiles) {
      for (const f of allFiles) {
        if (f.path.endsWith(".java")) {
          if (/extends\s+EJBObject/.test(f.content)) {
            const match = f.content.match(/interface\s+(\w+)/);
            if (match) remoteInterface = match[1];
          }
          if (/extends\s+EJBHome/.test(f.content)) {
            const match = f.content.match(/interface\s+(\w+)/);
            if (match) homeInterface = match[1];
          }
        }
      }
    }

    // Chercher dans ejb-jar.xml
    let ejbJarDescriptor = false;
    if (allFiles) {
      for (const f of allFiles) {
        if (f.path.endsWith("ejb-jar.xml") && f.content.includes(className)) {
          ejbJarDescriptor = true;
          if (!remoteInterface) {
            const rm = f.content.match(new RegExp(`<remote>([^<]+)</remote>`));
            if (rm) remoteInterface = rm[1].split(".").pop();
          }
          if (!homeInterface) {
            const hm = f.content.match(new RegExp(`<home>([^<]+)</home>`));
            if (hm) homeInterface = hm[1].split(".").pop();
          }
        }
      }
    }

    const component: Ejb2xComponent = {
      technology: "EJB_2X",
      className,
      packageName,
      filePath: fileName,
      confidence: this.computeConfidence(methods, remoteInterface, ejbJarDescriptor),
      metadata: {
        beanClass: className,
        remoteInterface,
        homeInterface,
        sessionType: "Stateless",
        businessMethods: methods,
        ejbJarDescriptor,
      },
    };

    return [component];
  }

  getConfidence(component: DetectedComponent): number {
    return component.confidence;
  }

  private detectRemoteInterface(content: string, fileName: string, className: string): DetectedComponent[] {
    // On ne génère pas directement depuis les interfaces, elles sont référencées par le bean
    return [];
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

  private computeConfidence(methods: DetectedMethod[], remote?: string, ejbJar?: boolean): number {
    let score = 65;
    if (methods.length > 0) score += 15;
    if (remote) score += 10;
    if (ejbJar) score += 10;
    return Math.min(score, 99);
  }
}
