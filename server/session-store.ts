/**
 * SessionStore — Persistent session store for Compleo sessions.
 *
 * Problem: In-memory Map is cleared on every HMR/tsx watch restart.
 * Solution: Write sessions to a JSON file in /tmp so they survive restarts.
 *
 * The store serializes only the essential session data (IR, ambiguities,
 * user choices, generation results, etc.) and excludes non-serializable
 * fields like SSE clients.
 *
 * @author Hamza NORDINE
 */

import * as fs from "fs";
import * as path from "path";
import type { CompleoSession, SessionStatus, DebugEvent } from "./compleo-routes";
import type { ProjectIR } from "./java-parser";
import type { Ambiguity, UserChoice } from "./ambiguity-detector";
import type { GenerationResult } from "./spring-generator";
import type { PipelineResult, MaturityScore } from "./engine/pipeline/index";
import type { DetectedComponent, GeneratedFile, TechnologyType } from "./engine/registry/types";

const SESSION_FILE = path.join("/tmp", "compleo-sessions.json");

// Serializable subset of CompleoSession (no SSE clients, no Response objects)
interface SerializedSession {
  id: string;
  projectName: string;
  uploadedAt: string;
  files: { path: string; content: string }[];
  pomXml?: string;
  bianYml?: string;
  ir?: any;
  ambiguities?: any[];
  userChoices?: any[];
  resolvedIR?: any;
  generation?: any;
  zipUrl?: string;
  status: SessionStatus;
  error?: string;
  debugEvents: DebugEvent[];
  // Multi-tech v3.0 fields
  pipelineResult?: any;
  detectedComponents?: any[];
  multiTechGeneration?: any[];
  maturityScore?: any;
  technologiesDetected?: string[];
}

class SessionStore {
  private sessions = new Map<string, CompleoSession>();
  private loaded = false;

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        const raw = fs.readFileSync(SESSION_FILE, "utf-8");
        const parsed: SerializedSession[] = JSON.parse(raw);
        for (const s of parsed) {
          this.sessions.set(s.id, {
            ...s,
            uploadedAt: new Date(s.uploadedAt),
            sseClients: [], // Non-serializable, always empty on reload
          } as CompleoSession);
        }
        console.log(`[SessionStore] Restored ${parsed.length} sessions from disk`);
      }
    } catch (err) {
      console.warn("[SessionStore] Failed to load sessions from disk:", err);
    }
    this.loaded = true;
  }

  private saveToDisk(): void {
    try {
      const serializable: SerializedSession[] = [...this.sessions.values()].map(s => ({
        id: s.id,
        projectName: s.projectName,
        uploadedAt: s.uploadedAt.toISOString(),
        files: s.files,
        pomXml: s.pomXml,
        bianYml: s.bianYml,
        ir: s.ir,
        ambiguities: s.ambiguities,
        userChoices: s.userChoices,
        resolvedIR: s.resolvedIR,
        generation: s.generation,
        zipUrl: s.zipUrl,
        status: s.status,
        error: s.error,
        debugEvents: s.debugEvents,
        pipelineResult: s.pipelineResult,
        detectedComponents: s.detectedComponents,
        multiTechGeneration: s.multiTechGeneration,
        maturityScore: s.maturityScore,
        technologiesDetected: s.technologiesDetected,
      }));
      fs.writeFileSync(SESSION_FILE, JSON.stringify(serializable), "utf-8");
    } catch (err) {
      console.warn("[SessionStore] Failed to save sessions to disk:", err);
    }
  }

  get(id: string): CompleoSession | undefined {
    return this.sessions.get(id);
  }

  set(id: string, session: CompleoSession): void {
    this.sessions.set(id, session);
    this.saveToDisk();
  }

  /**
   * Update a session and persist to disk.
   * Use this after modifying session fields (e.g., after analyze, resolve, generate).
   */
  persist(id: string): void {
    if (this.sessions.has(id)) {
      this.saveToDisk();
    }
  }

  delete(id: string): boolean {
    const result = this.sessions.delete(id);
    if (result) this.saveToDisk();
    return result;
  }

  values(): IterableIterator<CompleoSession> {
    return this.sessions.values();
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  get size(): number {
    return this.sessions.size;
  }
}

// Singleton instance
export const sessionStore = new SessionStore();
