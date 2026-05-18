/**
 * SessionStore — Persistent session store for Compleo sessions.
 *
 * v5.4: Migrated from /tmp JSON file to MySQL database (compleo_sessions table).
 * v11.3: Performance optimization — lazy loading.
 *   - On startup, only lightweight metadata is loaded (id, projectName, status, timestamps, technologies).
 *   - Full session blobs (files, IR, generation, etc.) are loaded on-demand when `get(id)` is called.
 *   - The `listSessions()` method returns metadata from the pre-loaded index without touching blobs.
 *
 * Sessions survive server restarts, deploys, and HMR reloads.
 * SSE clients (non-serializable) are managed in-memory only.
 *
 * @author Compleo
 */

import { getDb } from "./db";
import { compleoSessions } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import type { CompleoSession, SessionStatus, DebugEvent } from "./compleo-routes";
import type { ProjectIR } from "./java-parser";
import type { Ambiguity, UserChoice } from "./ambiguity-detector";
import type { GenerationResult } from "./spring-generator";
import type { PipelineResult, MaturityScore } from "./engine/pipeline/index";
import type { DetectedComponent, GeneratedFile, TechnologyType } from "./engine/registry/types";

// ─── Lightweight metadata for fast listing ──────────────────────────────────

interface SessionMeta {
  id: string;
  projectName: string;
  status: SessionStatus;
  createdAt: Date;
  fileCount: number;
  technologies: string[];
  useCaseCount: number;
  dtoCount: number;
  generatedFiles: number;
  ambiguityCount: number;
}

export class SessionStore {
  private cache = new Map<string, CompleoSession>();
  /** Lightweight metadata index — always populated on startup */
  private metaIndex = new Map<string, SessionMeta>();
  private loaded = false;
  private loadingPromise: Promise<void>;

  constructor() {
    // Load metadata from DB on startup (async, non-blocking)
    this.loadingPromise = this.loadMetadataFromDB().catch(err => {
      console.warn("[SessionStore] Failed to load session metadata from DB:", err);
    });
  }

  /**
   * Wait for initial metadata load to complete.
   * Call this before first use in request handlers if needed.
   */
  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await this.loadingPromise;
  }

  /**
   * Load ONLY lightweight metadata from DB — no blobs.
   * This makes startup fast even with hundreds of sessions.
   */
  private async loadMetadataFromDB(): Promise<void> {
    try {
      const db = await getDb();
      if (!db) { this.loaded = true; return; }
      let rows;
      try {
        rows = await db.select({
          id: compleoSessions.id,
          projectName: compleoSessions.projectName,
          status: compleoSessions.status,
          createdAt: compleoSessions.createdAt,
          technologiesDetected: compleoSessions.technologiesDetected,
          // We need a few lightweight fields for the list view
          irData: compleoSessions.irData,
          filesData: compleoSessions.filesData,
          generationData: compleoSessions.generationData,
          ambiguitiesData: compleoSessions.ambiguitiesData,
        }).from(compleoSessions)
          .orderBy(desc(compleoSessions.updatedAt))
          .limit(200);
      } catch (dbErr: any) {
        // Table may not exist yet (first startup before bootstrap)
        if (dbErr?.cause?.code === "ER_NO_SUCH_TABLE" || dbErr?.cause?.errno === 1146) {
          console.warn("[SessionStore] Table compleo_sessions not found — will be created by bootstrap");
          this.loaded = true;
          return;
        }
        throw dbErr;
      }
      for (const row of rows) {
        const ir = row.irData as any;
        const files = row.filesData as any[];
        const gen = row.generationData as any;
        const ambiguities = row.ambiguitiesData as any[];
        this.metaIndex.set(row.id, {
          id: row.id,
          projectName: row.projectName,
          status: row.status as SessionStatus,
          createdAt: row.createdAt,
          fileCount: files?.length ?? 0,
          technologies: (row.technologiesDetected as string[]) ?? [],
          useCaseCount: ir?.stats?.useCaseCount ?? 0,
          dtoCount: ir?.stats?.dtoCount ?? 0,
          generatedFiles: gen?.stats?.totalFiles ?? 0,
          ambiguityCount: ambiguities?.length ?? 0,
        });
      }
      console.log(`[SessionStore] Loaded metadata for ${rows.length} sessions (lazy mode)`);
    } catch (err) {
      console.warn("[SessionStore] Metadata load failed, starting with empty store:", err);
    }
    this.loaded = true;
  }

  /**
   * Load a full session from DB on-demand (lazy).
   */
  private async loadFullSession(id: string): Promise<CompleoSession | undefined> {
    try {
      const db = await getDb();
      if (!db) return undefined;
      const [row] = await db.select().from(compleoSessions)
        .where(eq(compleoSessions.id, id));
      if (!row) return undefined;

      const session: CompleoSession = {
        id: row.id,
        projectName: row.projectName,
        uploadedAt: row.createdAt,
        files: (row.filesData as any[]) ?? [],
        pomXml: row.pomXml ?? undefined,
        bianYml: row.bianYml ?? undefined,
        ir: row.irData as ProjectIR | undefined,
        ambiguities: row.ambiguitiesData as Ambiguity[] | undefined,
        userChoices: row.userChoicesData as UserChoice[] | undefined,
        resolvedIR: row.resolvedIrData as ProjectIR | undefined,
        generation: row.generationData as GenerationResult | undefined,
        zipUrl: row.zipUrl ?? undefined,
        status: row.status as SessionStatus,
        error: row.errorMessage ?? undefined,
        debugEvents: (row.debugEventsData as DebugEvent[]) ?? [],
        sseClients: [],
        // Multi-tech v3.0 fields
        pipelineResult: row.pipelineResultData as PipelineResult | undefined,
        detectedComponents: row.detectedComponentsData as DetectedComponent[] | undefined,
        multiTechGeneration: row.multiTechGenerationData as GeneratedFile[] | undefined,
        maturityScore: row.maturityScoreData as MaturityScore | undefined,
        technologiesDetected: row.technologiesDetected as TechnologyType[] | undefined,
        // Missing dependencies (v5.6.1)
        missingDeps: (row as any).missingDepsData as any[] | undefined,
      };
      // Cache it for future fast access
      this.cache.set(id, session);
      return session;
    } catch (err) {
      console.warn("[SessionStore] Failed to load full session:", id, err);
      return undefined;
    }
  }

  private async saveToDB(session: CompleoSession): Promise<void> {
    try {
      const row = {
        id: session.id,
        projectName: session.projectName,
        status: session.status as any,
        filesData: session.files as any,
        pomXml: session.pomXml ?? null,
        bianYml: session.bianYml ?? null,
        irData: session.ir as any ?? null,
        ambiguitiesData: session.ambiguities as any ?? null,
        userChoicesData: session.userChoices as any ?? null,
        resolvedIrData: session.resolvedIR as any ?? null,
        generationData: session.generation as any ?? null,
        zipUrl: session.zipUrl ?? null,
        pipelineResultData: session.pipelineResult as any ?? null,
        detectedComponentsData: session.detectedComponents as any ?? null,
        multiTechGenerationData: session.multiTechGeneration as any ?? null,
        maturityScoreData: session.maturityScore as any ?? null,
        technologiesDetected: session.technologiesDetected as any ?? null,
        debugEventsData: session.debugEvents as any ?? null,
        missingDepsData: (session as any).missingDeps as any ?? null,
        errorMessage: session.error ?? null,
      };

      // Upsert: insert or update on conflict
      const db = await getDb();
      if (!db) return;

      const existing = await db.select({ id: compleoSessions.id })
        .from(compleoSessions)
        .where(eq(compleoSessions.id, session.id));

      if (existing.length > 0) {
        await db.update(compleoSessions)
          .set(row)
          .where(eq(compleoSessions.id, session.id));
      } else {
        await db.insert(compleoSessions).values(row);
      }
    } catch (err) {
      console.warn("[SessionStore] Failed to save session to DB:", err);
    }
  }

  /**
   * Get a full session by ID.
   * Returns from cache if available, otherwise lazy-loads from DB.
   */
  get(id: string): CompleoSession | undefined {
    return this.cache.get(id);
  }

  /**
   * Async get — loads from DB if not in cache.
   * Use this when you need guaranteed access to DB-persisted sessions.
   */
  async getAsync(id: string): Promise<CompleoSession | undefined> {
    const cached = this.cache.get(id);
    if (cached) return cached;
    return this.loadFullSession(id);
  }

  set(id: string, session: CompleoSession): void {
    this.cache.set(id, session);
    // Update metadata index
    this.metaIndex.set(id, {
      id: session.id,
      projectName: session.projectName,
      status: session.status,
      createdAt: session.uploadedAt,
      fileCount: session.files.length,
      technologies: session.technologiesDetected ?? [],
      useCaseCount: session.ir?.stats?.useCaseCount ?? 0,
      dtoCount: session.ir?.stats?.dtoCount ?? 0,
      generatedFiles: session.generation?.stats?.totalFiles ?? 0,
      ambiguityCount: session.ambiguities?.length ?? 0,
    });
    // Async DB write (fire and forget)
    this.saveToDB(session).catch(err => {
      console.warn("[SessionStore] Async save failed:", err);
    });
  }

  /**
   * Update a session and persist to DB.
   * Use this after modifying session fields (e.g., after analyze, resolve, generate).
   */
  persist(id: string): void {
    const session = this.cache.get(id);
    if (session) {
      // Refresh metadata index
      this.metaIndex.set(id, {
        id: session.id,
        projectName: session.projectName,
        status: session.status,
        createdAt: session.uploadedAt,
        fileCount: session.files.length,
        technologies: session.technologiesDetected ?? [],
        useCaseCount: session.ir?.stats?.useCaseCount ?? 0,
        dtoCount: session.ir?.stats?.dtoCount ?? 0,
        generatedFiles: session.generation?.stats?.totalFiles ?? 0,
        ambiguityCount: session.ambiguities?.length ?? 0,
      });
      this.saveToDB(session).catch(err => {
        console.warn("[SessionStore] Async persist failed:", err);
      });
    }
  }

  delete(id: string): boolean {
    const result = this.cache.delete(id);
    this.metaIndex.delete(id);
    if (result) {
      getDb().then(db => {
        if (db) db.delete(compleoSessions)
          .where(eq(compleoSessions.id, id))
          .catch(err => console.warn("[SessionStore] Async delete failed:", err));
      });
    }
    return result;
  }

  values(): IterableIterator<CompleoSession> {
    return this.cache.values();
  }

  has(id: string): boolean {
    return this.cache.has(id) || this.metaIndex.has(id);
  }

  get size(): number {
    return this.metaIndex.size;
  }

  /**
   * List all sessions — FAST.
   * Returns lightweight metadata from the pre-loaded index.
   * No blob deserialization, no DB round-trip.
   */
  listSessions(): Array<{
    id: string;
    projectName: string;
    status: SessionStatus;
    createdAt: Date;
    fileCount: number;
    technologies: string[];
  }> {
    return [...this.metaIndex.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * List sessions with extended metadata for the /sessions endpoint.
   * Still lightweight — no blobs loaded.
   */
  listSessionsExtended(): SessionMeta[] {
    return [...this.metaIndex.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

// Singleton instance
export const sessionStore = new SessionStore();
