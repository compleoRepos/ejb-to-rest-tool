/**
 * GenerationService — Compleo v7.0 ML Layer
 *
 * Utilise un LLM local (Ollama) pour améliorer le code Spring Boot
 * généré par le moteur de règles. Le LLM reçoit :
 *   - Le code EJB source
 *   - Le code rule-based généré
 *   - Des exemples similaires (RAG via EmbeddingService)
 *
 * Dépendance externe (optionnelle, via fetch) :
 *   - Ollama : http://localhost:11434 (modèle deepseek-coder)
 *
 * Si Ollama n'est pas disponible, retourne le code rule-based
 * avec confidence 0.5 et source "rules".
 */

import type { MigrationPair } from "./embedding-service";

// ── Types ────────────────────────────────────────────────────────

export interface MLGenerationResult {
  code:       string;
  confidence: number;
  source:     "ml" | "rules";
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
   * Falls back to rule-based code if Ollama is unavailable.
   */
  async improveServiceMethod(
    ejbCode:         string,
    ruleBasedCode:   string,
    similarExamples: MigrationPair[],
    methodName:      string,
    voInType:        string | null,
    voOutType:       string | null
  ): Promise<MLGenerationResult> {

    const prompt = this.buildPrompt(
      ejbCode, ruleBasedCode, similarExamples,
      methodName, voInType, voOutType
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
      const checked = this.validate(code, methodName, voInType, voOutType);

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
   * Build the prompt for the LLM with RAG examples.
   */
  buildPrompt(
    ejbCode:         string,
    ruleBasedCode:   string,
    examples:        MigrationPair[],
    methodName:      string,
    voInType:        string | null,
    voOutType:       string | null
  ): string {
    const exSection = examples.length > 0
      ? `## Exemples de migrations similaires réussies\n\n` +
        examples.map((ex, i) => `
### Exemple ${i + 1}
EJB:
\`\`\`java
${ex.ejbCode.substring(0, 600)}
\`\`\`
Spring Boot généré:
\`\`\`java
${ex.springCode.substring(0, 600)}
\`\`\`
`).join("\n")
      : "";

    return `Tu es un expert Java EE → Spring Boot.
Le moteur de règles a généré ce code mais il est incomplet.
Améliore-le en t'inspirant des exemples et du code EJB source.

${exSection}

## Code EJB source
\`\`\`java
${ejbCode.substring(0, 800)}
\`\`\`

## Code généré à améliorer
\`\`\`java
${ruleBasedCode}
\`\`\`

## Règles strictes
1. Signature complète : public ${voOutType ?? "void"} ${methodName}(${voInType ? voInType + " request" : ""})
2. JAMAIS Void.builder() — utiliser un vrai DTO
3. Constantes SQL = private static final au niveau classe
4. Garder le SQL original dans des commentaires
5. TODO explicite là où une implémentation manuelle est nécessaire

Génère uniquement le corps de la méthode améliorée :
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
   * Validate the generated code and compute a confidence score.
   */
  validate(
    code:       string,
    methodName: string,
    voInType:   string | null,
    voOutType:  string | null
  ): MLGenerationResult {
    const warnings: string[] = [];
    let confidence = 0.9;
    let validatedCode = code;

    if (validatedCode.includes("Void.builder()")) {
      warnings.push("Void.builder() détecté — code rule-based préféré");
      confidence -= 0.4;
    }
    if (voInType && !validatedCode.includes(voInType)) {
      warnings.push(`${voInType} absent de la signature`);
      confidence -= 0.2;
    }
    if (/public\s+\w+\s+\w*\/\w*\(/.test(validatedCode)) {
      warnings.push("Slash dans nom de méthode — corrigé");
      validatedCode = validatedCode.replace(/(\w+)\/(\w+)\(/g, "$2(");
      confidence -= 0.1;
    }

    return {
      code: validatedCode,
      confidence: Math.max(0, confidence),
      source:     confidence >= 0.6 ? "ml" : "rules",
      warnings,
    };
  }
}
