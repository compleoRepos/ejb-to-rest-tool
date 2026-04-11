/**
 * MLEnhancer — Compleo v7.3 ML Layer
 *
 * Orchestrateur de la couche ML. Point d'entrée unique pour :
 *   - Améliorer le code généré par les règles via LLM + RAG
 *   - Indexer des exemples de migration réussis
 *
 * v7.3: EJBSignature remplace methodName/voInType/voOutType
 *       pour donner au LLM la signature EJB source complète
 *       (paramètres, type retour, classe, type Java).
 *
 * Le ML est optionnel et désactivé par défaut.
 * Si Ollama/ChromaDB ne sont pas disponibles, le code rule-based
 * est retourné sans modification.
 */

import { EmbeddingService } from "./embedding-service";
import { GenerationService } from "./generation-service";

// ── Types ────────────────────────────────────────────────────────

export interface MLConfig {
  enabled:        boolean;
  ollamaUrl:      string;
  chromaUrl:      string;
  model?:         string;
  minConfidence?: number;
}

export interface EnhanceResult {
  code:   string;
  source: "ml" | "rules" | "rules-corrected";
}

/**
 * Signature EJB source — référence authoritative pour le LLM.
 * Contient toutes les informations nécessaires pour valider
 * que le code généré respecte la signature originale.
 */
export interface EJBSignature {
  methodName:  string;
  params:      Array<{ name: string; type: string }>;
  returnType:  string;
  className:   string;
  javaType:    string;   // EJB3X, EJB2X, SERVLET, BATCH, etc.
}

// ── Enhancer ─────────────────────────────────────────────────────

export class MLEnhancer {
  private embedding:     EmbeddingService;
  private generation:    GenerationService;
  private _enabled:      boolean;
  private minConfidence: number;

  constructor(config: MLConfig) {
    this._enabled      = config.enabled;
    this.minConfidence = config.minConfidence ?? 0.6;
    this.embedding     = new EmbeddingService(
      config.chromaUrl, config.ollamaUrl
    );
    this.generation    = new GenerationService(
      config.ollamaUrl, config.model
    );
  }

  /**
   * Initialize the ML services (ChromaDB connection).
   * If initialization fails, ML is disabled gracefully.
   */
  async initialize(): Promise<void> {
    if (!this._enabled) return;
    try {
      await this.embedding.initialize();
      console.log("ML Enhancer prêt");
    } catch (e) {
      console.warn(`ML Enhancer init échoué (Ollama dispo ?): ${e}`);
      this._enabled = false;
    }
  }

  /**
   * Check if ML enhancement is enabled and ready.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Enhance rule-based code using LLM + RAG.
   *
   * v7.3: Accepts EJBSignature instead of individual voInType/voOutType.
   * The signature is passed to the LLM prompt and used for post-validation.
   *
   * Overload 1 (v7.3): ejbCode, ruleCode, ejbSignature
   * Overload 2 (legacy): ejbCode, ruleCode, methodName, voInType, voOutType
   *
   * @returns Enhanced code and its source ("ml", "rules", or "rules-corrected")
   */
  async enhance(
    ejbCode:    string,
    ruleCode:   string,
    ejbSignatureOrMethodName: EJBSignature | string,
    voInType?:  string | null,
    voOutType?: string | null
  ): Promise<EnhanceResult> {

    // Build EJBSignature from legacy args if needed
    const signature: EJBSignature = typeof ejbSignatureOrMethodName === "string"
      ? {
          methodName: ejbSignatureOrMethodName,
          params: voInType ? [{ name: "request", type: voInType }] : [],
          returnType: voOutType ?? "void",
          className: "Unknown",
          javaType: "UNKNOWN",
        }
      : ejbSignatureOrMethodName;

    // ML désactivé ou non disponible → retourner le rule-based
    if (!this._enabled) {
      return { code: ruleCode, source: "rules" };
    }

    try {
      // 1. Chercher des exemples similaires via RAG
      const similar = await this.embedding.findSimilar(ejbCode, 3);

      // 2. Améliorer avec le LLM (v7.3: passe la signature complète)
      const result = await this.generation.improveServiceMethod(
        ejbCode, ruleCode, similar, signature
      );

      if (result.warnings.length > 0) {
        console.warn(`ML warnings [${signature.methodName}]:`, result.warnings);
      }

      // 3. Retourner ML si confiance suffisante, sinon rule-based
      if (result.confidence >= this.minConfidence) {
        return { code: result.code, source: result.source };
      }
      return { code: ruleCode, source: "rules" };

    } catch (e) {
      console.warn(`ML enhance failed [${signature.methodName}]: ${e}`);
      return { code: ruleCode, source: "rules" };
    }
  }

  /**
   * Index a successful migration example for future RAG retrieval.
   */
  async indexExample(
    ejbCode:    string,
    springCode: string,
    meta: {
      className:  string;
      methodName: string;
      javaType:   string;
      hasOracle:  boolean;
      hasJms:     boolean;
    }
  ): Promise<void> {
    if (!this._enabled) return;
    try {
      await this.embedding.indexPair({
        id:         `${meta.className}-${meta.methodName}`,
        ejbCode,
        springCode,
        meta,
      });
    } catch (e) {
      console.warn("Index example failed:", e);
    }
  }
}
