import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import * as db from "./db";

// ============================================================
// Projects Router
// ============================================================

const projectsRouter = router({
  list: publicProcedure
    .input(z.object({
      page: z.number().min(1).default(1).optional(),
      limit: z.number().min(1).max(200).default(50).optional(),
      status: z.enum(["active", "archived", "completed"]).optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return db.listProjects(input);
    }),

  stats: publicProcedure.query(async () => {
    return db.getProjectStats();
  }),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return db.getProjectById(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      gitUrl: z.string().optional(),
      gitProvider: z.enum(["github", "gitlab", "bitbucket", "azure_devops"]).optional(),
      gitBranch: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return db.createProject({
        name: input.name,
        description: input.description ?? null,
        gitUrl: input.gitUrl ?? null,
        gitProvider: input.gitProvider ?? null,
        gitBranch: input.gitBranch ?? null,
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      status: z.enum(["active", "archived", "completed"]).optional(),
      technologies: z.array(z.string()).optional(),
      fileCount: z.number().optional(),
      totalLines: z.number().optional(),
      legacyScore: z.number().optional(),
      modernScore: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.updateProject(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteProject(input.id);
      return { success: true };
    }),
});

// ============================================================
// Project Files Router
// ============================================================

const filesRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return db.getProjectFiles(input.projectId);
    }),

  upload: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      files: z.array(z.object({
        filePath: z.string(),
        fileName: z.string(),
        content: z.string(),
        lineCount: z.number().optional(),
        technologies: z.array(z.string()).optional(),
        moduleName: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      await db.deleteProjectFiles(input.projectId);
      const files = input.files.map(f => ({
        projectId: input.projectId,
        filePath: f.filePath,
        fileName: f.fileName,
        content: f.content,
        lineCount: f.lineCount ?? f.content.split("\n").length,
        technologies: f.technologies ?? null,
        moduleName: f.moduleName ?? null,
      }));
      return db.addProjectFiles(files);
    }),

  deleteAll: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteProjectFiles(input.projectId);
      return { success: true };
    }),
});

// ============================================================
// Scans Router
// ============================================================

const scansRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return db.listScans(input.projectId);
    }),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return db.getScanById(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      scanType: z.enum(["full", "incremental", "quick"]).optional(),
    }))
    .mutation(async ({ input }) => {
      return db.createScan({
        projectId: input.projectId,
        scanType: input.scanType ?? "full",
        status: "pending",
        startedAt: new Date(),
      });
    }),

  updateResult: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "running", "completed", "failed"]).optional(),
      filesAnalyzed: z.number().optional(),
      technologies: z.array(z.string()).optional(),
      legacyScore: z.number().optional(),
      modernScore: z.number().optional(),
      issuesCount: z.number().optional(),
      criticalCount: z.number().optional(),
      warningCount: z.number().optional(),
      durationMs: z.number().optional(),
      analysisResult: z.any().optional(),
      microservicesResult: z.any().optional(),
      cloudResult: z.any().optional(),
      aiResult: z.any().optional(),
      migrationPlan: z.any().optional(),
      architectureGraph: z.any().optional(),
      errorMessage: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updateData: Record<string, unknown> = { ...data };
      if (data.status === "completed" || data.status === "failed") {
        updateData.completedAt = new Date();
      }
      return db.updateScan(id, updateData as any);
    }),
});

// ============================================================
// Comments Router (Collaboration)
// ============================================================

const commentsRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return db.listComments(input.projectId);
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      scanId: z.number().optional(),
      authorName: z.string().min(1).max(255),
      commentType: z.enum(["general", "review", "validation", "question"]).optional(),
      content: z.string().min(1),
      filePath: z.string().optional(),
      lineNumber: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return db.createComment({
        projectId: input.projectId,
        scanId: input.scanId ?? null,
        authorName: input.authorName,
        commentType: input.commentType ?? "general",
        content: input.content,
        filePath: input.filePath ?? null,
        lineNumber: input.lineNumber ?? null,
      });
    }),

  updateValidation: protectedProcedure
    .input(z.object({
      id: z.number(),
      validationStatus: z.enum(["pending", "approved", "rejected"]),
    }))
    .mutation(async ({ input }) => {
      return db.updateComment(input.id, { validationStatus: input.validationStatus });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteComment(input.id);
      return { success: true };
    }),
});

// ============================================================
// Git Connections Router
// ============================================================

const gitRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return db.getGitConnections(input.projectId);
    }),

  connect: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      provider: z.enum(["github", "gitlab", "bitbucket", "azure_devops"]),
      repoUrl: z.string().url(),
      repoName: z.string(),
      defaultBranch: z.string().optional(),
      isMonorepo: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      return db.createGitConnection({
        projectId: input.projectId,
        provider: input.provider,
        repoUrl: input.repoUrl,
        repoName: input.repoName,
        defaultBranch: input.defaultBranch ?? "main",
        isMonorepo: input.isMonorepo ?? false,
      });
    }),

  disconnect: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteGitConnection(input.id);
      return { success: true };
    }),
});

// ============================================================
// Shared Reports Router
// ============================================================

const sharingRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return db.listSharedReports(input.projectId);
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      scanId: z.number().optional(),
      title: z.string().min(1).max(255),
    }))
    .mutation(async ({ input }) => {
      const shareToken = nanoid(32);
      return db.createSharedReport({
        projectId: input.projectId,
        scanId: input.scanId ?? null,
        shareToken,
        title: input.title,
      });
    }),

  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      return db.getSharedReportByToken(input.token);
    }),
});

// ============================================================
// Schema Decoder Router (v12.6 — Standalone feature)
// ============================================================

const schemaDecoderRouter = router({
  /** Decode cryptic DB columns using Java source code semantics */
  decode: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      files: z.array(z.object({ path: z.string(), content: z.string() })),
    }))
    .mutation(async ({ input }) => {
      const { decodeSchema, generateSchemaDictionaryJson, generateSchemaDictionaryMd, generateSchemaDictionaryCsv } = await import("./engine/decoder/SchemaDecoder");
      const result = decodeSchema(input.files);
      return {
        ...result,
        json: generateSchemaDictionaryJson(result),
        markdown: generateSchemaDictionaryMd(result),
        csv: generateSchemaDictionaryCsv(result),
      };
    }),
});

// ============================================================
// Validation Router (v8.7)
// ============================================================

const validationRouter = router({
  /** Lancer la validation sur les projets sélectionnés */
  run: protectedProcedure
    .input(z.object({
      projects: z.string().default("ALL"),
      maxBuildRetries: z.number().default(3),
      stopOnFirstFail: z.boolean().default(false),
      compareWithLast: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const { initializeRegistry } = await import("./engine/validation/init-registry");
      const { ValidationRunner, generateMarkdownReport } = await import("./engine/validation/ValidationRunner");
      const registry = initializeRegistry();
      const runner = new ValidationRunner(registry);
      const report = await runner.runValidation({
        projects: input.projects,
        maxBuildRetries: input.maxBuildRetries,
        stopOnFirstFail: input.stopOnFirstFail,
        compareWithLast: input.compareWithLast,
      });
      registry.save();
      return {
        report,
        markdown: generateMarkdownReport(report),
      };
    }),

  /** Récupérer les stats du registre */
  registryStats: protectedProcedure.query(async () => {
    const { initializeRegistry } = await import("./engine/validation/init-registry");
    const registry = initializeRegistry();
    return {
      stats: registry.stats(),
      projects: registry.getAll().map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        testedPatterns: p.testedPatterns,
        lastScore: p.lastResult?.score ?? null,
        lastDate: p.lastResult?.date ?? null,
      })),
    };
  }),

  /** Générer les projets synthétiques */
  generateSynthetic: protectedProcedure.mutation(async () => {
    const { initializeRegistry } = await import("./engine/validation/init-registry");
    const { generateTestProjects } = await import("./engine/validation/ProjectGenerator");
    const registry = initializeRegistry();
    const { projects, filesWritten } = generateTestProjects("./data/generated-projects");
    for (const project of projects) {
      registry.register(project);
    }
    registry.save();
    return { projectsGenerated: projects.length, filesWritten };
  }),
});

// ============================================================
// Main App Router
// ============================================================

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  projects: projectsRouter,
  files: filesRouter,
  scans: scansRouter,
  comments: commentsRouter,
  git: gitRouter,
  sharing: sharingRouter,
  validation: validationRouter,
  schemaDecoder: schemaDecoderRouter,
});

export type AppRouter = typeof appRouter;
