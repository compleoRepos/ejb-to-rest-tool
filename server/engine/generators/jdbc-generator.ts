import type { CodeGenerator, DetectedComponent, JdbcComponent, GeneratedFile, ValidationResult } from "../registry/types";

export class JdbcGenerator implements CodeGenerator {
  readonly technology = "JDBC" as const;
  canGenerate(c: DetectedComponent): boolean { return c.technology === "JDBC"; }

  generate(component: DetectedComponent, _all: DetectedComponent[], basePackage: string): GeneratedFile[] {
    const c = component as JdbcComponent;
    const files: GeneratedFile[] = [];
    const entityName = c.metadata.inferredEntity.className;
    const repoName = entityName + "Repository";
    const pp = basePackage.replace(/\./g, "/");

    files.push({ path: `src/main/java/${pp}/entity/${entityName}.java`, content: this.genEntity(c, entityName, basePackage), category: "entity", technology: "JDBC", sourceRef: c.filePath });
    files.push({ path: `src/main/java/${pp}/repository/${repoName}.java`, content: this.genRepo(c, entityName, repoName, basePackage), category: "repository", technology: "JDBC", sourceRef: c.filePath });
    files.push({ path: `docs/migration-notes/${c.className}-jdbc-migration.md`, content: this.genNote(c), category: "migration_note", technology: "JDBC", sourceRef: c.filePath });
    return files;
  }

  validate(generated: GeneratedFile[]): ValidationResult { return { valid: true, errors: [], warnings: [] }; }

  private genEntity(c: JdbcComponent, entityName: string, pkg: string): string {
    const fields = c.metadata.inferredEntity.fields.map(f => {
      const col = f.columnName ? `    @Column(name = "${f.columnName}"${f.nullable === false ? ", nullable = false" : ""})` : "";
      return `${col}\n    private ${f.type} ${f.name};`;
    }).join("\n\n");

    return `package ${pkg}.entity;\n\nimport jakarta.persistence.*;\nimport lombok.Data;\n\n/** Entite JPA migree depuis JDBC DAO: ${c.className}\n * Table: ${c.metadata.tableName}\n */\n@Entity\n@Table(name = "${c.metadata.tableName}")\n@Data\npublic class ${entityName} {\n\n    @Id\n    @GeneratedValue(strategy = GenerationType.IDENTITY)\n    private Long id;\n\n${fields}\n}\n`;
  }

  private genRepo(c: JdbcComponent, entityName: string, repoName: string, pkg: string): string {
    const customQueries = c.metadata.queries.filter(q => q.type === "SELECT" && q.jpql).map(q => {
      const methodName = "findBy" + this.inferMethodName(q.sql);
      return `    @Query("${q.jpql}")\n    List<${entityName}> ${methodName}();`;
    }).join("\n\n");

    return `package ${pkg}.repository;\n\nimport ${pkg}.entity.${entityName};\nimport org.springframework.data.jpa.repository.JpaRepository;\nimport org.springframework.data.jpa.repository.Query;\nimport org.springframework.stereotype.Repository;\nimport java.util.List;\n\n/** Repository JPA migre depuis JDBC DAO: ${c.className}\n * Requetes SQL originales converties en JPQL.\n */\n@Repository\npublic interface ${repoName} extends JpaRepository<${entityName}, Long> {\n\n${customQueries}\n}\n`;
  }

  private genNote(c: JdbcComponent): string {
    const queryMigrations = c.metadata.queries.map(q => `| ${q.type} | \`${q.sql.substring(0, 60)}...\` | \`${q.jpql}\` |`).join("\n");
    return `# Migration JDBC -> JPA: ${c.className}\n\n## Changements\n- **DriverManager / DataSource** -> **Spring Data JPA**\n- **PreparedStatement** -> **@Query JPQL**\n- **ResultSet mapping** -> **JPA Entity mapping**\n- **try/finally close()** -> **Gestion automatique par Spring**\n\n## Requetes migrees\n| Type | SQL Original | JPQL |\n|------|-------------|------|\n${queryMigrations}\n\n## Table: ${c.metadata.tableName}\n`;
  }

  private inferMethodName(sql: string): string {
    const whereMatch = sql.match(/WHERE\s+(\w+)/i);
    if (whereMatch) return this.capitalize(whereMatch[1]);
    return "Custom";
  }

  private capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
}
