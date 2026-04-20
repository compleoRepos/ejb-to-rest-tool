/**
 * EmbeddingService — Compleo v8.0 ML Layer
 *
 * Gère l'indexation et la recherche de paires de migration EJB→Spring.
 *
 * v8.0: Mode hybride
 *   - Priorité 1: ChromaDB + Ollama (si disponibles)
 *   - Priorité 2: Store in-memory avec TF-IDF keyword matching
 *
 * Le mode in-memory est toujours disponible et ne nécessite aucune
 * dépendance externe. Il est suffisant pour le RAG avec <100 exemples.
 *
 * @author Hamza NORDINE
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

// ── In-Memory Store ─────────────────────────────────────────────

interface IndexedPair {
  pair:     MigrationPair;
  tokens:   Set<string>;
  tfVector: Map<string, number>;
}

/**
 * Tokenize Java code into meaningful tokens for TF-IDF matching.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_@.]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2);
}

/**
 * Compute TF (term frequency) vector for a list of tokens.
 */
function computeTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  // Normalize by total token count
  const total = tokens.length || 1;
  for (const [k, v] of tf) {
    tf.set(k, v / total);
  }
  return tf;
}

/**
 * Compute cosine similarity between two TF vectors.
 */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [k, v] of a) {
    dot += v * (b.get(k) ?? 0);
    normA += v * v;
  }
  for (const [, v] of b) {
    normB += v * v;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Service ──────────────────────────────────────────────────────

export class EmbeddingService {
  private chromaUrl:      string;
  private ollamaUrl:      string;
  private collectionName: string;
  private initialized:    boolean = false;
  private apiVersion:     "v1" | "v2" = "v1";
  private collectionId:   string | null = null;
  private chromaAvailable: boolean = false;

  // In-memory store (always available)
  private memoryStore:    IndexedPair[] = [];

  constructor(chromaUrl: string, ollamaUrl: string) {
    this.chromaUrl      = chromaUrl.replace(/\/$/, "");
    this.ollamaUrl      = ollamaUrl.replace(/\/$/, "");
    this.collectionName = "migration-examples";
  }

  /**
   * Detect ChromaDB API version (v1 or v2).
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

    return "v2";
  }

  private get apiBase(): string {
    return `${this.chromaUrl}/api/${this.apiVersion}`;
  }

  /**
   * Initialize the service.
   * Tries ChromaDB first, falls back to in-memory store.
   * NEVER throws — always initializes successfully.
   */
  async initialize(): Promise<void> {
    // Try ChromaDB
    try {
      this.apiVersion = await this.detectApiVersion();
      console.log(`[EmbeddingService] ChromaDB: detected API ${this.apiVersion}`);

      if (this.apiVersion === "v2") {
        await this.initializeV2();
      } else {
        await this.initializeV1();
      }

      this.chromaAvailable = true;
      console.log(`[EmbeddingService] ChromaDB: connecté (${this.apiVersion})`);
      await this.logCount();
    } catch (e) {
      this.chromaAvailable = false;
      console.log(`[EmbeddingService] ChromaDB indisponible — mode in-memory activé`);
    }

    this.initialized = true;
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
   */
  private async initializeV2(): Promise<void> {
    const baseCollections = `${this.apiBase}/tenants/default_tenant/databases/default_database/collections`;

    const getRes = await fetch(`${baseCollections}/${this.collectionName}`);
    if (getRes.ok) {
      const data = await getRes.json() as { id?: string };
      this.collectionId = data.id ?? null;
      return;
    }

    const createRes = await fetch(baseCollections, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: this.collectionName }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
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

  private async logCount(): Promise<void> {
    try {
      const countUrl = this.apiVersion === "v2"
        ? `${this.apiBase}/tenants/default_tenant/databases/default_database/collections/${this.collectionId}/count`
        : `${this.apiBase}/collections/${this.collectionName}/count`;

      const countRes = await fetch(countUrl);
      if (countRes.ok) {
        const count = await countRes.json();
        console.log(`[EmbeddingService] ChromaDB: ${count} exemples indexés`);
      }
    } catch { /* non-critical */ }
  }

  private collectionEndpoint(action: string): string {
    if (this.apiVersion === "v2") {
      return `${this.apiBase}/tenants/default_tenant/databases/default_database/collections/${this.collectionId}/${action}`;
    }
    return `${this.apiBase}/collections/${this.collectionName}/${action}`;
  }

  /**
   * Generate an embedding vector using Ollama (for ChromaDB mode).
   */
  async embed(text: string): Promise<number[]> {
    const truncated = text.substring(0, 2000);

    // Try v2 endpoint first
    try {
      const res = await fetch(`${this.ollamaUrl}/api/embed`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ model: "nomic-embed-text", input: truncated }),
      });

      if (res.ok) {
        const data = await res.json() as { embeddings?: number[][] };
        if (data.embeddings && data.embeddings.length > 0) {
          return data.embeddings[0];
        }
      }
    } catch { /* fallback to v1 */ }

    // Fallback to v1
    const res = await fetch(`${this.ollamaUrl}/api/embeddings`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ model: "nomic-embed-text", prompt: truncated }),
    });

    if (!res.ok) {
      throw new Error(`Ollama embed failed: ${res.status}`);
    }

    const data = await res.json() as { embedding: number[] };
    return data.embedding;
  }

  /**
   * Index a migration pair for later retrieval.
   * Uses ChromaDB if available, always stores in memory.
   */
  async indexPair(pair: MigrationPair): Promise<void> {
    if (!this.initialized) {
      throw new Error("EmbeddingService not initialized — call initialize() first");
    }

    // Always index in memory
    const tokens = tokenize(pair.ejbCode);
    this.memoryStore.push({
      pair,
      tokens: new Set(tokens),
      tfVector: computeTF(tokens),
    });

    // Also index in ChromaDB if available
    if (this.chromaAvailable) {
      try {
        const embedding = await this.embed(pair.ejbCode);

        await fetch(this.collectionEndpoint("upsert"), {
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
      } catch (e) {
        console.warn(`[EmbeddingService] ChromaDB upsert failed, in-memory only: ${e}`);
      }
    }
  }

  /**
   * Find the most similar migration examples to the given EJB code.
   * Uses ChromaDB if available, falls back to in-memory TF-IDF.
   */
  async findSimilar(
    ejbCode: string,
    topK = 3
  ): Promise<MigrationPair[]> {
    if (!this.initialized) {
      throw new Error("EmbeddingService not initialized — call initialize() first");
    }

    // Try ChromaDB first
    if (this.chromaAvailable) {
      try {
        return await this.findSimilarChroma(ejbCode, topK);
      } catch (e) {
        console.warn(`[EmbeddingService] ChromaDB query failed, falling back to in-memory: ${e}`);
      }
    }

    // Fallback: in-memory TF-IDF matching
    return this.findSimilarInMemory(ejbCode, topK);
  }

  /**
   * ChromaDB-based similarity search.
   */
  private async findSimilarChroma(ejbCode: string, topK: number): Promise<MigrationPair[]> {
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
   * In-memory TF-IDF similarity search.
   * Uses cosine similarity between TF vectors.
   */
  private findSimilarInMemory(ejbCode: string, topK: number): MigrationPair[] {
    if (this.memoryStore.length === 0) return [];

    const queryTokens = tokenize(ejbCode);
    const queryTF = computeTF(queryTokens);

    const scored = this.memoryStore.map(item => ({
      pair:  item.pair,
      score: cosineSimilarity(queryTF, item.tfVector),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(s => s.pair);
  }

  /**
   * Check if the service is initialized and ready.
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get the backend mode (chromadb or in-memory).
   */
  getBackendMode(): string {
    return this.chromaAvailable ? `chromadb-${this.apiVersion}` : "in-memory";
  }

  /**
   * Get the detected API version (useful for diagnostics).
   */
  getApiVersion(): string {
    return this.apiVersion;
  }

  /**
   * Get the number of indexed pairs in memory.
   */
  getMemoryCount(): number {
    return this.memoryStore.length;
  }
}
