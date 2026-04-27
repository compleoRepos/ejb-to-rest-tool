/**
 * Saga ML Prompts — Compleo v7.10
 *
 * Templates de prompts pour l'enrichissement ML des steps Saga.
 * Chaque prompt est ancré sur les données réelles extraites du code EJB source
 * pour minimiser les hallucinations.
 *
 * Modèle cible : qwen2.5:1.5b (Ollama local)
 *
 * @author Compleo
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface StepContext {
  /** Numéro du step (1, 2, 3...) */
  stepNumber: number;
  /** Label humain du step */
  stepLabel: string;
  /** Type du step (validation, query, command, async) */
  stepType: string;
  /** Le step est-il compensable ? */
  isCompensable: boolean;
  /** Service cible (null si local) */
  targetService: string | null;
  /** Méthode cible */
  targetMethod: string;
  /** Code source EJB original (extrait autour du step) */
  ejbSourceCode: string;
  /** Liste des services disponibles dans le projet */
  availableServices: string[];
  /** Champs de contexte déjà disponibles (produits par les steps précédents) */
  availableContext: string[];
  /** Exceptions connues dans le code EJB */
  availableExceptions: string[];
  /** Requêtes SQL détectées dans le code EJB */
  sqlStatements: string[];
}

export interface MLStepEnrichment {
  /** Corps Java du step (logique métier migrée) */
  stepBody: string;
  /** Corps Java de la compensation (action inverse) */
  compensationBody: string;
  /** Champs de contexte produits par ce step */
  contextFields: Array<{ name: string; type: string }>;
  /** Recommandation de retry policy */
  retryRecommendation: string;
  /** Préconditions (vérifications avant exécution) */
  preconditions: string[];
  /** Postconditions (garanties après exécution) */
  postconditions: string[];
}

// ── Prompt Builders ─────────────────────────────────────────────────────────

/**
 * Construit le prompt pour enrichir le corps d'un step.
 * Le prompt est structuré pour forcer une réponse JSON parseable.
 */
export function buildStepBodyPrompt(ctx: StepContext): string {
  const servicesStr = ctx.availableServices.length > 0
    ? ctx.availableServices.join(", ")
    : "aucun service externe";

  const contextStr = ctx.availableContext.length > 0
    ? ctx.availableContext.join(", ")
    : "aucun champ disponible";

  const exceptionsStr = ctx.availableExceptions.length > 0
    ? ctx.availableExceptions.join(", ")
    : "exceptions standard Java";

  const sqlStr = ctx.sqlStatements.length > 0
    ? ctx.sqlStatements.map(s => `  - ${s.substring(0, 200)}`).join("\n")
    : "  - aucune requête SQL détectée";

  return `Tu es un expert Java EE → Spring Boot 3.2 spécialisé dans la migration bancaire.

## Contexte
Step ${ctx.stepNumber} "${ctx.stepLabel}" de type ${ctx.stepType}.
Service cible : ${ctx.targetService || "local (même microservice)"}.
Méthode cible : ${ctx.targetMethod}.
Compensable : ${ctx.isCompensable ? "OUI" : "NON"}.

## Services disponibles (SEULS services autorisés)
${servicesStr}

## Champs de contexte disponibles (produits par les steps précédents)
${contextStr}

## Exceptions connues
${exceptionsStr}

## Requêtes SQL détectées dans le code EJB
${sqlStr}

## Code EJB source (référence authoritative)
\`\`\`java
${ctx.ejbSourceCode.substring(0, 1500)}
\`\`\`

## Règles STRICTES
1. Utiliser UNIQUEMENT les services listés ci-dessus — JAMAIS de service inventé
2. JAMAIS de JDBC direct (Connection, PreparedStatement, ResultSet, DriverManager)
3. Utiliser Spring Data JPA ou les services injectés pour l'accès aux données
4. Les types Java doivent être standards (BigDecimal, String, Long, etc.) ou des DTO existants
5. Respecter les noms de méthodes et services tels qu'ils apparaissent dans le code EJB
6. Si compensable, la compensation DOIT être l'action inverse concrète (pas un TODO)

## Format de réponse (JSON strict)
Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après :
{
  "stepBody": "// corps Java du step (3-15 lignes)",
  "compensationBody": "${ctx.isCompensable ? '// corps Java de la compensation (action inverse)' : '// non compensable'}",
  "contextFields": [{"name": "nomChamp", "type": "TypeJava"}],
  "retryRecommendation": "${getDefaultRetryHint(ctx)}",
  "preconditions": ["condition avant exécution"],
  "postconditions": ["garantie après exécution"]
}`;
}

/**
 * Construit le prompt pour enrichir la compensation d'un step.
 * Utilisé quand le step est compensable et que le prompt principal
 * n'a pas produit une compensation satisfaisante.
 */
export function buildCompensationPrompt(ctx: StepContext): string {
  return `Tu es un expert en patterns Saga pour systèmes bancaires.

## Contexte
Step "${ctx.stepLabel}" de type ${ctx.stepType}.
Service : ${ctx.targetService || "local"}.
Méthode : ${ctx.targetMethod}.

## Code EJB source
\`\`\`java
${ctx.ejbSourceCode.substring(0, 1000)}
\`\`\`

## Requêtes SQL détectées
${ctx.sqlStatements.map(s => `- ${s.substring(0, 150)}`).join("\n") || "- aucune"}

## Règles STRICTES
1. La compensation DOIT être l'action inverse concrète du step
2. Pour un INSERT → DELETE ou UPDATE status='ANNULÉ'
3. Pour un UPDATE montant → UPDATE montant inverse (contre-passation)
4. Pour un appel service.method() → service.annulerMethod() ou service.rollbackMethod()
5. La compensation DOIT être idempotente (exécutable plusieurs fois sans effet)
6. JAMAIS de INSERT dans une compensation (sauf écriture comptable de contre-passation)
7. JAMAIS de JDBC direct

## Format de réponse (JSON strict)
{
  "compensationBody": "// corps Java de la compensation (3-10 lignes)",
  "isIdempotent": true
}`;
}

/**
 * Construit le prompt pour analyser les exceptions et recommander un retry policy.
 */
export function buildRetryAnalysisPrompt(ctx: StepContext): string {
  return `Tu es un expert en résilience pour systèmes distribués bancaires.

## Contexte
Step "${ctx.stepLabel}" de type ${ctx.stepType}.
Service : ${ctx.targetService || "local"}.

## Exceptions connues dans le code
${ctx.availableExceptions.join(", ") || "aucune exception spécifique"}

## Question
Quel RetryPolicy est le plus adapté pour ce step ?
Options : forLocalDb(), forRemoteService(), forExternalGateway(), forAsync(), forCompensation()

## Format de réponse (JSON strict)
{
  "retryPolicy": "RetryPolicy.forXxx()",
  "reason": "explication courte"
}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Retourne un hint de retry par défaut basé sur le type de step.
 * Utilisé comme valeur par défaut dans le prompt.
 */
function getDefaultRetryHint(ctx: StepContext): string {
  if (ctx.stepType === "async") return "RetryPolicy.forAsync()";
  if (!ctx.targetService) return "RetryPolicy.forLocalDb()";
  if (/SWIFT|TARGET2|SEPA|pain|gateway/i.test(ctx.stepLabel)) {
    return "RetryPolicy.forExternalGateway()";
  }
  return "RetryPolicy.forRemoteService()";
}

/**
 * Parse la réponse JSON du LLM.
 * Tolère les blocs ```json``` et le texte autour.
 */
export function parseMLResponse<T>(raw: string): T | null {
  try {
    // Tenter le parse direct
    return JSON.parse(raw) as T;
  } catch {
    // Extraire le JSON d'un bloc ```json```
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim()) as T;
      } catch {
        // Continuer
      }
    }

    // Extraire le premier objet JSON trouvé
    const objMatch = raw.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]) as T;
      } catch {
        return null;
      }
    }

    return null;
  }
}
