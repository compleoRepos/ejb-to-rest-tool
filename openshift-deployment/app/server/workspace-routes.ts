/**
 * Workspace Routes — Multi-module project management API.
 *
 * Endpoints:
 *   POST   /api/workspace           → Create a workspace
 *   GET    /api/workspace            → List all workspaces
 *   GET    /api/workspace/:id        → Get workspace details + links
 *   POST   /api/workspace/:id/add-project → Add a Compleo session to workspace
 *   DELETE /api/workspace/:id        → Delete a workspace
 *   POST   /api/workspace/:id/generate → Generate multi-module ZIP
 *
 * @author Compleo
 */

import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import {
  workspaces, workspaceSessions, crossModuleLinks,
} from "../drizzle/schema";
import { sessionStore } from "./session-store";
import { CrossModuleResolver } from "./engine/CrossModuleResolver";
import type { WorkspaceProject } from "./engine/CrossModuleResolver";
import { WorkspaceIntelligenceEngine } from "./engine/workspace";
import type { ProjectIR } from "./java-parser";

import { generateSpringBootProject } from "./spring-generator";
import { storagePut } from "./storage";
import { WorkspaceReportGenerator } from "./engine/workspace/WorkspaceReportGenerator";
import type { ReportInput } from "./engine/workspace/WorkspaceReportGenerator";

const router = Router();
const resolver = new CrossModuleResolver();
const intelligenceEngine = new WorkspaceIntelligenceEngine();

// ─── POST /api/workspace — Create workspace ────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Workspace name is required" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const id = randomUUID();
    await db.insert(workspaces).values({ id, name, description: description ?? null });

    return res.json({ id, name, description, sessions: [], links: [] });
  } catch (err: any) {
    console.error("[Workspace] Create error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/workspace — List workspaces ──────────────────────────────────

router.get("/", async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.json([]);

    const rows = await db.select().from(workspaces);

    // Enrich with session count
    const result = [];
    for (const ws of rows) {
      const sessions = await db
        .select()
        .from(workspaceSessions)
        .where(eq(workspaceSessions.workspaceId, ws.id));
      result.push({
        ...ws,
        sessionCount: sessions.length,
        sessions: sessions.map(s => ({
          sessionId: s.sessionId,
          projectName: s.projectName,
          artifactId: s.artifactId,
          analysisStatus: s.analysisStatus,
        })),
      });
    }

    return res.json(result);
  } catch (err: any) {
    console.error("[Workspace] List error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/workspace/:id — Get workspace details ────────────────────────

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, req.params.id));

    if (!ws) return res.status(404).json({ error: "Workspace not found" });

    const sessions = await db
      .select()
      .from(workspaceSessions)
      .where(eq(workspaceSessions.workspaceId, ws.id));

    const links = await db
      .select()
      .from(crossModuleLinks)
      .where(eq(crossModuleLinks.workspaceId, ws.id));

    return res.json({
      ...ws,
      sessions: sessions.map(s => ({
        id: s.id,
        sessionId: s.sessionId,
        projectName: s.projectName,
        artifactId: s.artifactId,
        analysisStatus: s.analysisStatus,
        addedAt: s.addedAt,
      })),
      links: links.map(l => ({
        id: l.id,
        sourceSessionId: l.sourceSessionId,
        sourceClass: l.sourceClass,
        targetSessionId: l.targetSessionId,
        targetClass: l.targetClass,
        jndiPath: l.jndiPath,
        status: l.status,
      })),
      resolvedCount: links.filter(l => l.status === "RESOLVED" || l.status === "NEWLY_RESOLVED").length,
      unresolvedCount: links.filter(l => l.status === "UNRESOLVED").length,
    });
  } catch (err: any) {
    console.error("[Workspace] Get error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/workspace/:id/add-project — Add session to workspace ────────

router.post("/:id/add-project", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    // Verify workspace exists
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, req.params.id));
    if (!ws) return res.status(404).json({ error: "Workspace not found" });

    // Verify session exists and has IR
    const session = sessionStore.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Compleo session not found" });
    }
    if (!session.ir) {
      return res.status(400).json({ error: "Session must be analyzed before adding to workspace" });
    }

    // Check if already in workspace
    const existing = await db
      .select()
      .from(workspaceSessions)
      .where(
        and(
          eq(workspaceSessions.workspaceId, ws.id),
          eq(workspaceSessions.sessionId, sessionId)
        )
      );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Session already in workspace" });
    }

    // Add session to workspace
    const wsSessionId = randomUUID();
    await db.insert(workspaceSessions).values({
      id: wsSessionId,
      workspaceId: ws.id,
      sessionId,
      projectName: session.projectName,
      artifactId: session.ir.artifactId ?? session.projectName,
      analysisStatus: "ANALYZED",
    });

    // Resolve cross-module links
    const existingSessions = await db
      .select()
      .from(workspaceSessions)
      .where(eq(workspaceSessions.workspaceId, ws.id));

    const existingProjects: WorkspaceProject[] = [];
    for (const es of existingSessions) {
      if (es.sessionId === sessionId) continue; // Skip the one we just added
      const esSession = sessionStore.get(es.sessionId);
      if (esSession?.ir) {
        existingProjects.push({
          sessionId: es.sessionId,
          projectName: esSession.projectName,
          artifactId: esSession.ir.artifactId ?? esSession.projectName,
          ir: esSession.ir,
        });
      }
    }

    const resolution = resolver.resolveLinks(sessionId, session.ir, existingProjects);

    // Persist resolved links
    for (const link of resolution.resolved) {
      await db.insert(crossModuleLinks).values({
        id: randomUUID(),
        workspaceId: ws.id,
        sourceSessionId: link.sourceSessionId,
        sourceClass: link.sourceClass,
        targetSessionId: link.targetSessionId,
        targetClass: link.targetClass,
        jndiPath: link.jndiPath,
        status: link.status,
        resolvedAt: new Date(),
      });
    }

    // Persist unresolved links
    for (const link of resolution.unresolved) {
      await db.insert(crossModuleLinks).values({
        id: randomUUID(),
        workspaceId: ws.id,
        sourceSessionId: link.sourceSessionId,
        sourceClass: link.sourceClass,
        targetSessionId: null,
        targetClass: link.targetClass,
        jndiPath: link.jndiPath,
        status: "UNRESOLVED",
      });
    }

    // Update previously UNRESOLVED links that are now resolved
    if (resolution.newlyResolvedCount > 0) {
      for (const link of resolution.resolved.filter(l => l.status === "NEWLY_RESOLVED")) {
        // Find and update existing unresolved link
        const existingLinks = await db
          .select()
          .from(crossModuleLinks)
          .where(
            and(
              eq(crossModuleLinks.workspaceId, ws.id),
              eq(crossModuleLinks.sourceSessionId, link.sourceSessionId),
              eq(crossModuleLinks.sourceClass, link.sourceClass),
              eq(crossModuleLinks.status, "UNRESOLVED")
            )
          );

        for (const el of existingLinks) {
          await db
            .update(crossModuleLinks)
            .set({
              targetSessionId: link.targetSessionId,
              status: "NEWLY_RESOLVED",
              resolvedAt: new Date(),
            })
            .where(eq(crossModuleLinks.id, el.id));
        }
      }

      // Update session analysis status to LINKED
      await db
        .update(workspaceSessions)
        .set({ analysisStatus: "LINKED" })
        .where(eq(workspaceSessions.sessionId, sessionId));
    }

    // Fetch final state
    const allLinks = await db
      .select()
      .from(crossModuleLinks)
      .where(eq(crossModuleLinks.workspaceId, ws.id));

    return res.json({
      added: {
        sessionId,
        projectName: session.projectName,
        artifactId: session.ir.artifactId,
      },
      resolution: {
        resolvedCount: resolution.resolved.length,
        unresolvedCount: resolution.unresolved.length,
        newlyResolvedCount: resolution.newlyResolvedCount,
        resolved: resolution.resolved,
        unresolved: resolution.unresolved,
      },
      totalLinks: allLinks.length,
      totalResolved: allLinks.filter(l => l.status !== "UNRESOLVED").length,
      totalUnresolved: allLinks.filter(l => l.status === "UNRESOLVED").length,
    });
  } catch (err: any) {
    console.error("[Workspace] Add project error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/workspace/:id/insights — Workspace Intelligence Analysis ─────

router.get("/:id/insights", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, req.params.id));
    if (!ws) return res.status(404).json({ error: "Workspace not found" });

    // Collect all projects with their IRs
    const sessions = await db
      .select()
      .from(workspaceSessions)
      .where(eq(workspaceSessions.workspaceId, ws.id));

    const projects: Array<{ sessionId: string; projectName: string; ir: ProjectIR }> = [];
    for (const wsSess of sessions) {
      const session = sessionStore.get(wsSess.sessionId);
      if (session?.ir) {
        projects.push({
          sessionId: wsSess.sessionId,
          projectName: session.projectName,
          ir: session.ir,
        });
      }
    }

    if (projects.length === 0) {
      return res.json({
        workspaceId: ws.id,
        workspaceName: ws.name,
        message: "Aucun projet analysé dans le workspace. Ajoutez des projets avec /add-project.",
        insight: intelligenceEngine.analyze(ws.id, []),
      });
    }

    // Run full intelligence analysis
    const insight = intelligenceEngine.analyze(ws.id, projects);

    return res.json({
      workspaceId: ws.id,
      workspaceName: ws.name,
      insight,
    });
  } catch (err: any) {
    console.error("[Workspace] Insights error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/workspace/:id — Delete workspace ──────────────────────────

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const wsId = req.params.id;

    // Delete links, sessions, then workspace
    await db.delete(crossModuleLinks).where(eq(crossModuleLinks.workspaceId, wsId));
    await db.delete(workspaceSessions).where(eq(workspaceSessions.workspaceId, wsId));
    await db.delete(workspaces).where(eq(workspaces.id, wsId));

    return res.json({ deleted: true });
  } catch (err: any) {
    console.error("[Workspace] Delete error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/workspace/:id/generate — Generate multi-module ZIP ──────────

router.post("/:id/generate", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, req.params.id));
    if (!ws) return res.status(404).json({ error: "Workspace not found" });

    const sessions = await db
      .select()
      .from(workspaceSessions)
      .where(eq(workspaceSessions.workspaceId, ws.id));

    if (sessions.length === 0) {
      return res.status(400).json({ error: "Workspace has no projects" });
    }

    const links = await db
      .select()
      .from(crossModuleLinks)
      .where(eq(crossModuleLinks.workspaceId, ws.id));

    // Build resolved links map for the generator
    const resolvedLinksMap = new Map<string, { targetSessionId: string; targetClass: string; targetServiceClass: string }[]>();
    for (const link of links.filter(l => l.status === "RESOLVED" || l.status === "NEWLY_RESOLVED")) {
      const key = `${link.sourceSessionId}:${link.sourceClass}`;
      if (!resolvedLinksMap.has(key)) resolvedLinksMap.set(key, []);
      resolvedLinksMap.get(key)!.push({
        targetSessionId: link.targetSessionId ?? "",
        targetClass: link.targetClass,
        targetServiceClass: link.targetClass.replace(/UC$/, "Service"),
      });
    }

    // Generate each module
    const AdmZip = (await import("adm-zip")).default;
    const parentZip = new AdmZip();
    const moduleResults: { projectName: string; fileCount: number }[] = [];

    for (const wsSess of sessions) {
      const session = sessionStore.get(wsSess.sessionId);
      if (!session?.ir) continue;

      // Enrich IR with cross-module resolved dependencies
      const enrichedIR = enrichIRWithCrossModuleLinks(
        session.ir,
        wsSess.sessionId,
        resolvedLinksMap,
        sessions,
      );

      const result = generateSpringBootProject(enrichedIR);

      // Add to parent ZIP under module directory
      const moduleDir = wsSess.artifactId ?? session.projectName;
      for (const file of result.files) {
        parentZip.addFile(
          `${ws.name}/${moduleDir}/${file.path}`,
          Buffer.from(file.content, "utf8")
        );
      }

      moduleResults.push({
        projectName: session.projectName,
        fileCount: result.files.length,
      });
    }

    // Generate parent pom.xml
    const parentPom = generateParentPom(ws.name, sessions, sessionStore);
    parentZip.addFile(`${ws.name}/pom.xml`, Buffer.from(parentPom, "utf8"));

    // Upload ZIP to S3
    const zipBuffer = parentZip.toBuffer();
    const zipKey = `workspace/${ws.id}/${ws.name}-multi-module.zip`;
    const { url } = await storagePut(zipKey, zipBuffer, "application/zip");

    return res.json({
      zipUrl: url,
      modules: moduleResults,
      totalFiles: moduleResults.reduce((sum, m) => sum + m.fileCount, 0),
      parentPomGenerated: true,
    });
  } catch (err: any) {
    console.error("[Workspace] Generate error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Helper: Enrich IR with cross-module resolved links ────────────────────

function enrichIRWithCrossModuleLinks(
  ir: ProjectIR,
  sessionId: string,
  resolvedLinksMap: Map<string, { targetSessionId: string; targetClass: string; targetServiceClass: string }[]>,
  allSessions: { sessionId: string; projectName: string | null; artifactId: string | null }[],
): ProjectIR {
  const enrichedUseCases = ir.useCases.map(uc => {
    const key = `${sessionId}:${uc.className}`;
    const crossLinks = resolvedLinksMap.get(key);

    if (!crossLinks || crossLinks.length === 0) return uc;

    // Add cross-module services as injected dependencies
    const additionalServices = crossLinks.map(link => {
      const targetSession = allSessions.find(s => s.sessionId === link.targetSessionId);
      const targetModule = targetSession?.artifactId ?? targetSession?.projectName ?? "unknown";
      return {
        type: link.targetServiceClass,
        name: link.targetServiceClass.charAt(0).toLowerCase() + link.targetServiceClass.slice(1),
        crossModule: true,
        sourceModule: targetModule,
      };
    });

    return {
      ...uc,
      injectedServices: [
        ...uc.injectedServices,
        ...additionalServices,
      ],
    };
  });

  return { ...ir, useCases: enrichedUseCases };
}

// ─── Helper: Generate parent pom.xml ───────────────────────────────────────

function generateParentPom(
  workspaceName: string,
  sessions: { sessionId: string; projectName: string | null; artifactId: string | null }[],
  store: typeof sessionStore,
): string {
  const modules = sessions
    .map(s => {
      const session = store.get(s.sessionId);
      return s.artifactId ?? session?.projectName ?? "unknown";
    })
    .map(m => `        <module>${m}</module>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.compleo.workspace</groupId>
    <artifactId>${workspaceName.toLowerCase().replace(/\s+/g, "-")}</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <packaging>pom</packaging>

    <name>${workspaceName}</name>
    <description>Multi-module workspace generated by Compleo Modernizer</description>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
        <relativePath/>
    </parent>

    <modules>
${modules}
    </modules>

    <properties>
        <java.version>17</java.version>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>
</project>
`;
}

// ─── POST /api/workspace/:id/analyze — v13.0 Workspace Analysis ──────────

router.post("/:id/analyze", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    // Récupérer les sessions du workspace
    const sessions = await db.select().from(workspaceSessions).where(eq(workspaceSessions.workspaceId, id));
    if (sessions.length === 0) {
      return res.status(400).json({ error: "Workspace has no projects" });
    }

    // Construire le Workspace (Map<projectName, Map<filePath, content>>)
    const { DependencyAnalyzer } = await import("./engine/workspace/DependencyAnalyzer");
    const { MigrationPlanner } = await import("./engine/workspace/MigrationPlanner");
    const { SharedStubLibrary } = await import("./engine/workspace/SharedStubLibrary");
    type Workspace = import("./engine/workspace/DependencyAnalyzer").Workspace;

    const workspace: Workspace = new Map();
    for (const session of sessions) {
      const store = sessionStore.get(session.sessionId);
      if (!store?.files) continue;
      const fileMap = new Map<string, string>();
      for (const [path, content] of Object.entries(store.files)) {
        if (typeof content === 'string') fileMap.set(path, content);
      }
      workspace.set(session.projectName || session.sessionId, fileMap);
    }

    if (workspace.size === 0) {
      return res.status(400).json({ error: "No project files found in session store" });
    }

    // 1. DependencyAnalyzer
    const analyzer = new DependencyAnalyzer();
    const graph = analyzer.analyze(workspace);
    const mermaidDiagram = analyzer.toMermaidDiagram(graph);
    const topFrameworks = analyzer.getTopExternalFrameworks(graph, 3);

    // 2. MigrationPlanner
    const planner = new MigrationPlanner();
    const plan = planner.plan(graph);
    const planSummary = planner.summarize(plan);

    // 3. SharedStubLibrary (générer pour les top frameworks)
    const stubLib = new SharedStubLibrary();
    const packagesToStub = topFrameworks.map(f => f.rootPackage);
    const stubBundle = stubLib.generate(graph, workspace, packagesToStub, `${sessions[0].projectName || 'workspace'}-stubs`);

    // Formater la réponse
    const response = {
      graph: {
        projects: graph.projects,
        edges: graph.dependencyEdges,
        mermaidDiagram,
      },
      plan: {
        tiers: plan.tiers,
        totalProjects: plan.totalProjects,
        totalEstimatedEffortDays: plan.totalEstimatedEffortDays,
        externalFrameworks: plan.externalFrameworks,
        summary: planSummary,
      },
      stubs: {
        moduleName: stubBundle.moduleName,
        version: stubBundle.version,
        classCount: stubBundle.classCount,
        files: Object.fromEntries(stubBundle.stubFiles),
      },
      topFrameworks,
    };

    return res.json(response);
  } catch (err: any) {
    console.error("[Workspace] Analyze error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/workspace/:id/report.html — Generate HTML report ──────────────────

router.get("/:id/report.html", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    // Load workspace
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!workspace) return res.status(404).json({ error: "Workspace not found" });

    // Load sessions
    const sessions = await db.select().from(workspaceSessions).where(eq(workspaceSessions.workspaceId, id));
    if (sessions.length === 0) {
      return res.status(400).json({ error: "Workspace has no projects" });
    }

    // Build workspace map
    const { DependencyAnalyzer } = await import("./engine/workspace/DependencyAnalyzer");
    const { MigrationPlanner } = await import("./engine/workspace/MigrationPlanner");
    type WorkspaceType = import("./engine/workspace/DependencyAnalyzer").Workspace;
    const workspaceMap: WorkspaceType = new Map();

    for (const session of sessions) {
      const store = sessionStore.get(session.sessionId);
      if (!store?.files) continue;
      const fileMap = new Map<string, string>();
      for (const [path, content] of Object.entries(store.files)) {
        if (typeof content === 'string') fileMap.set(path, content);
      }
      workspaceMap.set(session.projectName || session.sessionId, fileMap);
    }

    if (workspaceMap.size === 0) {
      return res.status(400).json({ error: "No project files found in session store" });
    }

    // Run analysis
    const analyzer = new DependencyAnalyzer();
    const graph = analyzer.analyze(workspaceMap);
    const planner = new MigrationPlanner();
    const plan = planner.plan(graph);

    // Generate report
    const reportGenerator = new WorkspaceReportGenerator();
    const reportInput: ReportInput = {
      workspaceName: workspace.name,
      reportDate: new Date(),
      reference: `WSA-${new Date().toISOString().slice(0, 10)}`,
      graph,
      plan,
    };

    const { html, warnings } = await reportGenerator.generate(reportInput);

    if (warnings.length > 0) {
      console.log(`[Workspace Report] Warnings: ${warnings.join(", ")}`);
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${workspace.name}-audit-report.html"`);
    return res.send(html);
  } catch (err: any) {
    console.error("[Workspace Report] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Export ───────────────────────────────────────────────────────────────────────────

export function registerWorkspaceRoutes(app: import("express").Express) {
  app.use("/api/workspace", router);
  console.log("[Workspace] Routes registered at /api/workspace");
}