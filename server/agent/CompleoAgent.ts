/**
 * CompleoAgent — Orchestrateur agent autonome pour la modernisation Java legacy.
 *
 * Coordonne CompleoEngine, GitConnector et CompilationLoop dans un pipeline
 * complet : CLONING → ANALYZING → GENERATING → COMPILING → TESTING → PUSHING.
 *
 * Émet des AgentEvent via AsyncGenerator pour le streaming SSE temps réel.
 * Supporte la pause/reprise pour la résolution d'ambiguïtés.
 *
 * @author Hamza NORDINE
 */

import { CompleoEngine, type AnalysisResult, type GeneratedProject, type SourceFile } from "../engine/CompleoEngine";
import { GitConnector, type CloneResult, type PRResult, type WorkingDir } from "../git/GitConnector";
import { CompilationLoop, type LoopResult, type GeneratedFile as CompLoopFile } from "./CompilationLoop";
import type { Ambiguity, UserChoice } from "../ambiguity-detector";
import type { ProjectIR } from "../java-parser";
import { LearningEngine, type AmbiguityResolution } from "../learning/LearningEngine";
import * as fs from "fs";
import * as path from "path";

// ─── Types publics ────────────────────────────────────────────────────────────

export type AgentPhase =
  | "IDLE"
  | "CLONING"
  | "ANALYZING"
  | "GENERATING"
  | "COMPILING"
  | "TESTING"
  | "PUSHING"
  | "DONE"
  | "FAILED"
  | "AWAITING_INPUT";

export interface AgentConfig {
  source:
    | { type: "zip"; path: string; files?: SourceFile[] }
    | { type: "git"; url: string; branch?: string; token?: string; provider?: string };
  output:
    | { type: "zip" }
    | { type: "pr"; targetBranch?: string; autoPR?: boolean };
  options: {
    maxCompilationAttempts?: number;
    autoResolveAmbiguities?: boolean;
    generateTests?: boolean;
    notifyOnComplete?: string;
    technologies?: string[];
    projectName?: string;
  };
}

export type AgentEventType =
  | "PHASE_START"
  | "PHASE_END"
  | "LOG"
  | "AUTO_FIX"
  | "AWAITING_INPUT"
  | "COMPILATION_ATTEMPT"
  | "SUCCESS"
  | "FAILURE"
  | "CANCELLED";

export interface AgentEvent {
  type: AgentEventType;
  timestamp: number;
  phase?: AgentPhase;
  level?: "info" | "warn" | "error" | "success";
  message?: string;
  data?: Record<string, unknown>;
}

export type AgentSessionState =
  | "IDLE"
  | "RUNNING"
  | "AWAITING_INPUT"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface AgentSession {
  id: string;
  config: AgentConfig;
  state: AgentSessionState;
  currentPhase: AgentPhase;
  events: AgentEvent[];
  createdAt: number;
  updatedAt: number;
  /** Analysis result (available after ANALYZING phase) */
  analysisResult?: AnalysisResult;
  /** IR (available after ANALYZING phase) */
  ir?: ProjectIR;
  /** Ambiguities pending resolution */
  pendingAmbiguities?: Ambiguity[];
  /** User choices for ambiguities */
  userChoices?: UserChoice[];
  /** Generated project (available after GENERATING phase) */
  generatedProject?: GeneratedProject;
  /** Compilation result (available after COMPILING phase) */
  compilationResult?: LoopResult;
  /** PR result (available after PUSHING phase) */
  prResult?: PRResult;
  /** Git working directory */
  gitWorkingDir?: CloneResult;
  /** Download URL for ZIP output */
  downloadUrl?: string;
  /** Migration report content */
  migrationReport?: string;
  /** Error message if failed */
  errorMessage?: string;
  /** Promise resolver for ambiguity resolution */
  _resolveAmbiguity?: (choices: UserChoice[]) => void;
}

// ─── AgentSessionStore ────────────────────────────────────────────────────────

export class AgentSessionStore {
  private sessions = new Map<string, AgentSession>();

  create(config: AgentConfig): AgentSession {
    const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session: AgentSession = {
      id,
      config,
      state: "IDLE",
      currentPhase: "IDLE",
      events: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  update(id: string, patch: Partial<AgentSession>): AgentSession | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    Object.assign(session, patch, { updatedAt: Date.now() });
    return session;
  }

  addEvent(id: string, event: AgentEvent): void {
    const session = this.sessions.get(id);
    if (session) {
      session.events.push(event);
      session.updatedAt = Date.now();
    }
  }

  list(): AgentSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }
}

// ─── CompleoAgent ─────────────────────────────────────────────────────────────

export class CompleoAgent {
  private engine: CompleoEngine;
  private compilationLoop: CompilationLoop;
  private sessionStore: AgentSessionStore;

  constructor(
    engine: CompleoEngine,
    sessionStore: AgentSessionStore
  ) {
    this.engine = engine;
    this.compilationLoop = new CompilationLoop();
    this.sessionStore = sessionStore;
  }

  /**
   * Démarre une session agent et retourne un AsyncGenerator d'événements.
   * Le frontend écoute ces événements via SSE.
   */
  async *run(config: AgentConfig, existingSessionId?: string): AsyncGenerator<AgentEvent> {
    let session: AgentSession;
    if (existingSessionId) {
      const existing = this.sessionStore.get(existingSessionId);
      if (!existing) throw new Error(`Session ${existingSessionId} introuvable`);
      session = existing;
    } else {
      session = this.sessionStore.create(config);
    }
    this.sessionStore.update(session.id, { state: "RUNNING" });

    try {
      // ─── Phase 1: CLONING ─────────────────────────────────────────────
      yield* this.phaseCloning(session);

      // ─── Phase 2: ANALYZING ───────────────────────────────────────────
      yield* this.phaseAnalyzing(session);

      // ─── Phase 3: Handle ambiguities ──────────────────────────────────
      if (session.pendingAmbiguities && session.pendingAmbiguities.length > 0) {
        // ─── Learning: Try auto-resolve with learned rules first ───────
        let remainingAmbiguities = session.pendingAmbiguities;
        try {
          const le = new LearningEngine();
          const tenantId = config.options.projectName || "global";
          const resolutions = await le.resolveAmbiguities(session.pendingAmbiguities, tenantId);

          const autoResolved = resolutions.filter(r => r.autoResolved && r.chosenOption);
          if (autoResolved.length > 0) {
            const autoChoices: UserChoice[] = autoResolved.map(r => ({
              ambiguityId: r.ambiguityId,
              choiceId: r.chosenOption!,
            }));

            // Merge auto-resolved choices
            session.userChoices = autoChoices;

            yield this.event("LOG", {
              level: "success",
              message: `Apprentissage : ${autoResolved.length} ambiguïté(s) auto-résolue(s) par les règles apprises`,
              phase: "ANALYZING",
              data: {
                autoResolved: autoResolved.map(r => ({
                  ambiguityId: r.ambiguityId,
                  chosenOption: r.chosenOption,
                  confidence: r.confidence,
                })),
              },
            });

            // Filter out auto-resolved ambiguities
            const autoResolvedIds = new Set(autoResolved.map(r => r.ambiguityId));
            remainingAmbiguities = session.pendingAmbiguities.filter(a => !autoResolvedIds.has(a.id));
          }

          // Add suggestions for remaining ambiguities
          const suggestions = resolutions.filter(r => !r.autoResolved && r.suggestion);
          if (suggestions.length > 0) {
            yield this.event("LOG", {
              level: "info",
              message: `Apprentissage : ${suggestions.length} suggestion(s) pour les ambiguïtés restantes`,
              phase: "ANALYZING",
            });
          }
        } catch (learningErr) {
          console.warn("[Learning] Agent auto-resolve failed:", learningErr);
        }
        // ─── End Learning ────────────────────────────────────────────────

        if (remainingAmbiguities.length > 0) {
          if (config.options.autoResolveAmbiguities) {
            // Auto-resolve remaining: use recommendations
            const autoChoices: UserChoice[] = remainingAmbiguities.map((a) => ({
              ambiguityId: a.id,
              choiceId: a.recommendation,
            }));
            session.userChoices = [...(session.userChoices || []), ...autoChoices];
            yield this.event("LOG", {
              level: "info",
              message: `${autoChoices.length} ambiguïté(s) restante(s) auto-résolues avec les recommandations du moteur`,
              phase: "ANALYZING",
            });
          } else {
            // Update pending ambiguities to only remaining ones
            session.pendingAmbiguities = remainingAmbiguities;
            // Pause and wait for user input
            yield* this.phaseAwaitingInput(session);
          }
        } else {
          yield this.event("LOG", {
            level: "success",
            message: `Toutes les ambiguïtés ont été résolues par l'apprentissage automatique`,
            phase: "ANALYZING",
          });
        }
      }

      // ─── Phase 4: GENERATING ──────────────────────────────────────────
      yield* this.phaseGenerating(session);

      // ─── Phase 5: COMPILING ───────────────────────────────────────────
      yield* this.phaseCompiling(session);

      // ─── Phase 6: PUSHING ─────────────────────────────────────────────
      yield* this.phasePushing(session);

      // ─── SUCCESS ──────────────────────────────────────────────────────
      this.sessionStore.update(session.id, { state: "COMPLETED", currentPhase: "DONE" });

      const successEvent = this.event("SUCCESS", {
        message: "Migration terminée avec succès",
        phase: "DONE",
        data: {
          sessionId: session.id,
          prUrl: session.prResult?.url,
          downloadUrl: session.downloadUrl,
          compilationStatus: session.compilationResult?.status,
          totalAttempts: session.compilationResult?.totalAttempts,
          useCaseCount: session.analysisResult?.summary.useCaseCount,
          dtoCount: session.analysisResult?.summary.dtoCount,
          fileCount: session.generatedProject?.files.length,
          report: session.migrationReport?.substring(0, 500),
        },
      });
      yield successEvent;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sessionStore.update(session.id, {
        state: "FAILED",
        currentPhase: "FAILED",
        errorMessage,
      });

      yield this.event("FAILURE", {
        level: "error",
        message: `Agent échoué : ${errorMessage}`,
        phase: "FAILED",
        data: {
          sessionId: session.id,
          reason: errorMessage,
          partialFiles: session.generatedProject?.files.length || 0,
        },
      });
    }
  }

  /**
   * Résoudre les ambiguïtés d'une session en attente.
   */
  resolveAmbiguities(sessionId: string, choices: UserChoice[]): boolean {
    const session = this.sessionStore.get(sessionId);
    if (!session || session.state !== "AWAITING_INPUT") return false;

    session.userChoices = choices;
    if (session._resolveAmbiguity) {
      session._resolveAmbiguity(choices);
    }
    return true;
  }

  /**
   * Annuler une session en cours.
   */
  cancel(sessionId: string): boolean {
    const session = this.sessionStore.get(sessionId);
    if (!session || session.state === "COMPLETED" || session.state === "FAILED") return false;

    this.sessionStore.update(sessionId, { state: "CANCELLED", currentPhase: "DONE" });
    if (session._resolveAmbiguity) {
      session._resolveAmbiguity([]); // Unblock any waiting promise
    }
    return true;
  }

  /**
   * Obtenir le statut d'une session.
   */
  getStatus(sessionId: string): {
    state: AgentSessionState;
    phase: AgentPhase;
    events: AgentEvent[];
    summary?: Record<string, unknown>;
  } | null {
    const session = this.sessionStore.get(sessionId);
    if (!session) return null;

    return {
      state: session.state,
      phase: session.currentPhase,
      events: session.events,
      summary: {
        useCaseCount: session.analysisResult?.summary.useCaseCount,
        dtoCount: session.analysisResult?.summary.dtoCount,
        fileCount: session.generatedProject?.files.length,
        compilationStatus: session.compilationResult?.status,
        prUrl: session.prResult?.url,
        downloadUrl: session.downloadUrl,
        ambiguityCount: session.pendingAmbiguities?.length || 0,
        choicesResolved: session.userChoices?.length || 0,
      },
    };
  }

  // ─── Phase implementations ──────────────────────────────────────────────────

  private async *phaseCloning(session: AgentSession): AsyncGenerator<AgentEvent> {
    yield this.event("PHASE_START", { phase: "CLONING", message: "Chargement des sources..." });
    this.sessionStore.update(session.id, { currentPhase: "CLONING" });

    const startTime = Date.now();

    if (session.config.source.type === "git") {
      const { url, branch, token, provider } = session.config.source;
      yield this.event("LOG", {
        level: "info",
        message: `Clonage du repository ${url}${branch ? ` (branche: ${branch})` : ""}`,
        phase: "CLONING",
      });

      const gitConnector = new GitConnector({
        provider: (provider as any) || "github",
        token,
      });

      const cloneResult = await gitConnector.clone(url, token);
      session.gitWorkingDir = cloneResult;

      // Read all source files from cloned repo
      const files = this.readSourceFiles(cloneResult.path);
      session.config.source = {
        ...session.config.source,
        files: undefined,
      } as any;
      // Store files in a temporary property
      (session as any)._sourceFiles = files;

      yield this.event("LOG", {
        level: "success",
        message: `Repo cloné : ${cloneResult.javaFileCount} fichiers Java (${Date.now() - startTime}ms)`,
        phase: "CLONING",
      });
    } else {
      // ZIP source — files already provided or read from path
      let files: SourceFile[] = [];
      if (session.config.source.files) {
        files = session.config.source.files;
      } else if (session.config.source.path) {
        files = this.readSourceFiles(session.config.source.path);
      }
      (session as any)._sourceFiles = files;

      yield this.event("LOG", {
        level: "success",
        message: `Sources chargées : ${files.length} fichiers (${Date.now() - startTime}ms)`,
        phase: "CLONING",
      });
    }

    yield this.event("PHASE_END", { phase: "CLONING", message: "Sources chargées" });
  }

  private async *phaseAnalyzing(session: AgentSession): AsyncGenerator<AgentEvent> {
    yield this.event("PHASE_START", { phase: "ANALYZING", message: "Analyse en cours..." });
    this.sessionStore.update(session.id, { currentPhase: "ANALYZING" });

    const startTime = Date.now();
    const files: SourceFile[] = (session as any)._sourceFiles || [];

    // Find pom.xml
    const pomFile = files.find((f) => f.path.endsWith("pom.xml"));
    const bianFile = files.find((f) => f.path.endsWith("bian.yml") || f.path.endsWith("bian.yaml"));

    const analysisResult = await this.engine.analyze(files, {
      pomXml: pomFile?.content,
      bianYml: bianFile?.content,
      projectName: session.config.options.projectName || "migration",
    });

    session.analysisResult = analysisResult;
    session.ir = analysisResult.ir;
    session.pendingAmbiguities = analysisResult.ambiguities;

    this.sessionStore.update(session.id, {
      analysisResult,
      ir: analysisResult.ir,
      pendingAmbiguities: analysisResult.ambiguities,
    });

    yield this.event("LOG", {
      level: "info",
      message: `Analyse : ${analysisResult.summary.useCaseCount} UseCases, ${analysisResult.summary.dtoCount} DTOs, ${analysisResult.summary.technologyCount} technologies`,
      phase: "ANALYZING",
      data: {
        useCases: analysisResult.summary.useCaseCount,
        dtos: analysisResult.summary.dtoCount,
        enums: analysisResult.summary.enumCount,
        exceptions: analysisResult.summary.exceptionCount,
        technologies: analysisResult.multiTech.technologiesDetected,
        components: analysisResult.summary.componentCount,
      },
    });

    if (analysisResult.ambiguities.length > 0) {
      yield this.event("LOG", {
        level: "warn",
        message: `${analysisResult.ambiguities.length} ambiguïtés détectées`,
        phase: "ANALYZING",
      });
    }

    yield this.event("PHASE_END", {
      phase: "ANALYZING",
      message: `Analyse terminée (${Date.now() - startTime}ms)`,
    });
  }

  private async *phaseAwaitingInput(session: AgentSession): AsyncGenerator<AgentEvent> {
    this.sessionStore.update(session.id, {
      state: "AWAITING_INPUT",
      currentPhase: "AWAITING_INPUT",
    });

    yield this.event("AWAITING_INPUT", {
      phase: "AWAITING_INPUT",
      message: `L'agent est en pause — ${session.pendingAmbiguities?.length} ambiguïtés nécessitent votre décision`,
      data: {
        ambiguities: session.pendingAmbiguities?.map((a) => ({
          id: a.id,
          type: a.type,
          severity: a.severity,
          question: a.question,
          recommendation: a.recommendation,
          options: a.options,
        })),
      },
    });

    // Wait for user to resolve ambiguities
    await new Promise<UserChoice[]>((resolve) => {
      session._resolveAmbiguity = resolve;
    });

    // Check if cancelled
    if (session.state === "CANCELLED") {
      throw new Error("Session annulée par l'utilisateur");
    }

    this.sessionStore.update(session.id, {
      state: "RUNNING",
      currentPhase: "GENERATING",
    });

    yield this.event("LOG", {
      level: "success",
      message: `${session.userChoices?.length || 0} ambiguïtés résolues — l'agent reprend`,
      phase: "ANALYZING",
    });
  }

  private async *phaseGenerating(session: AgentSession): AsyncGenerator<AgentEvent> {
    yield this.event("PHASE_START", { phase: "GENERATING", message: "Génération du code Spring Boot..." });
    this.sessionStore.update(session.id, { currentPhase: "GENERATING" });

    const startTime = Date.now();

    if (!session.ir) throw new Error("IR non disponible — l'analyse n'a pas été effectuée");

    const generatedProject = await this.engine.generate(
      session.ir,
      session.userChoices ? { choices: session.userChoices } : undefined,
      session.pendingAmbiguities,
      session.analysisResult?.multiTech.generatedFiles
    );

    session.generatedProject = generatedProject;
    session.migrationReport = generatedProject.migrationReport;

    this.sessionStore.update(session.id, {
      generatedProject,
      migrationReport: generatedProject.migrationReport,
    });

    const totalFiles = generatedProject.files.length + generatedProject.multiTechFiles.length;

    yield this.event("LOG", {
      level: "success",
      message: `${totalFiles} fichiers générés (${Date.now() - startTime}ms)`,
      phase: "GENERATING",
      data: {
        ejbFiles: generatedProject.files.length,
        multiTechFiles: generatedProject.multiTechFiles.length,
        warnings: generatedProject.warnings.length,
      },
    });

    if (generatedProject.warnings.length > 0) {
      for (const warning of generatedProject.warnings.slice(0, 5)) {
        yield this.event("LOG", {
          level: "warn",
          message: warning,
          phase: "GENERATING",
        });
      }
    }

    yield this.event("PHASE_END", {
      phase: "GENERATING",
      message: `Génération terminée (${Date.now() - startTime}ms)`,
    });
  }

  private async *phaseCompiling(session: AgentSession): AsyncGenerator<AgentEvent> {
    yield this.event("PHASE_START", { phase: "COMPILING", message: "Vérification de la compilation..." });
    this.sessionStore.update(session.id, { currentPhase: "COMPILING" });

    const startTime = Date.now();
    const maxAttempts = session.config.options.maxCompilationAttempts || 5;

    if (!session.generatedProject) throw new Error("Projet non généré");

    // Convert to CompilationLoop format
    const compFiles: CompLoopFile[] = session.generatedProject.files.map((f) => ({
      path: f.path,
      content: f.content,
      category: f.category,
    }));

    // Add multi-tech files
    for (const mtf of session.generatedProject.multiTechFiles) {
      compFiles.push({
        path: mtf.path,
        content: mtf.content,
        category: mtf.category,
      });
    }

    // Set up event listener for real-time feedback
    this.compilationLoop.setEventListener((event) => {
      // Events will be captured in the session store
      if (event.type === "fix_applied" && event.fix) {
        const agentEvent = this.event("AUTO_FIX", {
          phase: "COMPILING",
          message: event.fix.description,
          data: { file: event.fix.file, attempt: event.attempt },
        });
        this.sessionStore.addEvent(session.id, agentEvent);
      }
    });

    const loopResult = await this.compilationLoop.run(compFiles, maxAttempts);
    session.compilationResult = loopResult;

    // Update the generated project with fixed files
    if (loopResult.status === "FIXED" || loopResult.status === "PARTIAL") {
      const fixedFileMap = new Map(loopResult.project.map((f) => [f.path, f.content]));
      for (const file of session.generatedProject.files) {
        const fixed = fixedFileMap.get(file.path);
        if (fixed) file.content = fixed;
      }
    }

    this.sessionStore.update(session.id, { compilationResult: loopResult });

    // Emit compilation attempt events
    for (const iteration of loopResult.iterations) {
      yield this.event("COMPILATION_ATTEMPT", {
        phase: "COMPILING",
        message: `Tentative ${iteration.attempt}: ${iteration.errorsFound} erreurs, ${iteration.errorsFixed} corrigées`,
        data: {
          attempt: iteration.attempt,
          errors: iteration.errorsFound,
          fixed: iteration.errorsFixed,
          remaining: iteration.errorsRemaining,
          fixes: iteration.fixes,
        },
      });
    }

    // Emit auto-fix events
    for (const iteration of loopResult.iterations) {
      for (const fix of iteration.fixes) {
        yield this.event("AUTO_FIX", {
          phase: "COMPILING",
          message: fix.description,
          data: { file: fix.file },
        });
      }
    }

    const statusMsg = {
      SUCCESS: "Compilation réussie (0 erreur)",
      FIXED: `Compilation réussie après ${loopResult.totalAttempts} tentatives`,
      PARTIAL: `Compilation partielle : ${loopResult.finalErrors.length} erreurs restantes`,
      NEEDS_HUMAN: `Compilation échouée : ${loopResult.finalErrors.length} erreurs nécessitent une intervention humaine`,
    };

    yield this.event("LOG", {
      level: loopResult.status === "SUCCESS" || loopResult.status === "FIXED" ? "success" : "warn",
      message: statusMsg[loopResult.status],
      phase: "COMPILING",
    });

    yield this.event("PHASE_END", {
      phase: "COMPILING",
      message: `Compilation terminée (${Date.now() - startTime}ms)`,
    });
  }

  private async *phasePushing(session: AgentSession): AsyncGenerator<AgentEvent> {
    yield this.event("PHASE_START", { phase: "PUSHING", message: "Publication des résultats..." });
    this.sessionStore.update(session.id, { currentPhase: "PUSHING" });

    const startTime = Date.now();

    if (session.config.output.type === "pr" && session.config.source.type === "git") {
      // Git PR output
      const { autoPR, targetBranch } = session.config.output;
      const gitConnector = new GitConnector({
        provider: (session.config.source.provider as any) || "github",
        token: session.config.source.token,
      });

      if (session.gitWorkingDir) {
        const branchName = `compleo/migration-${Date.now()}`;
        await gitConnector.createBranch(session.gitWorkingDir, branchName);

        // Write generated files
        const filesToWrite = [
          ...session.generatedProject!.files.map((f) => ({
            path: `modernized/${f.path}`,
            content: f.content,
          })),
          ...session.generatedProject!.multiTechFiles.map((f) => ({
            path: `modernized/${f.path}`,
            content: f.content,
          })),
        ];

        // Add migration report
        if (session.migrationReport) {
          filesToWrite.push({
            path: "modernized/MIGRATION_REPORT.md",
            content: session.migrationReport,
          });
        }

        await gitConnector.writeFiles(session.gitWorkingDir, filesToWrite);
        await gitConnector.commit(session.gitWorkingDir, "feat: migration Spring Boot par Compleo Agent");

        yield this.event("LOG", {
          level: "info",
          message: `${filesToWrite.length} fichiers écrits sur la branche ${branchName}`,
          phase: "PUSHING",
        });

        if (autoPR) {
          try {
            await gitConnector.push(session.gitWorkingDir, branchName);

            const prResult = await gitConnector.createPR({
              workingDir: session.gitWorkingDir,
              title: "feat: Migration Spring Boot par Compleo Agent",
              body: this.buildPRBody(session),
              sourceBranch: branchName,
              targetBranch: targetBranch || session.gitWorkingDir.defaultBranch,
            });

            session.prResult = prResult;
            this.sessionStore.update(session.id, { prResult });

            yield this.event("LOG", {
              level: "success",
              message: `PR créée : ${prResult.url}`,
              phase: "PUSHING",
              data: { prUrl: prResult.url, prNumber: prResult.number },
            });
          } catch (err) {
            yield this.event("LOG", {
              level: "warn",
              message: `Push/PR échoué : ${err instanceof Error ? err.message : String(err)}. Les fichiers sont disponibles en téléchargement.`,
              phase: "PUSHING",
            });
          }
        }
      }
    } else {
      // ZIP output — mark as downloadable
      session.downloadUrl = `/api/agent/${session.id}/download`;
      this.sessionStore.update(session.id, { downloadUrl: session.downloadUrl });

      yield this.event("LOG", {
        level: "success",
        message: "Résultat disponible en téléchargement",
        phase: "PUSHING",
        data: { downloadUrl: session.downloadUrl },
      });
    }

    yield this.event("PHASE_END", {
      phase: "PUSHING",
      message: `Publication terminée (${Date.now() - startTime}ms)`,
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private event(type: AgentEventType, opts: Partial<AgentEvent> = {}): AgentEvent {
    return {
      type,
      timestamp: Date.now(),
      ...opts,
    };
  }

  private readSourceFiles(dirPath: string): SourceFile[] {
    const files: SourceFile[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "target") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if ([".java", ".xml", ".jsp", ".properties", ".yml", ".yaml"].includes(ext)) {
            try {
              const content = fs.readFileSync(full, "utf-8");
              const relativePath = path.relative(dirPath, full);
              files.push({ path: relativePath, content });
            } catch {
              // Skip unreadable files
            }
          }
        }
      }
    };
    walk(dirPath);
    return files;
  }

  private buildPRBody(session: AgentSession): string {
    const summary = session.analysisResult?.summary;
    const compilation = session.compilationResult;
    const techs = session.analysisResult?.multiTech.technologiesDetected || [];

    return `## Migration Compleo Agent

### Résumé
- **UseCases migrés** : ${summary?.useCaseCount || 0}
- **DTOs générés** : ${summary?.dtoCount || 0}
- **Technologies détectées** : ${techs.join(", ") || "EJB"}
- **Fichiers générés** : ${session.generatedProject?.files.length || 0}
- **Compilation** : ${compilation?.status || "N/A"} (${compilation?.totalAttempts || 0} tentatives)
${compilation?.iterations.some((i) => i.errorsFixed > 0) ? `- **Auto-corrections** : ${compilation?.iterations.reduce((sum, i) => sum + i.errorsFixed, 0)} erreurs corrigées automatiquement` : ""}

### Technologies
${techs.map((t) => `- ${t}`).join("\n") || "- EJB 3.x"}

### Ambiguïtés résolues
${session.userChoices?.length ? `${session.userChoices.length} ambiguïtés résolues` : "Aucune ambiguïté"}

---
*Généré automatiquement par Compleo Agent v4.0*`;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _agentStore: AgentSessionStore | null = null;
let _agent: CompleoAgent | null = null;

export function getAgentStore(): AgentSessionStore {
  if (!_agentStore) {
    _agentStore = new AgentSessionStore();
  }
  return _agentStore;
}

export function getAgent(): CompleoAgent {
  if (!_agent) {
    const { getEngine } = require("../engine/CompleoEngine");
    _agent = new CompleoAgent(getEngine(), getAgentStore());
  }
  return _agent;
}
