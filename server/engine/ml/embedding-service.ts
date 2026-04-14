/**
 * EmbeddingService — Compleo v7.9.2 ML Layer
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
 *
 * Supporte ChromaDB v1 ET v2 (détection automatique).
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
  private apiVersion:     "v1" | "v2" = "v1";
  private collectionId:   string | null = null;

  constructor(chromaUrl: string, ollamaUrl: string) {
    this.chromaUrl      = chromaUrl.replace(/\/$/, "");
    this.ollamaUrl      = ollamaUrl.replace(/\/$/, "");
    this.collectionName = "migration-examples";
  }

  /**
   * Detect ChromaDB API version (v1 or v2).
   * Tries v2 heartbeat first, falls back to v1.
   */
  private async detectApiVersion(): Promise<"v1" | "v2"> {
    try {
      const v2 = await fetch(`${this.chromaUrl}/api/v2/heartbeat`, {
        signal: AbortSignal.timeout(3000),
      });
      if (v2.ok) return "v2";
    } catch { /* v2 not available */ }

    try {
      const v1 = await fetch(`${this.chromaUrl}/api/v1/heartbeat`, {
        signal: AbortSignal.timeout(3000),
      });
      if (v1.ok) return "v1";
    } catch { /* v1 not available either */ }

    // Default to v2 (latest ChromaDB images)
    return "v2";
  }

  /**
   * Build the ChromaDB API base path for the detected version.
   */
  private get apiBase(): string {
    return `${this.chromaUrl}/api/${this.apiVersion}`;
  }

  /**
   * Initialize the ChromaDB collection.
   * Creates it if it doesn't exist.
   * Auto-detects ChromaDB API version (v1 or v2).
   */
  async initialize(): Promise<void> {
    // Step 1: Detect API version
    this.apiVersion = await this.detectApiVersion();
    console.log(`ChromaDB: detected API ${this.apiVersion}`);

    // Step 2: Create or get the collection
    if (this.apiVersion === "v2") {
      await this.initializeV2();
    } else {
      await this.initializeV1();
    }

    this.initialized = true;

    // Step 3: Log the count
    await this.logCount();
  }

  /**
   * ChromaDB v1 initialization (legacy).
   */
  private async initializeV1(): Promise<void> {
    const res = await fetch(`${this.apiBase}/collections`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        name:          this.collectionName,
        get_or_create: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`ChromaDB v1 init failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json() as { id?: string };
    this.collectionId = data.id ?? null;
  }

  /**
   * ChromaDB v2 initialization.
   * v2 uses /api/v2/tenants/default_tenant/databases/default_database/collections
   */
  private async initializeV2(): Promise<void> {
    const baseCollections = `${this.apiBase}/tenants/default_tenant/databases/default_database/collections`;

    // Try to get existing collection first
    const getRes = await fetch(`${baseCollections}/${this.collectionName}`);
    if (getRes.ok) {
      const data = await getRes.json() as { id?: string };
      this.collectionId = data.id ?? null;
      return;
    }

    // Create collection
    const createRes = await fetch(baseCollections, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        name: this.collectionName,
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      // If already exists (409), try to get it again
      if (createRes.status === 409) {
        const retryGet = await fetch(`${baseCollections}/${this.collectionName}`);
        if (retryGet.ok) {
          const data = await retryGet.json() as { id?: string };
          this.collectionId = data.id ?? null;
          return;
        }
      }
      throw new Error(`ChromaDB v2 init failed: ${createRes.status} ${text}`);
    }

    const data = await createRes.json() as { id?: string };
    this.collectionId = data.id ?? null;
  }

  /**
   * Log the number of indexed items.
   */
  private async logCount(): Promise<void> {
    try {
      const countUrl = this.apiVersion === "v2"
        ? `${this.apiBase}/tenants/default_tenant/databases/default_database/collections/${this.collectionId}/count`
        : `${this.apiBase}/collections/${this.collectionName}/count`;

      const countRes = await fetch(countUrl);
      if (countRes.ok) {
        const count = await countRes.json();
        console.log(`ChromaDB: ${count} exemples indexés`);
      }
    } catch { /* non-critical */ }
  }

  /**
   * Build the collection endpoint URL for the current API version.
   */
  private collectionEndpoint(action: string): string {
    if (this.apiVersion === "v2") {
      return `${this.apiBase}/tenants/default_tenant/databases/default_database/collections/${this.collectionId}/${action}`;
    }
    return `${this.apiBase}/collections/${this.collectionName}/${action}`;
  }

  /**
   * Generate an embedding vector for the given text using Ollama.
   * Supports both Ollama v1 (/api/embeddings) and v2 (/api/embed) endpoints.
   */
  async embed(text: string): Promise<number[]> {
    const truncated = text.substring(0, 2000);

    // Try v2 endpoint first (/api/embed)
    try {
      const res = await fetch(`${this.ollamaUrl}/api/embed`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          model: "nomic-embed-text",
          input: truncated,
        }),
      });

      if (res.ok) {
        const data = await res.json() as { embeddings?: number[][] };
        if (data.embeddings && data.embeddings.length > 0) {
          return data.embeddings[0];
        }
      }
    } catch { /* fallback to v1 */ }

    // Fallback to v1 endpoint (/api/embeddings)
    const res = await fetch(`${this.ollamaUrl}/api/embeddings`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        model:  "nomic-embed-text",
        prompt: truncated,
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

    const res = await fetch(this.collectionEndpoint("upsert"), {
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
    });

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

    const res = await fetch(this.collectionEndpoint("query"), {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        query_embeddings: [embedding],
        n_results:        topK,
      }),
    });

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

  /**
   * Get the detected API version (useful for diagnostics).
   */
  getApiVersion(): string {
    return this.apiVersion;
  }
}
