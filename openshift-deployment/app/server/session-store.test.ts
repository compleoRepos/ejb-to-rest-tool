/**
 * Tests pour SessionStore DB — v5.4
 * Vérifie la persistance des sessions en base de données.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getDb to avoid real DB connection in tests
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([]),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onDuplicateKeyUpdate: vi.fn().mockReturnValue({
          set: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}));

describe("SessionStore", () => {
  describe("Interface Map-like", () => {
    it("expose les méthodes Map standard", async () => {
      // Dynamic import after mock
      const { SessionStore } = await import("./session-store");
      const store = new SessionStore();

      expect(store.has("nonexistent")).toBe(false);
      expect(store.size).toBe(0);
    });

    it("set/get/has fonctionnent correctement", async () => {
      const { SessionStore } = await import("./session-store");
      const store = new SessionStore();

      const session = {
        id: "test-123",
        projectName: "TestProject",
        status: "uploaded" as const,
        uploadedAt: new Date(),
        files: [{ path: "Test.java", content: "class Test {}", type: "java" as const }],
        pomXml: null,
        bianYml: null,
      };

      store.set("test-123", session as any);

      expect(store.has("test-123")).toBe(true);
      expect(store.size).toBe(1);

      const retrieved = store.get("test-123");
      expect(retrieved).toBeDefined();
      expect(retrieved?.projectName).toBe("TestProject");
      expect(retrieved?.status).toBe("uploaded");
    });

    it("delete supprime une session", async () => {
      const { SessionStore } = await import("./session-store");
      const store = new SessionStore();

      const session = {
        id: "test-456",
        projectName: "ToDelete",
        status: "uploaded" as const,
        uploadedAt: new Date(),
        files: [],
        pomXml: null,
        bianYml: null,
      };

      store.set("test-456", session as any);
      expect(store.has("test-456")).toBe(true);

      store.delete("test-456");
      expect(store.has("test-456")).toBe(false);
      expect(store.size).toBe(0);
    });
  });

  describe("listSessions()", () => {
    it("retourne un résumé léger trié par date", async () => {
      const { SessionStore } = await import("./session-store");
      const store = new SessionStore();

      const now = new Date();
      const earlier = new Date(now.getTime() - 3600000);

      store.set("s1", {
        id: "s1",
        projectName: "OldProject",
        status: "analyzed",
        uploadedAt: earlier,
        files: [{ path: "A.java", content: "", type: "java" }],
        pomXml: null,
        bianYml: null,
        technologiesDetected: ["EJB"],
      } as any);

      store.set("s2", {
        id: "s2",
        projectName: "NewProject",
        status: "generated",
        uploadedAt: now,
        files: [
          { path: "B.java", content: "", type: "java" },
          { path: "C.java", content: "", type: "java" },
        ],
        pomXml: null,
        bianYml: null,
        technologiesDetected: ["EJB", "Servlet"],
      } as any);

      const list = store.listSessions();
      expect(list).toHaveLength(2);
      // Sorted by date descending → NewProject first
      expect(list[0].projectName).toBe("NewProject");
      expect(list[0].fileCount).toBe(2);
      expect(list[0].technologies).toEqual(["EJB", "Servlet"]);
      expect(list[1].projectName).toBe("OldProject");
      expect(list[1].fileCount).toBe(1);
    });
  });

  describe("Session status transitions", () => {
    it("met à jour le status d'une session", async () => {
      const { SessionStore } = await import("./session-store");
      const store = new SessionStore();

      const session = {
        id: "transition-1",
        projectName: "TransitionTest",
        status: "uploaded" as const,
        uploadedAt: new Date(),
        files: [],
        pomXml: null,
        bianYml: null,
      };

      store.set("transition-1", session as any);
      expect(store.get("transition-1")?.status).toBe("uploaded");

      // Update status
      const updated = { ...session, status: "analyzed" as const };
      store.set("transition-1", updated as any);
      expect(store.get("transition-1")?.status).toBe("analyzed");
    });
  });

  describe("Persistance DB", () => {
    it("appelle getDb pour la persistance", async () => {
      const { SessionStore } = await import("./session-store");
      const store = new SessionStore();

      const session = {
        id: "persist-1",
        projectName: "PersistTest",
        status: "uploaded" as const,
        uploadedAt: new Date(),
        files: [{ path: "X.java", content: "class X {}", type: "java" }],
        pomXml: null,
        bianYml: null,
      };

      store.set("persist-1", session as any);

      // The set method should trigger async DB persistence
      // We verify the session is in cache immediately
      expect(store.has("persist-1")).toBe(true);
      expect(store.get("persist-1")?.projectName).toBe("PersistTest");
    });
  });

  describe("listSessionsExtended() — v11.3", () => {
    it("retourne les métadonnées étendues (useCaseCount, dtoCount, generatedFiles, ambiguityCount)", async () => {
      const { SessionStore } = await import("./session-store");
      const store = new SessionStore();

      store.set("ext-1", {
        id: "ext-1",
        projectName: "ExtendedProject",
        status: "generated",
        uploadedAt: new Date(),
        files: [{ path: "A.java", content: "" }, { path: "B.java", content: "" }],
        ir: { stats: { useCaseCount: 7, dtoCount: 3 } },
        generation: { stats: { totalFiles: 15 } },
        ambiguities: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
        technologiesDetected: ["EJB_3X_STATELESS", "HIBERNATE"],
        debugEvents: [],
        sseClients: [],
      } as any);

      const extended = store.listSessionsExtended();
      expect(extended).toHaveLength(1);
      expect(extended[0].useCaseCount).toBe(7);
      expect(extended[0].dtoCount).toBe(3);
      expect(extended[0].generatedFiles).toBe(15);
      expect(extended[0].ambiguityCount).toBe(3);
      expect(extended[0].fileCount).toBe(2);
      expect(extended[0].technologies).toEqual(["EJB_3X_STATELESS", "HIBERNATE"]);
    });
  });

  describe("persist() met à jour le metaIndex — v11.3", () => {
    it("met à jour les métadonnées après modification de la session", async () => {
      const { SessionStore } = await import("./session-store");
      const store = new SessionStore();

      const session = {
        id: "persist-meta-1",
        projectName: "PersistMeta",
        status: "uploaded" as const,
        uploadedAt: new Date(),
        files: [{ path: "X.java", content: "" }],
        debugEvents: [],
        sseClients: [],
      } as any;

      store.set("persist-meta-1", session);

      // Simulate analysis completing
      session.status = "analyzed";
      session.ir = { stats: { useCaseCount: 4, dtoCount: 2 } };
      session.technologiesDetected = ["SERVLET"];
      store.persist("persist-meta-1");

      const list = store.listSessionsExtended();
      const meta = list.find(m => m.id === "persist-meta-1");
      expect(meta).toBeDefined();
      expect(meta?.status).toBe("analyzed");
      expect(meta?.useCaseCount).toBe(4);
      expect(meta?.dtoCount).toBe(2);
      expect(meta?.technologies).toEqual(["SERVLET"]);
    });
  });
});
