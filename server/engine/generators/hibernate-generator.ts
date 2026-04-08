import type { CodeGenerator, DetectedComponent, HibernateComponent, GeneratedFile, ValidationResult } from "../registry/types";

export class HibernateGenerator implements CodeGenerator {
  readonly technology = "HIBERNATE" as const;
  canGenerate(c: DetectedComponent): boolean { return c.technology === "HIBERNATE"; }

  generate(component: DetectedComponent, _all: DetectedComponent[], basePackage: string): GeneratedFile[] {
    const c = component as HibernateComponent;
    const files: GeneratedFile[] = [];
    const entityName = c.metadata.entityClass;
    const repoName = entityName + "Repository";
    const pp = basePackage.replace(/\./g, "/");

    files.push({ path: `src/main/java/${pp}/entity/${entityName}.java`, content: this.genEntity(c, entityName, basePackage), category: "entity", technology: "HIBERNATE", sourceRef: c.filePath });
    files.push({ path: `src/main/java/${pp}/repository/${repoName}.java`, content: this.genRepo(c, entityName, repoName, basePackage), category: "repository", technology: "HIBERNATE", sourceRef: c.filePath });
    if (c.metadata.hqlQueries.length > 0) {
      files.push({ path: `docs/migration-notes/${c.className}-hibernate-migration.md`, content: this.genNote(c), category: "migration_note", technology: "HIBERNATE", sourceRef: c.filePath });
    }
    return files;
  }

  validate(generated: GeneratedFile[]): ValidationResult { return { valid: true, errors: [], warnings: [] }; }

  private genEntity(c: HibernateComponent, entityName: string, pkg: string): string {
    const fields = c.metadata.fields.map(f => {
      const col = f.columnName ? `    @Column(name = "${f.columnName}"${f.nullable === false ? ", nullable = false" : ""})` : "";
      return `${col}\n    private ${f.type} ${f.name};`;
    }).join("\n\n");

    return `package ${pkg}.entity;\n\nimport jakarta.persistence.*;\nimport lombok.Data;\n\n/** Entite JPA migree depuis Hibernate: ${c.className}\n * Table: ${c.metadata.tableName}\n * ${c.metadata.hbmXmlPresent ? "hbm.xml supprime - annotations JPA" : "Deja annote"}\n * ${c.metadata.criteriaUsage ? "Criteria API -> JPA CriteriaBuilder" : ""}\n */\n@Entity\n@Table(name = "${c.metadata.tableName}")\n@Data\npublic class ${entityName} {\n\n    @Id\n    @GeneratedValue(strategy = GenerationType.IDENTITY)\n    private Long id;\n\n${fields}\n}\n`;
  }

  private genRepo(c: HibernateComponent, entityName: string, repoName: string, pkg: string): string {
    const queries = c.metadata.hqlQueries.map(q => {
      return `    @Query("${q.jpql}")\n    List<${entityName}> findByCustomQuery();`;
    }).join("\n\n");

    return `package ${pkg}.repository;\n\nimport ${pkg}.entity.${entityName};\nimport org.springframework.data.jpa.repository.JpaRepository;\nimport org.springframework.data.jpa.repository.Query;\nimport org.springframework.stereotype.Repository;\nimport java.util.List;\n\n/** Repository JPA migre depuis Hibernate DAO: ${c.className}\n * HQL converti en JPQL.\n */\n@Repository\npublic interface ${repoName} extends JpaRepository<${entityName}, Long> {\n\n${queries}\n}\n`;
  }

  private genNote(c: HibernateComponent): string {
    return `# Migration Hibernate -> JPA: ${c.className}\n\n## Changements\n- **SessionFactory** -> **EntityManager (auto-configure)**\n- **Session.createQuery(HQL)** -> **@Query JPQL**\n- **Criteria API** -> **JPA CriteriaBuilder** ${c.metadata.criteriaUsage ? "(detecte)" : "(non detecte)"}\n- **hbm.xml** -> **Annotations JPA** ${c.metadata.hbmXmlPresent ? "(supprime)" : ""}\n\n## Requetes HQL migrees\n${c.metadata.hqlQueries.map(q => "- HQL: " + q.hql + " -> JPQL: " + q.jpql).join("\n")}\n`;
  }
}
