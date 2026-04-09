/**
 * SessionStore — Persistent session store for Compleo sessions.
 *
 * v5.4: Migrated from /tmp JSON file to MySQL database (compleo_sessions table).
 * Sessions survive server restarts, deploys, and HMR reloads.
 *
 * The store keeps an in-memory cache for fast reads and writes through
 * to the database asynchronously. SSE clients (non-serializable) are
 * managed in-memory only.
 *
 * @author Hamza NORDINE
 */

import { getDb } from "./db";
import { compleoSessions } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import type { CompleoSession, SessionStatus, DebugEvent } from "./compleo-routes";
import type { ProjectIR } from "./java-parser";
import type { Ambiguity, UserChoice } from "./ambiguity-detector";
import type { GenerationResult } from "./spring-generator";
import type { PipelineResult, MaturityScore } from "./engine/pipeline/index";
import type { DetectedComponent, GeneratedFile, TechnologyType } from "./engine/registry/types";

export class SessionStore {
  private cache = new Map<string, CompleoSession>();
  private loaded = false;

  constructor() {
    // Load from DB on startup (async, non-blocking)
    this.loadFromDB().catch(err => {
      console.warn("[SessionStore] Failed to load sessions from DB:", err);
    });
  }

  private async loadFromDB(): Promise<void> {
    try {
      const db = await getDb();
      if (!db) { this.loaded = true; return; }
      const rows = await db.select().from(compleoSessions);
      for (const row of rows) {
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
          sseClients: [], // Non-serializable, always empty on reload
          // Multi-tech v3.0 fields
          pipelineResult: row.pipelineResultData as PipelineResult | undefined,
          detectedComponents: row.detectedComponentsData as DetectedComponent[] | undefined,
          multiTechGeneration: row.multiTechGenerationData as GeneratedFile[] | undefined,
          maturityScore: row.maturityScoreData as MaturityScore | undefined,
          technologiesDetected: row.technologiesDetected as TechnologyType[] | undefined,
        };
        this.cache.set(row.id, session);
      }
      console.log(`[SessionStore] Restored ${rows.length} sessions from DB`);
    } catch (err) {
      console.warn("[SessionStore] DB load failed, starting with empty store:", err);
    }
    this.loaded = true;
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

  get(id: string): CompleoSession | undefined {
    return this.cache.get(id);
  }

  set(id: string, session: CompleoSession): void {
    this.cache.set(id, session);
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
      this.saveToDB(session).catch(err => {
        console.warn("[SessionStore] Async persist failed:", err);
      });
    }
  }

  delete(id: string): boolean {
    const result = this.cache.delete(id);
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
    return this.cache.has(id);
  }

  get size(): number {
    return this.cache.size;
  }

  /**
   * List all sessions (for the unified /compleo IDLE state).
   * Returns a lightweight summary without full file contents.
   */
  listSessions(): Array<{
    id: string;
    projectName: string;
    status: SessionStatus;
    createdAt: Date;
    fileCount: number;
    technologies: string[];
  }> {
    return [...this.cache.values()].map(s => ({
      id: s.id,
      projectName: s.projectName,
      status: s.status,
      createdAt: s.uploadedAt,
      fileCount: s.files.length,
      technologies: s.technologiesDetected ?? [],
    })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

// Singleton instance
export const sessionStore = new SessionStore();
