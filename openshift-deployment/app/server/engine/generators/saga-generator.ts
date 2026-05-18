import type { GeneratedFile } from "../registry/types";

/**
 * SagaGenerator — Génère le pattern Saga Orchestrator pour les transactions distribuées.
 * 
 * Quand un EJB ou Service utilise @TransactionAttribute(REQUIRED) et appelle
 * plusieurs services/entités dans la même transaction, on ne peut pas garder
 * un simple @Transactional dans une architecture microservices.
 * 
 * Ce générateur produit :
 * - Un SagaOrchestrator (coordonne les étapes)
 * - Des SagaStep (chaque opération + compensation)
 * - Un SagaEvent (événements de suivi)
 * - Un SagaStatus enum
 * - Une config Spring pour le retry/timeout
 */
export class SagaGenerator {

  /**
   * Détecte si un composant a des transactions distribuées.
   * Critères : appelle 2+ repositories/services différents dans la même méthode.
   */
  static detectDistributedTransaction(
    sourceCode: string,
    allComponents: { className: string; category?: string }[]
  ): { isDistributed: boolean; involvedServices: string[]; methodName: string } {
    const serviceRefs = new Set<string>();
    const repoRefs = new Set<string>();

    // Chercher les injections de services/repos
    const injections = sourceCode.matchAll(/@(?:Inject|EJB|Autowired)\s+(?:private\s+)?(\w+)\s+(\w+)/g);
    for (const m of injections) {
      const typeName = m[1];
      if (typeName.endsWith("Service") || typeName.endsWith("Facade") || typeName.endsWith("Manager")) {
        serviceRefs.add(typeName);
      } else if (typeName.endsWith("Repository") || typeName.endsWith("Dao") || typeName.endsWith("DAO")) {
        repoRefs.add(typeName);
      }
    }

    // Chercher les appels dans des méthodes @Transactional ou @TransactionAttribute
    const txMethods = sourceCode.matchAll(/@(?:Transactional|TransactionAttribute)[^\n]*\n\s*(?:public|protected)\s+\w+\s+(\w+)\s*\([^)]*\)[^{]*\{([^}]{50,})\}/gs);
    for (const m of txMethods) {
      const methodName = m[1];
      const body = m[2];
      const calledServices: string[] = [];
      
      for (const svc of [...serviceRefs, ...repoRefs]) {
        const fieldName = svc.charAt(0).toLowerCase() + svc.slice(1);
        if (body.includes(fieldName + ".")) {
          calledServices.push(svc);
        }
      }

      if (calledServices.length >= 2) {
        return { isDistributed: true, involvedServices: calledServices, methodName };
      }
    }

    // Fallback: si 3+ services injectés, probable transaction distribuée
    if (serviceRefs.size + repoRefs.size >= 3) {
      return { isDistributed: true, involvedServices: [...serviceRefs, ...repoRefs], methodName: "execute" };
    }

    return { isDistributed: false, involvedServices: [], methodName: "" };
  }

  /**
   * Génère les fichiers Saga pour un orchestrateur donné.
   */
  static generate(
    sagaName: string,
    involvedServices: string[],
    basePackage: string,
    methodName: string
  ): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const pp = basePackage.replace(/\./g, "/");
    const sagaClassName = sagaName + "Saga";
    const orchestratorName = sagaName + "SagaOrchestrator";

    // 1. SagaStatus enum
    files.push({
      path: `src/main/java/${pp}/saga/${sagaClassName}Status.java`,
      content: SagaGenerator.genSagaStatus(basePackage, sagaClassName),
      category: "saga",
      technology: "SAGA",
    });

    // 2. SagaStep interface
    files.push({
      path: `src/main/java/${pp}/saga/SagaStep.java`,
      content: SagaGenerator.genSagaStepInterface(basePackage),
      category: "saga",
      technology: "SAGA",
    });

    // 3. Steps pour chaque service impliqué
    for (const svc of involvedServices) {
      const stepName = svc.replace(/Service$|Repository$|Dao$|DAO$|Facade$|Manager$/, "") + "Step";
      files.push({
        path: `src/main/java/${pp}/saga/steps/${stepName}.java`,
        content: SagaGenerator.genSagaStep(basePackage, stepName, svc),
        category: "saga",
        technology: "SAGA",
      });
    }

    // 4. Orchestrator
    files.push({
      path: `src/main/java/${pp}/saga/${orchestratorName}.java`,
      content: SagaGenerator.genOrchestrator(basePackage, orchestratorName, sagaClassName, involvedServices, methodName),
      category: "saga",
      technology: "SAGA",
    });

    // 5. Migration note
    files.push({
      path: `docs/migration-notes/${sagaName}-saga-pattern.md`,
      content: SagaGenerator.genMigrationNote(sagaName, involvedServices, methodName),
      category: "migration_note",
      technology: "SAGA",
    });

    return files;
  }

  private static genSagaStatus(pkg: string, sagaClassName: string): string {
    return `package ${pkg}.saga;

/** Statut d'execution du Saga. */
public enum ${sagaClassName}Status {
    STARTED,
    IN_PROGRESS,
    COMPLETED,
    COMPENSATING,
    COMPENSATED,
    FAILED
}
`;
  }

  private static genSagaStepInterface(pkg: string): string {
    return `package ${pkg}.saga;

/**
 * Interface generique pour un step de Saga.
 * Chaque step a une action (execute) et une compensation (compensate).
 */
public interface SagaStep<T> {

    /** Nom du step pour le logging/monitoring. */
    String getName();

    /** Execute l'action principale. Retourne le resultat ou lance une exception. */
    T execute(Object context) throws Exception;

    /** Compense l'action en cas d'echec d'un step suivant. */
    void compensate(Object context) throws Exception;
}
`;
  }

  private static genSagaStep(pkg: string, stepName: string, serviceName: string): string {
    const fieldName = serviceName.charAt(0).toLowerCase() + serviceName.slice(1);

    return `package ${pkg}.saga.steps;

import ${pkg}.saga.SagaStep;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Saga Step pour ${serviceName}.
 * Execute l'operation et fournit la compensation en cas de rollback.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ${stepName} implements SagaStep<Object> {

    // TODO: Injecter le service reel
    // private final ${serviceName} ${fieldName};

    @Override
    public String getName() {
        return "${stepName}";
    }

    @Override
    public Object execute(Object context) throws Exception {
        log.info("[SAGA] Executing step: {}", getName());
        // TODO: Implementer l'action principale
        // Exemple: ${fieldName}.create(...)
        return null;
    }

    @Override
    public void compensate(Object context) throws Exception {
        log.warn("[SAGA] Compensating step: {}", getName());
        // TODO: Implementer la compensation (rollback logique)
        // Exemple: ${fieldName}.delete(...)
    }
}
`;
  }

  private static genOrchestrator(
    pkg: string,
    orchestratorName: string,
    sagaClassName: string,
    involvedServices: string[],
    methodName: string
  ): string {
    const stepFields = involvedServices.map(svc => {
      const stepName = svc.replace(/Service$|Repository$|Dao$|DAO$|Facade$|Manager$/, "") + "Step";
      const fieldName = stepName.charAt(0).toLowerCase() + stepName.slice(1);
      return { stepName, fieldName };
    });

    const fieldDeclarations = stepFields.map(s => `    private final ${s.stepName} ${s.fieldName};`).join("\n");
    const stepList = stepFields.map(s => s.fieldName).join(", ");
    const imports = stepFields.map(s => `import ${pkg}.saga.steps.${s.stepName};`).join("\n");

    return `package ${pkg}.saga;

import java.util.ArrayList;
import java.util.List;
${imports}
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Saga Orchestrator pour la transaction distribuee "${methodName}".
 * 
 * Remplace le @Transactional monolithique par un pattern Saga
 * avec compensation automatique en cas d'echec.
 * 
 * Services impliques: ${involvedServices.join(", ")}
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ${orchestratorName} {

${fieldDeclarations}

    /**
     * Execute le saga complet.
     * En cas d'echec a une etape, compense toutes les etapes precedentes.
     */
    public void ${methodName}(Object context) {
        List<SagaStep<?>> steps = List.of(${stepList});
        List<SagaStep<?>> completedSteps = new ArrayList<>();
        ${sagaClassName}Status status = ${sagaClassName}Status.STARTED;

        log.info("[SAGA] Demarrage du saga ${sagaClassName} - {} steps", steps.size());

        try {
            status = ${sagaClassName}Status.IN_PROGRESS;
            for (SagaStep<?> step : steps) {
                log.info("[SAGA] Execution step: {}", step.getName());
                step.execute(context);
                completedSteps.add(step);
            }
            status = ${sagaClassName}Status.COMPLETED;
            log.info("[SAGA] Saga ${sagaClassName} termine avec succes");

        } catch (Exception e) {
            log.error("[SAGA] Echec au step - demarrage compensation", e);
            status = ${sagaClassName}Status.COMPENSATING;

            // Compenser dans l'ordre inverse
            for (int i = completedSteps.size() - 1; i >= 0; i--) {
                try {
                    SagaStep<?> step = completedSteps.get(i);
                    log.info("[SAGA] Compensation step: {}", step.getName());
                    step.compensate(context);
                } catch (Exception compensationError) {
                    log.error("[SAGA] Echec compensation step {}", completedSteps.get(i).getName(), compensationError);
                    status = ${sagaClassName}Status.FAILED;
                    throw new RuntimeException("Saga compensation failed", compensationError);
                }
            }
            status = ${sagaClassName}Status.COMPENSATED;
            log.warn("[SAGA] Saga ${sagaClassName} compense avec succes");
            throw new RuntimeException("Saga rolled back: " + e.getMessage(), e);
        }
    }
}
`;
  }

  private static genMigrationNote(sagaName: string, involvedServices: string[], methodName: string): string {
    return `# Pattern Saga: ${sagaName}

## Pourquoi un Saga ?
La methode \`${methodName}\` utilisait un \`@Transactional\` monolithique qui appelait
plusieurs services dans la meme transaction. En architecture microservices, chaque service
a sa propre base de donnees — un \`@Transactional\` ne peut plus couvrir plusieurs services.

## Pattern applique : Saga Orchestrator
- Un **orchestrateur** coordonne les etapes sequentiellement
- Chaque **step** a une action (execute) et une compensation (compensate)
- En cas d'echec, les steps precedents sont compenses dans l'ordre inverse

## Services impliques
${involvedServices.map(s => `- ${s}`).join("\n")}

## Architecture
\`\`\`
[Client] -> [SagaOrchestrator]
                |
                +--> [Step 1: ${involvedServices[0] || "ServiceA"}] -- execute / compensate
                +--> [Step 2: ${involvedServices[1] || "ServiceB"}] -- execute / compensate
                ${involvedServices.length > 2 ? `+--> [Step 3: ${involvedServices[2]}] -- execute / compensate` : ""}
\`\`\`

## Alternatives considerees
| Pattern | Quand l'utiliser |
|---------|-----------------|
| **Saga Orchestrator** (choisi) | Flux complexe, besoin de visibilite centralisee |
| Saga Choreography | Services faiblement couples, evenements simples |
| 2PC (Two-Phase Commit) | Rarement en microservices (performance) |

## TODO
- [ ] Implementer les methodes execute() et compensate() de chaque Step
- [ ] Ajouter le monitoring/tracing (Spring Sleuth/Micrometer)
- [ ] Ajouter un mecanisme de retry avec backoff exponentiel
- [ ] Persister l'etat du Saga pour recovery apres crash
`;
  }
}
