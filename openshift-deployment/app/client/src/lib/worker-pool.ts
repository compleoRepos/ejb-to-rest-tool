/**
 * WorkerPool — Orchestrateur multi-thread pour l'analyse parallèle.
 *
 * Distribue les fichiers Java en chunks sur N Web Workers,
 * collecte les résultats et émet des événements de progression en temps réel.
 *
 * Architecture :
 * - Détecte automatiquement le nombre de cœurs CPU (navigator.hardwareConcurrency)
 * - Divise les fichiers en batches équilibrés
 * - Chaque worker traite son batch indépendamment
 * - Les résultats sont agrégés sur le thread principal
 * - Fallback single-thread si Web Workers non disponibles
 *
 * @author Compleo
 */

import type {
  FilePayload,
  FileAnalysisResult,
  WorkerOutMessage,
} from "./analysis-worker";

// ============================================================
// Types
// ============================================================

export interface PoolProgress {
  /** Nombre total de fichiers à analyser */
  totalFiles: number;
  /** Nombre de fichiers analysés */
  completedFiles: number;
  /** Pourcentage de progression (0-100) */
  percent: number;
  /** Fichier en cours d'analyse */
  currentFile: string;
  /** Nombre de workers actifs */
  activeWorkers: number;
  /** Nombre total de workers */
  totalWorkers: number;
  /** Temps écoulé en ms */
  elapsedMs: number;
  /** Vitesse (fichiers/seconde) */
  filesPerSecond: number;
  /** ETA estimé en secondes */
  etaSeconds: number;
  /** Phase actuelle */
  phase: "initializing" | "analyzing" | "aggregating" | "complete" | "error";
  /** Technologies détectées jusqu'ici */
  technologiesFound: Set<string>;
  /** Nombre total d'issues détectées */
  totalIssues: number;
  /** Nombre total de lignes analysées */
  totalLines: number;
  /** Nombre total de méthodes détectées */
  totalMethods: number;
  /** Log des fichiers traités (derniers 50) */
  recentLogs: LogEntry[];
  /** Erreurs rencontrées */
  errors: ErrorEntry[];
}

export interface LogEntry {
  timestamp: number;
  fileName: string;
  status: "analyzing" | "done" | "error";
  processingTimeMs?: number;
  technologies?: string[];
  issues?: number;
}

export interface ErrorEntry {
  fileName: string;
  error: string;
  timestamp: number;
}

export interface PoolConfig {
  /** Nombre max de workers (défaut: navigator.hardwareConcurrency ou 4) */
  maxWorkers?: number;
  /** Taille minimale de batch par worker */
  minBatchSize?: number;
  /** Seuil de fichiers pour activer le mode parallèle (défaut: 10) */
  parallelThreshold?: number;
  /** Callback de progression */
  onProgress?: (progress: PoolProgress) => void;
  /** Callback quand un fichier est terminé */
  onFileComplete?: (result: FileAnalysisResult) => void;
  /** Callback quand tout est terminé */
  onComplete?: (results: FileAnalysisResult[], totalTimeMs: number) => void;
  /** Callback d'erreur */
  onError?: (error: ErrorEntry) => void;
}

export interface PoolStats {
  totalFiles: number;
  totalLines: number;
  totalMethods: number;
  totalIssues: number;
  totalDetections: number;
  technologiesDetected: string[];
  averageComplexity: number;
  totalTimeMs: number;
  filesPerSecond: number;
  workersUsed: number;
}

// ============================================================
// WorkerPool Class
// ============================================================

export class WorkerPool {
  private config: Required<PoolConfig>;
  private workers: Worker[] = [];
  private results: FileAnalysisResult[] = [];
  private progress: PoolProgress;
  private startTime: number = 0;
  private completedBatches: number = 0;
  private totalBatches: number = 0;
  private isRunning: boolean = false;
  private abortController: AbortController | null = null;

  constructor(config: PoolConfig = {}) {
    const cpuCount = typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;

    this.config = {
      maxWorkers: config.maxWorkers ?? Math.min(cpuCount, 8),
      minBatchSize: config.minBatchSize ?? 5,
      parallelThreshold: config.parallelThreshold ?? 10,
      onProgress: config.onProgress ?? (() => {}),
      onFileComplete: config.onFileComplete ?? (() => {}),
      onComplete: config.onComplete ?? (() => {}),
      onError: config.onError ?? (() => {}),
    };

    this.progress = this.createInitialProgress(0);
  }

  // ---- Public API ----

  /**
   * Analyse un ensemble de fichiers en parallèle.
   * Retourne une promesse avec tous les résultats.
   */
  async analyze(files: FilePayload[]): Promise<FileAnalysisResult[]> {
    if (this.isRunning) {
      throw new Error("WorkerPool is already running. Call abort() first.");
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    this.startTime = performance.now();
    this.results = [];
    this.completedBatches = 0;
    this.progress = this.createInitialProgress(files.length);

    // Decide: parallel or single-thread
    if (files.length < this.config.parallelThreshold || !this.isWebWorkerSupported()) {
      return this.analyzeSingleThread(files);
    }

    return this.analyzeParallel(files);
  }

  /**
   * Annule l'analyse en cours.
   */
  abort(): void {
    this.abortController?.abort();
    this.terminateWorkers();
    this.isRunning = false;
    this.progress.phase = "error";
    this.emitProgress();
  }

  /**
   * Retourne les statistiques agrégées après l'analyse.
   */
  getStats(): PoolStats {
    const totalTimeMs = performance.now() - this.startTime;
    const totalLines = this.results.reduce((s, r) => s + r.lineCount, 0);
    const totalMethods = this.results.reduce((s, r) => s + r.methodCount, 0);
    const totalIssues = this.results.reduce((s, r) => s + r.issueCount, 0);
    const totalDetections = this.results.reduce((s, r) => s + r.totalDetections, 0);
    const techs = new Set<string>();
    this.results.forEach(r => r.technologiesDetected.forEach(t => techs.add(t)));
    const avgComplexity = this.results.length > 0
      ? this.results.reduce((s, r) => s + r.complexityScore, 0) / this.results.length
      : 0;

    return {
      totalFiles: this.results.length,
      totalLines,
      totalMethods,
      totalIssues,
      totalDetections,
      technologiesDetected: Array.from(techs),
      averageComplexity: Math.round(avgComplexity * 10) / 10,
      totalTimeMs,
      filesPerSecond: totalTimeMs > 0 ? Math.round((this.results.length / (totalTimeMs / 1000)) * 10) / 10 : 0,
      workersUsed: this.workers.length || 1,
    };
  }

  /**
   * Vérifie si les Web Workers sont supportés.
   */
  isWebWorkerSupported(): boolean {
    return typeof Worker !== "undefined";
  }

  /**
   * Retourne le nombre optimal de workers.
   */
  getOptimalWorkerCount(fileCount: number): number {
    const maxByFiles = Math.ceil(fileCount / this.config.minBatchSize);
    return Math.max(1, Math.min(this.config.maxWorkers, maxByFiles));
  }

  // ---- Private: Parallel analysis ----

  private async analyzeParallel(files: FilePayload[]): Promise<FileAnalysisResult[]> {
    const workerCount = this.getOptimalWorkerCount(files.length);
    const batches = this.createBatches(files, workerCount);
    this.totalBatches = batches.length;

    this.progress.totalWorkers = workerCount;
    this.progress.activeWorkers = workerCount;
    this.progress.phase = "analyzing";
    this.emitProgress();

    return new Promise<FileAnalysisResult[]>((resolve, reject) => {
      let completedCount = 0;

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];

        try {
          const worker = new Worker(
            new URL("./analysis-worker.ts", import.meta.url),
            { type: "module" }
          );
          this.workers.push(worker);

          worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
            if (this.abortController?.signal.aborted) return;

            const msg = e.data;

            switch (msg.type) {
              case "progress":
                this.progress.currentFile = msg.fileName;
                this.addLog({
                  timestamp: Date.now(),
                  fileName: msg.fileName,
                  status: "analyzing",
                });
                this.emitProgress();
                break;

              case "file-result":
                this.results.push(msg.result);
                this.progress.completedFiles = this.results.length;
                this.progress.percent = Math.round((this.results.length / files.length) * 100);
                this.progress.totalLines += msg.result.lineCount;
                this.progress.totalMethods += msg.result.methodCount;
                this.progress.totalIssues += msg.result.issueCount;
                msg.result.technologiesDetected.forEach(t => this.progress.technologiesFound.add(t));

                this.updateSpeed();

                this.addLog({
                  timestamp: Date.now(),
                  fileName: msg.result.fileName,
                  status: "done",
                  processingTimeMs: msg.result.processingTimeMs,
                  technologies: msg.result.technologiesDetected,
                  issues: msg.result.issueCount,
                });

                this.config.onFileComplete(msg.result);
                this.emitProgress();
                break;

              case "batch-complete":
                completedCount++;
                this.progress.activeWorkers = workerCount - completedCount;

                if (completedCount === batches.length) {
                  this.progress.phase = "complete";
                  this.progress.percent = 100;
                  this.progress.activeWorkers = 0;
                  this.emitProgress();
                  this.terminateWorkers();
                  this.isRunning = false;
                  const totalTimeMs = performance.now() - this.startTime;
                  this.config.onComplete(this.results, totalTimeMs);
                  resolve(this.results);
                }
                break;

              case "error":
                const errorEntry: ErrorEntry = {
                  fileName: msg.fileName,
                  error: msg.error,
                  timestamp: Date.now(),
                };
                this.progress.errors.push(errorEntry);
                this.addLog({
                  timestamp: Date.now(),
                  fileName: msg.fileName,
                  status: "error",
                });
                this.config.onError(errorEntry);
                this.emitProgress();
                break;
            }
          };

          worker.onerror = (err) => {
            const errorEntry: ErrorEntry = {
              fileName: `batch-${batchIdx}`,
              error: err.message || "Worker error",
              timestamp: Date.now(),
            };
            this.progress.errors.push(errorEntry);
            this.config.onError(errorEntry);

            completedCount++;
            if (completedCount === batches.length) {
              this.progress.phase = this.progress.errors.length > 0 ? "error" : "complete";
              this.terminateWorkers();
              this.isRunning = false;
              resolve(this.results);
            }
          };

          // Send batch to worker
          worker.postMessage({
            type: "analyze",
            files: batch,
            batchId: batchIdx,
          });
        } catch (err) {
          // Worker creation failed — fallback to single thread for this batch
          console.warn(`Worker ${batchIdx} creation failed, falling back to single-thread for batch`);
          for (const file of batch) {
            const result = this.analyzeSingleFile(file);
            this.results.push(result);
            this.progress.completedFiles = this.results.length;
            this.progress.percent = Math.round((this.results.length / files.length) * 100);
            this.emitProgress();
          }
          completedCount++;
          if (completedCount === batches.length) {
            this.progress.phase = "complete";
            this.terminateWorkers();
            this.isRunning = false;
            resolve(this.results);
          }
        }
      }
    });
  }

  // ---- Private: Single-thread fallback ----

  private async analyzeSingleThread(files: FilePayload[]): Promise<FileAnalysisResult[]> {
    this.progress.totalWorkers = 1;
    this.progress.activeWorkers = 1;
    this.progress.phase = "analyzing";
    this.emitProgress();

    for (let i = 0; i < files.length; i++) {
      if (this.abortController?.signal.aborted) break;

      const file = files[i];
      this.progress.currentFile = file.name;
      this.addLog({ timestamp: Date.now(), fileName: file.name, status: "analyzing" });
      this.emitProgress();

      // Yield to main thread every 10 files for UI responsiveness
      if (i > 0 && i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      const result = this.analyzeSingleFile(file);
      this.results.push(result);

      this.progress.completedFiles = this.results.length;
      this.progress.percent = Math.round((this.results.length / files.length) * 100);
      this.progress.totalLines += result.lineCount;
      this.progress.totalMethods += result.methodCount;
      this.progress.totalIssues += result.issueCount;
      result.technologiesDetected.forEach(t => this.progress.technologiesFound.add(t));
      this.updateSpeed();

      this.addLog({
        timestamp: Date.now(),
        fileName: file.name,
        status: "done",
        processingTimeMs: result.processingTimeMs,
        technologies: result.technologiesDetected,
        issues: result.issueCount,
      });

      this.config.onFileComplete(result);
      this.emitProgress();
    }

    this.progress.phase = "complete";
    this.progress.percent = 100;
    this.progress.activeWorkers = 0;
    this.emitProgress();
    this.isRunning = false;

    const totalTimeMs = performance.now() - this.startTime;
    this.config.onComplete(this.results, totalTimeMs);

    return this.results;
  }

  /**
   * Analyse un seul fichier (utilisé en fallback single-thread et en cas d'échec worker).
   */
  private analyzeSingleFile(file: FilePayload): FileAnalysisResult {
    const start = performance.now();
    const lines = file.content.split("\n");
    const className = (file.content.match(/(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/) || ["", "UnknownClass"])[1];

    const techs = new Set<string>();
    let totalMethods = 0;
    let totalDetections = 0;
    let issueCount = 0;

    const patterns: [RegExp, string][] = [
      [/@(Stateless|Stateful|Singleton|MessageDriven)\b/, "ejb"],
      [/@(EJB|Inject)\b/, "ejb"],
      [/InitialContext|\.lookup\(/, "ejb"],
      [/@WebServlet|HttpServlet|doGet|doPost/, "servlet"],
      [/<%|<jsp:|<c:|<fmt:/, "jsp"],
      [/ActionForm|ActionForward|struts-config/, "struts"],
      [/@WebService|@WebMethod|@SOAPBinding/, "soap"],
      [/DriverManager|PreparedStatement|ResultSet/, "jdbc"],
      [/SessionFactory|createQuery|createCriteria/, "hibernate"],
      [/JMSContext|MessageProducer|MessageConsumer/, "jms"],
      [/ItemReader|ItemWriter|ItemProcessor/, "batch"],
      [/@TransactionAttribute|UserTransaction/, "transaction"],
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/(?:public|protected|private)\s+\w+\s+\w+\s*\(/) && !line.includes("class ")) totalMethods++;
      for (const [regex, tech] of patterns) {
        if (regex.test(line)) { techs.add(tech); totalDetections++; }
      }
      if (/catch\s*\(\s*Exception/.test(line)) issueCount++;
      if (/System\.out\.print/.test(line)) issueCount++;
      if (/@SuppressWarnings/.test(line)) issueCount++;
    }

    return {
      fileId: file.id,
      fileName: file.name,
      ejbReport: { className, summary: { totalLines: lines.length, totalMethods } },
      extendedReport: { className, summary: { technologiesDetected: Array.from(techs), totalDetections, totalMethods } },
      technologiesDetected: Array.from(techs),
      totalDetections,
      complexityScore: Math.min(100, totalDetections * 5 + techs.size * 10),
      lineCount: lines.length,
      methodCount: totalMethods,
      issueCount,
      processingTimeMs: performance.now() - start,
    };
  }

  // ---- Private: Utilities ----

  private createBatches(files: FilePayload[], workerCount: number): FilePayload[][] {
    const batchSize = Math.max(this.config.minBatchSize, Math.ceil(files.length / workerCount));
    const batches: FilePayload[][] = [];

    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize));
    }

    return batches;
  }

  private createInitialProgress(totalFiles: number): PoolProgress {
    return {
      totalFiles,
      completedFiles: 0,
      percent: 0,
      currentFile: "",
      activeWorkers: 0,
      totalWorkers: 0,
      elapsedMs: 0,
      filesPerSecond: 0,
      etaSeconds: 0,
      phase: "initializing",
      technologiesFound: new Set(),
      totalIssues: 0,
      totalLines: 0,
      totalMethods: 0,
      recentLogs: [],
      errors: [],
    };
  }

  private updateSpeed(): void {
    const elapsed = performance.now() - this.startTime;
    this.progress.elapsedMs = elapsed;
    this.progress.filesPerSecond = elapsed > 0
      ? Math.round((this.progress.completedFiles / (elapsed / 1000)) * 10) / 10
      : 0;
    const remaining = this.progress.totalFiles - this.progress.completedFiles;
    this.progress.etaSeconds = this.progress.filesPerSecond > 0
      ? Math.round(remaining / this.progress.filesPerSecond)
      : 0;
  }

  private addLog(entry: LogEntry): void {
    this.progress.recentLogs.push(entry);
    if (this.progress.recentLogs.length > 50) {
      this.progress.recentLogs = this.progress.recentLogs.slice(-50);
    }
  }

  private emitProgress(): void {
    this.config.onProgress({ ...this.progress });
  }

  private terminateWorkers(): void {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
  }
}

// ============================================================
// Factory function
// ============================================================

/**
 * Crée un WorkerPool configuré avec les paramètres par défaut.
 */
export function createWorkerPool(config?: PoolConfig): WorkerPool {
  return new WorkerPool(config);
}
