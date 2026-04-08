/**
 * Detecteur JPA (@Entity, @NamedQuery, CriteriaBuilder).
 * Tier 2 - Cible : Spring Data JPA (migration legere).
 */
import type {
  TechnologyDetector,
  DetectedComponent,
  JpaComponent,
  DetectedField,
} from "../registry/types";

export class JpaDetector implements TechnologyDetector {
  readonly technology = "JPA" as const;
  readonly tier = 2 as const;
  readonly label = "JPA";

  canDetect(content: string, fileName: string): boolean {
    if (!fileName.endsWith(".java")) return false;
    return (
      /@Entity/.test(content) ||
      /@NamedQuery/.test(content) ||
      /import\s+javax\.persistence/.test(content) ||
      /import\s+jakarta\.persistence/.test(content) ||
      /CriteriaBuilder/.test(content) ||
      /EntityManager/.test(content)
    );
  }

  detect(content: string, fileName: string): DetectedComponent[] {
    const classMatch = content.match(/(?:public\s+)?class\s+(\w+)/);
    if (!classMatch) return [];

    const className = classMatch[1];
    const packageMatch = content.match(/^package\s+([\w.]+);/m);
    const packageName = packageMatch ? packageMatch[1] : "";

    // Extraire le nom de table
    let tableName = className.toUpperCase();
    const tableMatch = content.match(/@Table\s*\(\s*name\s*=\s*"([^"]+)"/);
    if (tableMatch) tableName = tableMatch[1];

    // Extraire les champs
    const fields: DetectedField[] = [];
    const fieldRegex = /(?:@(?:Column|Id|GeneratedValue|Temporal|Enumerated)[^)]*\)\s*)*private\s+(\w[\w<>,\s]*?)\s+(\w+)\s*[;=]/g;
    let m;
    while ((m = fieldRegex.exec(content)) !== null) {
      if (m[2] === "serialVersionUID") continue;
      const annotations: string[] = [];
      const preceding = content.substring(Math.max(0, m.index - 200), m.index);
      if (/@Id/.test(preceding)) annotations.push("@Id");
      if (/@GeneratedValue/.test(preceding)) annotations.push("@GeneratedValue");
      if (/@Column/.test(preceding)) annotations.push("@Column");

      let columnName: string | undefined;
      const colMatch = preceding.match(/@Column\s*\([^)]*name\s*=\s*"([^"]+)"/);
      if (colMatch) columnName = colMatch[1];

      const nullable = !/@Column\s*\([^)]*nullable\s*=\s*false/.test(preceding);

      fields.push({
        name: m[2],
        type: m[1].trim(),
        annotations,
        columnName,
        nullable,
      });
    }

    // Extraire les @NamedQuery
    const namedQueries: { name: string; query: string }[] = [];
    const nqRegex = /@NamedQuery\s*\(\s*name\s*=\s*"([^"]+)"\s*,\s*query\s*=\s*"([^"]+)"/g;
    while ((m = nqRegex.exec(content)) !== null) {
      namedQueries.push({ name: m[1], query: m[2] });
    }

    const criteriaBuilderUsage = /CriteriaBuilder/.test(content);

    const component: JpaComponent = {
      technology: "JPA",
      className,
      packageName,
      filePath: fileName,
      confidence: this.computeConfidence(fields, namedQueries, criteriaBuilderUsage),
      metadata: {
        entityClass: className,
        tableName,
        fields,
        namedQueries,
        criteriaBuilderUsage,
      },
    };

    return [component];
  }

  getConfidence(component: DetectedComponent): number {
    return component.confidence;
  }

  private computeConfidence(fields: DetectedField[], queries: unknown[], criteria: boolean): number {
    let score = 70;
    if (fields.length > 0) score += 10;
    if (queries.length > 0) score += 10;
    if (criteria) score += 5;
    return Math.min(score, 95);
  }
}
