/**
 * Tests vitest pour les routers tRPC v4.0
 * Couvre : projects, files, scans, comments, git, sharing
 * @author Compleo
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ============================================================
// Mock the database module
// ============================================================

vi.mock("./db", () => {
  const mockProjects = new Map<number, any>();
  let projectIdCounter = 0;
  const mockFiles = new Map<number, any[]>();
  const mockScans = new Map<number, any>();
  let scanIdCounter = 0;
  const mockComments = new Map<number, any>();
  let commentIdCounter = 0;
  const mockGitConnections = new Map<number, any>();
  let gitIdCounter = 0;
  const mockSharedReports = new Map<number, any>();
  let sharedIdCounter = 0;

  return {
    listProjects: vi.fn(async () => Array.from(mockProjects.values())),
    getProjectById: vi.fn(async (id: number) => mockProjects.get(id) ?? null),
    createProject: vi.fn(async (data: any) => {
      const id = ++projectIdCounter;
      const project = { id, ...data, status: "active", createdAt: new Date(), updatedAt: new Date() };
      mockProjects.set(id, project);
      return project;
    }),
    updateProject: vi.fn(async (id: number, data: any) => {
      const existing = mockProjects.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...data, updatedAt: new Date() };
      mockProjects.set(id, updated);
      return updated;
    }),
    deleteProject: vi.fn(async (id: number) => {
      mockProjects.delete(id);
    }),
    getProjectFiles: vi.fn(async (projectId: number) => mockFiles.get(projectId) ?? []),
    addProjectFiles: vi.fn(async (files: any[]) => {
      if (files.length > 0) {
        mockFiles.set(files[0].projectId, files);
      }
      return files;
    }),
    deleteProjectFiles: vi.fn(async (projectId: number) => {
      mockFiles.delete(projectId);
    }),
    listScans: vi.fn(async (projectId: number) => {
      return Array.from(mockScans.values()).filter((s: any) => s.projectId === projectId);
    }),
    getScanById: vi.fn(async (id: number) => mockScans.get(id) ?? null),
    createScan: vi.fn(async (data: any) => {
      const id = ++scanIdCounter;
      const scan = { id, ...data, createdAt: new Date() };
      mockScans.set(id, scan);
      return scan;
    }),
    updateScan: vi.fn(async (id: number, data: any) => {
      const existing = mockScans.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...data };
      mockScans.set(id, updated);
      return updated;
    }),
    listComments: vi.fn(async (projectId: number) => {
      return Array.from(mockComments.values()).filter((c: any) => c.projectId === projectId);
    }),
    createComment: vi.fn(async (data: any) => {
      const id = ++commentIdCounter;
      const comment = { id, ...data, validationStatus: "pending", createdAt: new Date() };
      mockComments.set(id, comment);
      return comment;
    }),
    updateComment: vi.fn(async (id: number, data: any) => {
      const existing = mockComments.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...data };
      mockComments.set(id, updated);
      return updated;
    }),
    deleteComment: vi.fn(async (id: number) => {
      mockComments.delete(id);
    }),
    getGitConnections: vi.fn(async (projectId: number) => {
      return Array.from(mockGitConnections.values()).filter((g: any) => g.projectId === projectId);
    }),
    createGitConnection: vi.fn(async (data: any) => {
      const id = ++gitIdCounter;
      const conn = { id, ...data, status: "connected", createdAt: new Date() };
      mockGitConnections.set(id, conn);
      return conn;
    }),
    deleteGitConnection: vi.fn(async (id: number) => {
      mockGitConnections.delete(id);
    }),
    listSharedReports: vi.fn(async (projectId: number) => {
      return Array.from(mockSharedReports.values()).filter((r: any) => r.projectId === projectId);
    }),
    createSharedReport: vi.fn(async (data: any) => {
      const id = ++sharedIdCounter;
      const report = { id, ...data, viewCount: 0, createdAt: new Date() };
      mockSharedReports.set(id, report);
      return report;
    }),
    getSharedReportByToken: vi.fn(async (token: string) => {
      return Array.from(mockSharedReports.values()).find((r: any) => r.shareToken === token) ?? null;
    }),
  };
});

// ============================================================
// Helper: create a public context (no auth required)
// ============================================================

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ============================================================
// Helper: create an authenticated context (for protectedProcedure)
// ============================================================

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-open-id-123",
      name: "Test User",
      email: "test@compleo.dev",
      avatarUrl: null,
      role: "admin" as const,
      createdAt: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ============================================================
// Tests
// ============================================================

describe("projects router", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  it("creates a project", async () => {
    const project = await caller.projects.create({
      name: "Test Legacy App",
      description: "A test Java legacy application",
    });
    expect(project).toBeDefined();
    expect(project.name).toBe("Test Legacy App");
    expect(project.id).toBeGreaterThan(0);
  });

  it("lists projects", async () => {
    const projects = await caller.projects.list();
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);
  });

  it("gets a project by id", async () => {
    const created = await caller.projects.create({ name: "GetById Test" });
    const fetched = await caller.projects.getById({ id: created.id });
    expect(fetched).toBeDefined();
    expect(fetched?.name).toBe("GetById Test");
  });

  it("updates a project", async () => {
    const created = await caller.projects.create({ name: "Before Update" });
    const updated = await caller.projects.update({
      id: created.id,
      name: "After Update",
      status: "completed",
      legacyScore: 72,
      modernScore: 89,
    });
    expect(updated?.name).toBe("After Update");
    expect(updated?.status).toBe("completed");
  });

  it("deletes a project", async () => {
    const created = await caller.projects.create({ name: "To Delete" });
    const result = await caller.projects.delete({ id: created.id });
    expect(result).toEqual({ success: true });
    const fetched = await caller.projects.getById({ id: created.id });
    expect(fetched).toBeNull();
  });

  it("creates a project with git info", async () => {
    const project = await caller.projects.create({
      name: "Git Project",
      gitUrl: "https://github.com/user/repo",
      gitProvider: "github",
      gitBranch: "main",
    });
    expect(project.gitUrl).toBe("https://github.com/user/repo");
    expect(project.gitProvider).toBe("github");
  });
});

describe("files router", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  it("uploads files to a project", async () => {
    const project = await caller.projects.create({ name: "Files Test" });
    const result = await caller.files.upload({
      projectId: project.id,
      files: [
        {
          filePath: "src/main/java/PaymentService.java",
          fileName: "PaymentService.java",
          content: "@Stateless\npublic class PaymentService {\n  @EJB\n  private AccountBean accountBean;\n}",
          lineCount: 4,
          technologies: ["ejb"],
        },
        {
          filePath: "src/main/java/OrderServlet.java",
          fileName: "OrderServlet.java",
          content: "public class OrderServlet extends HttpServlet {\n  protected void doGet(HttpServletRequest req, HttpServletResponse resp) {}\n}",
          lineCount: 3,
          technologies: ["servlet"],
        },
      ],
    });
    expect(result).toBeDefined();
    expect(result.length).toBe(2);
  });

  it("lists files for a project", async () => {
    const project = await caller.projects.create({ name: "List Files Test" });
    await caller.files.upload({
      projectId: project.id,
      files: [{ filePath: "Test.java", fileName: "Test.java", content: "class Test {}" }],
    });
    const files = await caller.files.list({ projectId: project.id });
    expect(Array.isArray(files)).toBe(true);
  });

  it("deletes all files for a project", async () => {
    const project = await caller.projects.create({ name: "Delete Files Test" });
    await caller.files.upload({
      projectId: project.id,
      files: [{ filePath: "Test.java", fileName: "Test.java", content: "class Test {}" }],
    });
    const result = await caller.files.deleteAll({ projectId: project.id });
    expect(result).toEqual({ success: true });
  });
});

describe("scans router", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  it("creates a scan", async () => {
    const project = await caller.projects.create({ name: "Scan Test" });
    const scan = await caller.scans.create({
      projectId: project.id,
      scanType: "full",
    });
    expect(scan).toBeDefined();
    expect(scan.projectId).toBe(project.id);
    expect(scan.scanType).toBe("full");
    expect(scan.status).toBe("pending");
  });

  it("lists scans for a project", async () => {
    const project = await caller.projects.create({ name: "List Scans Test" });
    await caller.scans.create({ projectId: project.id });
    const scans = await caller.scans.list({ projectId: project.id });
    expect(Array.isArray(scans)).toBe(true);
  });

  it("updates scan results", async () => {
    const project = await caller.projects.create({ name: "Update Scan Test" });
    const scan = await caller.scans.create({ projectId: project.id });
    const updated = await caller.scans.updateResult({
      id: scan.id,
      status: "completed",
      filesAnalyzed: 15,
      technologies: ["ejb", "servlet", "jdbc"],
      legacyScore: 68,
      modernScore: 85,
      issuesCount: 23,
      criticalCount: 3,
      warningCount: 12,
      durationMs: 4500,
    });
    expect(updated?.status).toBe("completed");
    expect(updated?.filesAnalyzed).toBe(15);
    expect(updated?.legacyScore).toBe(68);
  });

  it("gets a scan by id", async () => {
    const project = await caller.projects.create({ name: "Get Scan Test" });
    const scan = await caller.scans.create({ projectId: project.id });
    const fetched = await caller.scans.getById({ id: scan.id });
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(scan.id);
  });
});

describe("comments router (collaboration)", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  it("creates a comment", async () => {
    const project = await caller.projects.create({ name: "Comment Test" });
    const comment = await caller.comments.create({
      projectId: project.id,
      authorName: "Compleo",
      content: "Les @EJB doivent etre remplacés par @Autowired",
      commentType: "review",
    });
    expect(comment).toBeDefined();
    expect(comment.authorName).toBe("Compleo");
    expect(comment.commentType).toBe("review");
    expect(comment.validationStatus).toBe("pending");
  });

  it("lists comments for a project", async () => {
    const project = await caller.projects.create({ name: "List Comments Test" });
    await caller.comments.create({
      projectId: project.id,
      authorName: "Reviewer",
      content: "LGTM",
      commentType: "validation",
    });
    const comments = await caller.comments.list({ projectId: project.id });
    expect(Array.isArray(comments)).toBe(true);
  });

  it("updates validation status", async () => {
    const project = await caller.projects.create({ name: "Validation Test" });
    const comment = await caller.comments.create({
      projectId: project.id,
      authorName: "Lead Dev",
      content: "Approved after review",
      commentType: "validation",
    });
    const updated = await caller.comments.updateValidation({
      id: comment.id,
      validationStatus: "approved",
    });
    expect(updated?.validationStatus).toBe("approved");
  });

  it("deletes a comment", async () => {
    const project = await caller.projects.create({ name: "Delete Comment Test" });
    const comment = await caller.comments.create({
      projectId: project.id,
      authorName: "Test",
      content: "To delete",
    });
    const result = await caller.comments.delete({ id: comment.id });
    expect(result).toEqual({ success: true });
  });

  it("creates a comment with file reference", async () => {
    const project = await caller.projects.create({ name: "File Ref Comment" });
    const comment = await caller.comments.create({
      projectId: project.id,
      authorName: "Reviewer",
      content: "SQL injection risk at this line",
      commentType: "review",
      filePath: "src/main/java/UserDAO.java",
      lineNumber: 42,
    });
    expect(comment.filePath).toBe("src/main/java/UserDAO.java");
    expect(comment.lineNumber).toBe(42);
  });
});

describe("git router", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  it("connects a git repository", async () => {
    const project = await caller.projects.create({ name: "Git Connect Test" });
    const conn = await caller.git.connect({
      projectId: project.id,
      provider: "github",
      repoUrl: "https://github.com/user/legacy-app",
      repoName: "legacy-app",
      defaultBranch: "main",
      isMonorepo: false,
    });
    expect(conn).toBeDefined();
    expect(conn.provider).toBe("github");
    expect(conn.repoName).toBe("legacy-app");
  });

  it("lists git connections for a project", async () => {
    const project = await caller.projects.create({ name: "List Git Test" });
    await caller.git.connect({
      projectId: project.id,
      provider: "gitlab",
      repoUrl: "https://gitlab.com/user/app",
      repoName: "app",
    });
    const connections = await caller.git.list({ projectId: project.id });
    expect(Array.isArray(connections)).toBe(true);
  });

  it("disconnects a git repository", async () => {
    const project = await caller.projects.create({ name: "Disconnect Git Test" });
    const conn = await caller.git.connect({
      projectId: project.id,
      provider: "bitbucket",
      repoUrl: "https://bitbucket.org/user/app",
      repoName: "app",
    });
    const result = await caller.git.disconnect({ id: conn.id });
    expect(result).toEqual({ success: true });
  });

  it("supports all git providers", async () => {
    const project = await caller.projects.create({ name: "All Providers Test" });
    const providers = ["github", "gitlab", "bitbucket", "azure_devops"] as const;
    for (const provider of providers) {
      const conn = await caller.git.connect({
        projectId: project.id,
        provider,
        repoUrl: `https://${provider}.com/user/app`,
        repoName: `app-${provider}`,
      });
      expect(conn.provider).toBe(provider);
    }
  });
});

describe("sharing router", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  it("creates a shared report", async () => {
    const project = await caller.projects.create({ name: "Share Test" });
    const report = await caller.sharing.create({
      projectId: project.id,
      title: "Rapport d'analyse Q1 2026",
    });
    expect(report).toBeDefined();
    expect(report.title).toBe("Rapport d'analyse Q1 2026");
    expect(report.shareToken).toBeDefined();
    expect(report.shareToken.length).toBeGreaterThan(10);
  });

  it("lists shared reports for a project", async () => {
    const project = await caller.projects.create({ name: "List Share Test" });
    await caller.sharing.create({
      projectId: project.id,
      title: "Test Report",
    });
    const reports = await caller.sharing.list({ projectId: project.id });
    expect(Array.isArray(reports)).toBe(true);
  });

  it("gets a shared report by token", async () => {
    const project = await caller.projects.create({ name: "Get Share Test" });
    const created = await caller.sharing.create({
      projectId: project.id,
      title: "Token Test Report",
    });
    const fetched = await caller.sharing.getByToken({ token: created.shareToken });
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe("Token Test Report");
  });

  it("returns null for unknown token", async () => {
    const fetched = await caller.sharing.getByToken({ token: "nonexistent-token-12345" });
    expect(fetched).toBeNull();
  });
});

describe("input validation", () => {
  const ctx = createPublicContext();
  const caller = appRouter.createCaller(ctx);

  it("rejects empty project name", async () => {
    await expect(caller.projects.create({ name: "" })).rejects.toThrow();
  });

  it("rejects empty comment content", async () => {
    await expect(
      caller.comments.create({
        projectId: 1,
        authorName: "Test",
        content: "",
      })
    ).rejects.toThrow();
  });

  it("rejects empty author name", async () => {
    await expect(
      caller.comments.create({
        projectId: 1,
        authorName: "",
        content: "Test comment",
      })
    ).rejects.toThrow();
  });

  it("rejects invalid git provider", async () => {
    await expect(
      caller.git.connect({
        projectId: 1,
        provider: "svn" as any,
        repoUrl: "https://svn.example.com/repo",
        repoName: "repo",
      })
    ).rejects.toThrow();
  });

  it("rejects invalid scan type", async () => {
    await expect(
      caller.scans.create({
        projectId: 1,
        scanType: "invalid" as any,
      })
    ).rejects.toThrow();
  });

  it("rejects invalid project status", async () => {
    await expect(
      caller.projects.update({
        id: 1,
        status: "invalid" as any,
      })
    ).rejects.toThrow();
  });
});
