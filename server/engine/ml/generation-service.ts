/**
 * GenerationService — Compleo v7.3 ML Layer
 *
 * Utilise un LLM local (Ollama) pour améliorer le code Spring Boot
 * généré par le moteur de règles. Le LLM reçoit :
 *   - Le code EJB source
 *   - Le code rule-based généré
 *   - La signature EJB source complète (v7.3)
 *   - Des exemples similaires (RAG via EmbeddingService)
 *
 * v7.3: EJBSignature remplace methodName/voInType/voOutType.
 *       Le prompt inclut la signature EJB source comme référence
 *       authoritative, et la validation vérifie les paramètres
 *       et le type retour.
 *
 * Dépendance externe (optionnelle, via fetch) :
 *   - Ollama : http://localhost:11434 (modèle deepseek-coder)
 */

import type { MigrationPair } from "./embedding-service";
import type { EJBSignature } from "./ml-enhancer";

// ── Types ────────────────────────────────────────────────────────

export interface MLGenerationResult {
  code:       string;
  confidence: number;
  source:     "ml" | "rules" | "rules-corrected";
  warnings:   string[];
}

// ── Service ──────────────────────────────────────────────────────

export class GenerationService {
  private ollamaUrl: string;
  private model:     string;

  constructor(
    ollamaUrl: string,
    model = "deepseek-coder:6.7b-instruct-q4_K_M"
  ) {
    this.ollamaUrl = ollamaUrl.replace(/\/$/, "");
    this.model     = model;
  }

  /**
   * Improve a rule-based service method using the LLM.
   *
   * v7.3: Accepts EJBSignature instead of individual voInType/voOutType.
   * Falls back to rule-based code if Ollama is unavailable.
   */
  async improveServiceMethod(
    ejbCode:         string,
    ruleBasedCode:   string,
    similarExamples: MigrationPair[],
    signature:       EJBSignature
  ): Promise<MLGenerationResult> {

    const prompt = this.buildPrompt(
      ejbCode, ruleBasedCode, similarExamples, signature
    );

    try {
      const res = await fetch(`${this.ollamaUrl}/api/generate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          model:   this.model,
          prompt,
          stream:  false,
          options: {
            temperature: 0.1,
            num_predict: 800,
            stop:        ["```", "// END_METHOD"],
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Ollama generate failed: ${res.status}`);
      }

      const data    = await res.json() as { response: string };
      const code    = this.extractCode(data.response);
      const checked = this.validate(code, signature);

      return checked;

    } catch (e) {
      // Ollama indisponible → retourner le code rule-based
      return {
        code:       ruleBasedCode,
        confidence: 0.5,
        source:     "rules",
        warnings:   [`Ollama indisponible: ${e}`],
      };
    }
  }

  /**
   * Build the prompt for the LLM with RAG examples and EJB signature.
   *
   * v7.3: The signature section tells the LLM exactly what the
   * Spring Boot method MUST have (name, params, return type).
   */
  buildPrompt(
    ejbCode:         string,
    ruleBasedCode:   string,
    examples:        MigrationPair[],
    signature:       EJBSignature
  ): string {

    // Section signature — dit explicitement au LLM ce qui est attendu
    const paramsStr = signature.params.length > 0
      ? signature.params.map(p => `${p.type} ${p.name}`).join(", ")
      : "aucun";

    const springReturn = inferSpringReturnType(signature.returnType);

    const signatureSection = `## Signature EJB source (référence authoritative)

Classe : ${signature.className} (${signature.javaType})
Méthode : ${signature.methodName}
Paramètres : ${paramsStr}
Retour : ${signature.returnType}

La méthode Spring Boot DOIT avoir :
- Nom : ${signature.methodName}
- Paramètre(s) : ${paramsStr}
- Type de retour : ${springReturn}
- Jamais : void si returnType != void dans le EJB
- Jamais : Object comme type de retour
- Jamais : méthode sans paramètre si le EJB en a un
`;

    const exSection = examples.length > 0
      ? `## Exemples de migrations similaires réussies\n\n` +
        examples.map((ex, i) => `
### Exemple ${i + 1}
EJB:
\`\`\`java
${ex.ejbCode.substring(0, 500)}
\`\`\`
Spring Boot:
\`\`\`java
${ex.springCode.substring(0, 500)}
\`\`\`
`).join("\n")
      : "";

    return `Tu es un expert Java EE → Spring Boot 3.2.

${signatureSection}

${exSection}

## Code EJB à migrer
\`\`\`java
${ejbCode.substring(0, 800)}
\`\`\`

## Code rule-based généré (peut contenir des erreurs)
\`\`\`java
${ruleBasedCode}
\`\`\`

## Règles strictes
1. Respecter EXACTEMENT la signature EJB source ci-dessus
2. Si le rule-based a un paramètre manquant → l'ajouter
3. Si le rule-based retourne void alors que le EJB retourne autre chose → corriger
4. SQL constants = private static final au niveau classe
5. Jamais Object comme type de retour
6. Jamais Void.builder()

Génère la méthode Spring Boot corrigée :
\`\`\`java
`;
  }

  /**
   * Extract Java code from the LLM response.
   */
  extractCode(response: string): string {
    const match = response.match(/```java\s*([\s\S]*?)(?:```|$)/);
    if (match) return match[1].trim();
    const lastBrace = response.lastIndexOf("}");
    return lastBrace > 0
      ? response.substring(0, lastBrace + 1)
      : response;
  }

  /**
   * Validate the generated code against the EJB signature.
   *
   * v7.3: Checks each parameter and the return type against
   * the authoritative EJB signature. If confidence drops below 0.5,
   * generates a fallback stub from the signature.
   */
  validate(
    code:      string,
    signature: EJBSignature
  ): MLGenerationResult {
    const warnings: string[] = [];
    let confidence = 0.9;
    let validatedCode = code;

    // Vérif 1 — Void.builder() invalide
    if (validatedCode.includes("Void.builder()")) {
      warnings.push("Void.builder() détecté — code invalide");
      confidence -= 0.4;
    }

    // Vérif 2 — chaque paramètre EJB doit être dans la signature Spring
    for (const param of signature.params) {
      if (!validatedCode.includes(param.name) && !validatedCode.includes(param.type)) {
        warnings.push(`Paramètre manquant: ${param.type} ${param.name}`);
        confidence -= 0.25;
      }
    }

    // Vérif 3 — type de retour cohérent
    const expectedReturn = inferSpringReturnType(signature.returnType);
    if (expectedReturn !== "void" && !validatedCode.includes(expectedReturn)) {
      warnings.push(`Type de retour incorrect. Attendu: ${expectedReturn}`);
      confidence -= 0.2;
    }

    // Vérif 4 — pas de Object comme type retour
    if (/public\s+Object\s+\w+\s*\(/.test(validatedCode)) {
      warnings.push("public Object détecté — type non acceptable");
      confidence -= 0.3;
    }

    // Vérif 5 — slash dans nom de méthode
    if (/public\s+\w+\s+\w*\/\w*\(/.test(validatedCode)) {
      warnings.push("Slash dans nom de méthode — corrigé");
      validatedCode = validatedCode.replace(/(\w+)\/(\w+)\(/g, "$2(");
      confidence -= 0.1;
    }

    // Si confiance trop basse → forcer le code rule-based corrigé
    if (confidence < 0.5) {
      return {
        code:       this.buildFallbackCode(signature),
        confidence: 0.5,
        source:     "rules-corrected",
        warnings,
      };
    }

    return {
      code: validatedCode,
      confidence: Math.max(0, confidence),
      source: confidence >= 0.6 ? "ml" : "rules",
      warnings,
    };
  }

  /**
   * Build a correct stub from the EJB signature when ML output
   * fails validation. Ensures the method has the right name,
   * parameters, and return type.
   */
  private buildFallbackCode(signature: EJBSignature): string {
    const springReturn = inferSpringReturnType(signature.returnType);
    const params = signature.params
      .map(p => `${p.type} ${p.name}`)
      .join(", ");

    return `    @Transactional
    public ${springReturn} ${signature.methodName}(${params}) {
        log.info("${signature.methodName}: {}", ${signature.params[0]?.name ?? '""'});
        // TODO: Migrer la logique depuis ${signature.className}.${signature.methodName}
        throw new UnsupportedOperationException("Migration en cours");
    }`;
  }
}

// ── Utility ─────────────────────────────────────────────────────

/**
 * Infer the Spring Boot return type from the EJB return type.
 * Maps common Java EE types to Spring equivalents.
 */
function inferSpringReturnType(ejbReturnType: string): string {
  if (!ejbReturnType || ejbReturnType === "void" || ejbReturnType === "Void") {
    return "void";
  }
  if (ejbReturnType === "Object") {
    // Object is never acceptable — will be flagged by validation
    return "Object";
  }
  // Keep the type as-is for standard Java types
  return ejbReturnType;
}
