/**
 * Detecteur Hibernate (SessionFactory, HQL, Criteria API, hbm.xml).
 * Tier 1 - Cible : Spring Data JPA.
 */
import type {
  TechnologyDetector,
  DetectedComponent,
  HibernateComponent,
  DetectedField,
} from "../registry/types";

export class HibernateDetector implements TechnologyDetector {
  readonly technology = "HIBERNATE" as const;
  readonly tier = 1 as const;
  readonly label = "Hibernate";

  canDetect(content: string, fileName: string): boolean {
    if (fileName.endsWith(".java")) {
      return (
        /SessionFactory/.test(content) ||
        /import\s+org\.hibernate/.test(content) ||
        /createQuery\s*\(\s*"(?:FROM|SELECT|UPDATE|DELETE)/i.test(content) ||
        /createCriteria/.test(content)
      );
    }
    if (fileName.endsWith(".hbm.xml")) return true;
    return false;
  }

  detect(content: string, fileName: string, allFiles?: { path: string; content: string }[]): DetectedComponent[] {
    if (fileName.endsWith(".hbm.xml")) {
      return this.detectHbmXml(content, fileName);
    }
    return this.detectJavaFile(content, fileName, allFiles);
  }

  getConfidence(component: DetectedComponent): number {
    return component.confidence;
  }

  private detectJavaFile(content: string, fileName: string, allFiles?: { path: string; content: string }[]): DetectedComponent[] {
    const classMatch = content.match(/(?:public\s+)?class\s+(\w+)/);
    if (!classMatch) return [];

    const className = classMatch[1];
    const packageMatch = content.match(/^package\s+([\w.]+);/m);
    const packageName = packageMatch ? packageMatch[1] : "";

    // Extraire les requetes HQL
    const hqlQueries: { hql: string; jpql: string }[] = [];
    const hqlRegex = /createQuery\s*\(\s*\n?\s*"([^"]+)"/g;
    let m;
    while ((m = hqlRegex.exec(content)) !== null) {
      const hql = m[1].replace(/"\s*\+\s*"/g, " ").trim();
      hqlQueries.push({ hql, jpql: hql });
    }

    const criteriaUsage = /createCriteria/.test(content);

    let entityClass = "";
    let tableName = "";
    const fields: DetectedField[] = [];

    for (const q of hqlQueries) {
      const fromMatch = q.hql.match(/FROM\s+(\w+)/i);
      if (fromMatch && !entityClass) {
        entityClass = fromMatch[1];
      }
    }

    let hbmXmlPresent = false;
    if (allFiles) {
      for (const f of allFiles) {
        if (f.path.endsWith(".hbm.xml")) {
          hbmXmlPresent = true;
          if (entityClass) {
            const classRegex = new RegExp('class\\s+name="[^"]*' + entityClass + '"\\s+table="([^"]+)"');
            const tableMatch = classRegex.exec(f.content);
            if (tableMatch) tableName = tableMatch[1];

            const propRegex = /<property\s+name="(\w+)"\s+column="([^"]+)"\s+type="([^"]+)"/g;
            let pm;
            while ((pm = propRegex.exec(f.content)) !== null) {
              fields.push({
                name: pm[1],
                type: this.hbmTypeToJava(pm[3]),
                columnName: pm[2],
              });
            }
          }
        }
      }
    }

    if (!entityClass) entityClass = className.replace(/DAO$/, "");
    if (!tableName) tableName = entityClass.toUpperCase() + "S";

    const component: HibernateComponent = {
      technology: "HIBERNATE",
      className,
      packageName,
      filePath: fileName,
      confidence: this.computeConfidence(hqlQueries, criteriaUsage, hbmXmlPresent),
      metadata: {
        entityClass,
        tableName,
        fields,
        hqlQueries,
        criteriaUsage,
        hbmXmlPresent,
      },
    };

    return [component];
  }

  private detectHbmXml(content: string, fileName: string): DetectedComponent[] {
    const components: DetectedComponent[] = [];
    const classRegex = /<class\s+name="([^"]+)"\s+table="([^"]+)"/g;
    let m;
    while ((m = classRegex.exec(content)) !== null) {
      const fullClass = m[1];
      const tableName = m[2];
      const className = fullClass.split(".").pop() || fullClass;
      const packageName = fullClass.includes(".") ? fullClass.substring(0, fullClass.lastIndexOf(".")) : "";

      const fields: DetectedField[] = [];
      // Extract fields between this class and the next class or end
      const classStart = m.index;
      const nextClass = content.indexOf("<class ", classStart + 1);
      const classSection = nextClass > 0 ? content.substring(classStart, nextClass) : content.substring(classStart);

      const propRegex = /<property\s+name="(\w+)"\s+column="([^"]+)"\s+type="([^"]+)"/g;
      let pm;
      while ((pm = propRegex.exec(classSection)) !== null) {
        fields.push({
          name: pm[1],
          type: this.hbmTypeToJava(pm[3]),
          columnName: pm[2],
        });
      }

      // Extract ID
      const idMatch = classSection.match(/<id\s+name="(\w+)"\s+column="([^"]+)"\s+type="([^"]+)"/);
      if (idMatch) {
        fields.unshift({
          name: idMatch[1],
          type: this.hbmTypeToJava(idMatch[3]),
          columnName: idMatch[2],
        });
      }

      const component: HibernateComponent = {
        technology: "HIBERNATE",
        className,
        packageName,
        filePath: fileName,
        confidence: 85,
        metadata: {
          entityClass: className,
          tableName,
          fields,
          hqlQueries: [],
          criteriaUsage: false,
          hbmXmlPresent: true,
        },
      };
      components.push(component);
    }
    return components;
  }

  private hbmTypeToJava(hbmType: string): string {
    const map: Record<string, string> = {
      string: "String",
      long: "Long",
      integer: "Integer",
      big_decimal: "BigDecimal",
      date: "LocalDate",
      timestamp: "LocalDateTime",
      boolean: "Boolean",
      double: "Double",
      float: "Float",
      byte: "Byte",
    };
    return map[hbmType] || "String";
  }

  private computeConfidence(hqlQueries: unknown[], criteriaUsage: boolean, hbmXml: boolean): number {
    let score = 65;
    if (hqlQueries.length > 0) score += 15;
    if (criteriaUsage) score += 10;
    if (hbmXml) score += 10;
    return Math.min(score, 99);
  }
}
