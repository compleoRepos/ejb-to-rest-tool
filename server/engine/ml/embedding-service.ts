/**
 * EmbeddingService — Compleo v7.0 ML Layer
 *
 * Gère l'indexation et la recherche de paires de migration EJB→Spring
 * via ChromaDB (vector store) et Ollama (embeddings).
 *
 * Dépendances externes (optionnelles, via fetch) :
 *   - ChromaDB : http://localhost:8001 (vector store)
 *   - Ollama   : http://localhost:11434 (embedding model nomic-embed-text)
 *
 * Si les services ne sont pas disponibles, les opérations échouent
 * silencieusement et le MLEnhancer bascule sur le mode rule-based.
 */

// ── Types ────────────────────────────────────────────────────────

export interface MigrationPair {
  id:         string;
  ejbCode:    string;
  springCode: string;
  meta: {
    className:  string;
    methodName: string;
    javaType:   string;
    hasOracle:  boolean;
    hasJms:     boolean;
  };
}

interface ChromaQueryResult {
  ids:        string[][];
  documents:  (string | null)[][];
  metadatas:  (Record<string, unknown> | null)[][];
  distances?: number[][];
}

// ── Service ──────────────────────────────────────────────────────

export class EmbeddingService {
  private chromaUrl:      string;
  private ollamaUrl:      string;
  private collectionName: string;
  private initialized:    boolean = false;

  constructor(chromaUrl: string, ollamaUrl: string) {
    this.chromaUrl      = chromaUrl.replace(/\/$/, "");
    this.ollamaUrl      = ollamaUrl.replace(/\/$/, "");
    this.collectionName = "migration-examples";
  }

  /**
   * Initialize the ChromaDB collection.
   * Creates it if it doesn't exist.
   */
  async initialize(): Promise<void> {
    // Create or get the collection via ChromaDB REST API
    const res = await fetch(`${this.chromaUrl}/api/v1/collections`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        name:             this.collectionName,
        get_or_create:    true,
      }),
    });

    if (!res.ok) {
      throw new Error(`ChromaDB init failed: ${res.status} ${await res.text()}`);
    }

    this.initialized = true;

    // Log the count
    const countRes = await fetch(
      `${this.chromaUrl}/api/v1/collections/${this.collectionName}/count`
    );
    if (countRes.ok) {
      const count = await countRes.json();
      console.log(`ChromaDB: ${count} exemples indexés`);
    }
  }

  /**
   * Generate an embedding vector for the given text using Ollama.
   */
  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.ollamaUrl}/api/embeddings`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        model:  "nomic-embed-text",
        prompt: text.substring(0, 2000), // limiter la taille
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama embed failed: ${res.status}`);
    }

    const data = await res.json() as { embedding: number[] };
    return data.embedding;
  }

  /**
   * Index a migration pair (EJB→Spring) in ChromaDB for later retrieval.
   */
  async indexPair(pair: MigrationPair): Promise<void> {
    if (!this.initialized) {
      throw new Error("EmbeddingService not initialized — call initialize() first");
    }

    const embedding = await this.embed(pair.ejbCode);

    const res = await fetch(
      `${this.chromaUrl}/api/v1/collections/${this.collectionName}/upsert`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          ids:        [pair.id],
          embeddings: [embedding],
          documents:  [pair.ejbCode],
          metadatas:  [{
            springCode: pair.springCode,
            className:  pair.meta.className,
            methodName: pair.meta.methodName,
            javaType:   pair.meta.javaType,
            hasOracle:  pair.meta.hasOracle,
            hasJms:     pair.meta.hasJms,
          }],
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`ChromaDB upsert failed: ${res.status}`);
    }
  }

  /**
   * Find the most similar migration examples to the given EJB code.
   */
  async findSimilar(
    ejbCode: string,
    topK = 3
  ): Promise<MigrationPair[]> {
    if (!this.initialized) {
      throw new Error("EmbeddingService not initialized — call initialize() first");
    }

    const embedding = await this.embed(ejbCode);

    const res = await fetch(
      `${this.chromaUrl}/api/v1/collections/${this.collectionName}/query`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          query_embeddings: [embedding],
          n_results:        topK,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`ChromaDB query failed: ${res.status}`);
    }

    const results = await res.json() as ChromaQueryResult;

    return (results.ids[0] ?? []).map((id: string, i: number) => ({
      id,
      ejbCode:    results.documents[0]?.[i] ?? "",
      springCode: (results.metadatas[0]?.[i] as Record<string, unknown>)?.springCode as string ?? "",
      meta: {
        className:  (results.metadatas[0]?.[i] as Record<string, unknown>)?.className as string ?? "",
        methodName: (results.metadatas[0]?.[i] as Record<string, unknown>)?.methodName as string ?? "",
        javaType:   (results.metadatas[0]?.[i] as Record<string, unknown>)?.javaType as string ?? "",
        hasOracle:  (results.metadatas[0]?.[i] as Record<string, unknown>)?.hasOracle as boolean ?? false,
        hasJms:     (results.metadatas[0]?.[i] as Record<string, unknown>)?.hasJms as boolean ?? false,
      },
    }));
  }

  /**
   * Check if the service is initialized and ready.
   */
  isReady(): boolean {
    return this.initialized;
  }
}
