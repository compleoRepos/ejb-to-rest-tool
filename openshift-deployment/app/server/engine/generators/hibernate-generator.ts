import type { CodeGenerator, DetectedComponent, HibernateComponent, GeneratedFile, ValidationResult } from "../registry/types";

export class HibernateGenerator implements CodeGenerator {
  readonly technology = "HIBERNATE" as const;
  canGenerate(c: DetectedComponent): boolean { return c.technology === "HIBERNATE"; }

  generate(component: DetectedComponent, _all: DetectedComponent[], basePackage: string): GeneratedFile[] {
    const c = component as HibernateComponent;
    const files: GeneratedFile[] = [];
    const entityName = c.metadata.entityClass;
    const repoName = entityName + "Repository";
    const svcName = entityName + "Service";
    const ctrlName = entityName + "Controller";
    const pp = basePackage.replace(/\./g, "/");

    files.push({ path: `src/main/java/${pp}/entity/${entityName}.java`, content: this.genEntity(c, entityName, basePackage), category: "entity", technology: "HIBERNATE", sourceRef: c.filePath });
    files.push({ path: `src/main/java/${pp}/repository/${repoName}.java`, content: this.genRepo(c, entityName, repoName, basePackage), category: "repository", technology: "HIBERNATE", sourceRef: c.filePath });
    files.push({ path: `src/main/java/${pp}/service/${svcName}.java`, content: this.genService(c, entityName, svcName, repoName, basePackage), category: "service", technology: "HIBERNATE", sourceRef: c.filePath });
    files.push({ path: `src/main/java/${pp}/controller/${ctrlName}.java`, content: this.genController(entityName, svcName, ctrlName, basePackage), category: "controller", technology: "HIBERNATE", sourceRef: c.filePath });
    if (c.metadata.hqlQueries.length > 0) {
      files.push({ path: `docs/migration-notes/${c.className}-hibernate-migration.md`, content: this.genNote(c, entityName), category: "migration_note", technology: "HIBERNATE", sourceRef: c.filePath });
    }
    return files;
  }

  validate(generated: GeneratedFile[]): ValidationResult { return { valid: true, errors: [], warnings: [] }; }

  private genEntity(c: HibernateComponent, entityName: string, pkg: string): string {
    const fields = c.metadata.fields.map(f => {
      const col = f.columnName ? `    @Column(name = "${f.columnName}"${f.nullable === false ? ", nullable = false" : ""})` : "";
      return `${col}\n    private ${f.type} ${f.name};`;
    }).join("\n\n");

    return `package ${pkg}.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

/** Entite JPA migree depuis Hibernate: ${c.className}
 * Table: ${c.metadata.tableName}
 * ${c.metadata.hbmXmlPresent ? "hbm.xml supprime - annotations JPA" : "Deja annote"}
 * ${c.metadata.criteriaUsage ? "Criteria API -> JPA CriteriaBuilder" : ""}
 */
@Entity
@Table(name = "${c.metadata.tableName}")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ${entityName} {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

${fields}
}
`;
  }

  private genRepo(c: HibernateComponent, entityName: string, repoName: string, pkg: string): string {
    const queries = c.metadata.hqlQueries.map((q, i) => {
      return `    @Query("${q.jpql}")\n    List<${entityName}> findByCustomQuery${i > 0 ? i : ""}();`;
    }).join("\n\n");

    return `package ${pkg}.repository;

import ${pkg}.entity.${entityName};
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;

/** Repository JPA migre depuis Hibernate DAO: ${c.className}
 * HQL converti en JPQL.
 */
@Repository
public interface ${repoName} extends JpaRepository<${entityName}, Long> {

${queries}
}
`;
  }

  private genService(c: HibernateComponent, entityName: string, svcName: string, repoName: string, pkg: string): string {
    const lowerEntity = entityName.charAt(0).toLowerCase() + entityName.slice(1);
    const repoField = repoName.charAt(0).toLowerCase() + repoName.slice(1);

    return `package ${pkg}.service;

import ${pkg}.entity.${entityName};
import ${pkg}.repository.${repoName};
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

/** Service migre depuis Hibernate DAO: ${c.className}
 * SessionFactory remplace par Spring Data JPA.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ${svcName} {

    private final ${repoName} ${repoField};

    @Transactional(readOnly = true)
    public List<${entityName}> findAll() {
        log.debug("Listing all ${lowerEntity}s");
        return ${repoField}.findAll();
    }

    @Transactional(readOnly = true)
    public ${entityName} findById(Long id) {
        return ${repoField}.findById(id)
            .orElseThrow(() -> new RuntimeException("${entityName} non trouve: " + id));
    }

    @Transactional
    public ${entityName} save(${entityName} ${lowerEntity}) {
        log.info("Saving ${lowerEntity}: {}", ${lowerEntity});
        return ${repoField}.save(${lowerEntity});
    }

    @Transactional
    public ${entityName} update(Long id, ${entityName} ${lowerEntity}) {
        ${entityName} existing = findById(id);
        // TODO: Mapper les champs depuis ${lowerEntity} vers existing
        return ${repoField}.save(existing);
    }

    @Transactional
    public void deleteById(Long id) {
        log.info("Deleting ${lowerEntity} id={}", id);
        ${repoField}.deleteById(id);
    }
}
`;
  }

  private genController(entityName: string, svcName: string, ctrlName: string, pkg: string): string {
    const lowerEntity = entityName.charAt(0).toLowerCase() + entityName.slice(1);
    const svcField = svcName.charAt(0).toLowerCase() + svcName.slice(1);
    const basePath = "/api/" + this.toKebabCase(entityName) + "s";

    return `package ${pkg}.controller;

import ${pkg}.entity.${entityName};
import ${pkg}.service.${svcName};
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;

/** REST Controller migre depuis Hibernate DAO.
 * Expose les operations CRUD via API REST.
 */
@RestController
@RequestMapping("${basePath}")
@RequiredArgsConstructor
@Tag(name = "${entityName}", description = "Operations CRUD pour ${entityName}")
public class ${ctrlName} {

    private final ${svcName} ${svcField};

    @Operation(summary = "Lister tous les ${lowerEntity}s")
    @GetMapping
    public ResponseEntity<List<${entityName}>> findAll() {
        return ResponseEntity.ok(${svcField}.findAll());
    }

    @Operation(summary = "Recuperer un ${lowerEntity} par ID")
    @GetMapping("/{id}")
    public ResponseEntity<${entityName}> findById(@PathVariable Long id) {
        return ResponseEntity.ok(${svcField}.findById(id));
    }

    @Operation(summary = "Creer un ${lowerEntity}")
    @PostMapping
    public ResponseEntity<${entityName}> create(@RequestBody ${entityName} ${lowerEntity}) {
        return ResponseEntity.ok(${svcField}.save(${lowerEntity}));
    }

    @Operation(summary = "Mettre a jour un ${lowerEntity}")
    @PutMapping("/{id}")
    public ResponseEntity<${entityName}> update(@PathVariable Long id, @RequestBody ${entityName} ${lowerEntity}) {
        return ResponseEntity.ok(${svcField}.update(id, ${lowerEntity}));
    }

    @Operation(summary = "Supprimer un ${lowerEntity}")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        ${svcField}.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
`;
  }

  private genNote(c: HibernateComponent, entityName: string): string {
    return `# Migration Hibernate -> JPA: ${c.className}

## Changements
- **SessionFactory** -> **EntityManager (auto-configure)**
- **Session.createQuery(HQL)** -> **@Query JPQL**
- **Criteria API** -> **JPA CriteriaBuilder** ${c.metadata.criteriaUsage ? "(detecte)" : "(non detecte)"}
- **hbm.xml** -> **Annotations JPA** ${c.metadata.hbmXmlPresent ? "(supprime)" : ""}
- **DAO pattern** -> **Service + Repository + Controller (REST API)**

## Architecture generee
- Entity: ${entityName}.java (@Entity, @Data, @Table)
- Repository: ${entityName}Repository.java (JpaRepository)
- Service: ${entityName}Service.java (@Service, @Transactional, @Slf4j)
- Controller: ${entityName}Controller.java (@RestController, OpenAPI)

## Requetes HQL migrees
${c.metadata.hqlQueries.map(q => "- HQL: " + q.hql + " -> JPQL: " + q.jpql).join("\n")}
`;
  }

  private toKebabCase(s: string): string {
    return s.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "");
  }
}
