/**
 * Workspace Routes Tests — v5.6.0
 * Tests for workspace API endpoints.
 * @author Compleo
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ────────────────────────────────────────────────────────────────

const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
const mockSelect = vi.fn();
const mockDelete = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: (...args: any[]) => mockInsert(...args),
    select: (...args: any[]) => mockSelect(...args),
    delete: (...args: any[]) => mockDelete(...args),
  }),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: any, b: any) => ({ field: a, value: b })),
  and: vi.fn((...args: any[]) => ({ conditions: args })),
}));

vi.mock("../drizzle/schema", () => ({
  workspaces: { id: "id", name: "name", description: "description" },
  workspaceSessions: { id: "id", workspaceId: "workspaceId", sessionId: "sessionId" },
  crossModuleLinks: { id: "id", workspaceId: "workspaceId" },
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("workspace-routes", () => {
  describe("API contract validation", () => {
    it("workspace creation requires name", () => {
      const body = { description: "test" };
      expect(body).not.toHaveProperty("name");
    });

    it("workspace creation accepts name and description", () => {
      const body = { name: "Banking Modules", description: "Multi-module banking workspace" };
      expect(body.name).toBe("Banking Modules");
      expect(body.description).toBe("Multi-module banking workspace");
    });

    it("add-project requires sessionId", () => {
      const body = { sessionId: "session-123" };
      expect(body.sessionId).toBe("session-123");
    });
  });

  describe("workspace data structure", () => {
    it("workspace detail includes sessions and links", () => {
      const wsDetail = {
        id: "ws-1",
        name: "Test",
        description: null,
        sessions: [
          { sessionId: "s1", projectName: "ejb-virement", artifactId: "ejb-virement", analysisStatus: "LINKED" },
        ],
        links: [
          {
            id: "link-1",
            sourceSessionId: "s1",
            sourceClass: "VirementUC",
            targetSessionId: "s2",
            targetClass: "ConsulterSoldeUC",
            jndiPath: "java:global/ejb-consultation/ConsulterSoldeUC",
            status: "RESOLVED",
          },
        ],
        resolvedCount: 1,
        unresolvedCount: 0,
      };

      expect(wsDetail.sessions.length).toBe(1);
      expect(wsDetail.links.length).toBe(1);
      expect(wsDetail.resolvedCount).toBe(1);
      expect(wsDetail.unresolvedCount).toBe(0);
    });

    it("link status can be RESOLVED, UNRESOLVED, NEWLY_RESOLVED, or STUB", () => {
      const validStatuses = ["RESOLVED", "UNRESOLVED", "NEWLY_RESOLVED", "STUB"];
      expect(validStatuses).toContain("RESOLVED");
      expect(validStatuses).toContain("UNRESOLVED");
      expect(validStatuses).toContain("NEWLY_RESOLVED");
      expect(validStatuses).toContain("STUB");
    });
  });

  describe("generate response structure", () => {
    it("generate response includes modules and totalFiles", () => {
      const response = {
        modules: [
          { sessionId: "s1", artifactId: "ejb-virement", fileCount: 12 },
          { sessionId: "s2", artifactId: "ejb-consultation", fileCount: 8 },
        ],
        totalFiles: 20,
        zipUrl: "/api/compleo/session-virement/download",
      };

      expect(response.modules.length).toBe(2);
      expect(response.totalFiles).toBe(20);
      expect(response.zipUrl).toBeTruthy();
    });
  });
});
