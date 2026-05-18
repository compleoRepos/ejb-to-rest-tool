/**
 * Tests STEP 1 — Error handling global + logger structuré
 * @author Compleo
 */
import { describe, it, expect, vi } from "vitest";
import { globalErrorHandler, AppError } from "../../server/middleware/error-handler";
import { asyncHandler } from "../../server/middleware/async-handler";
import { createLogger } from "../../server/utils/logger";

describe("STEP 1: Error handling global", () => {
  function mockReq(overrides: any = {}) {
    return { method: "POST", path: "/api/test", body: { foo: "bar" }, ...overrides } as any;
  }

  function mockRes() {
    const res: any = {
      headersSent: false,
      statusCode: 200,
      status(code: number) { res.statusCode = code; return res; },
      json(data: any) { res._json = data; return res; },
    };
    return res;
  }

  it("Erreur 500 retourne JSON propre, pas de stack en prod", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const err: AppError = new Error("DB connection failed");
    err.statusCode = 500;
    const req = mockReq();
    const res = mockRes();

    globalErrorHandler(err, req, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res._json.error.message).toBe("Erreur interne du serveur");
    expect(res._json.error.stack).toBeUndefined(); // Pas de stack en prod

    process.env.NODE_ENV = originalEnv;
  });

  it("Erreur 400 retourne le message opérationnel", () => {
    const err: AppError = new Error("Fichier ZIP invalide");
    err.statusCode = 400;
    err.isOperational = true;
    err.code = "INVALID_ZIP";
    const req = mockReq();
    const res = mockRes();

    globalErrorHandler(err, req, res, () => {});

    expect(res.statusCode).toBe(400);
    expect(res._json.error.message).toBe("Fichier ZIP invalide");
    expect(res._json.error.code).toBe("INVALID_ZIP");
  });

  it("Ne pas envoyer si headersSent", () => {
    const err: AppError = new Error("test");
    const req = mockReq();
    const res = mockRes();
    res.headersSent = true;

    globalErrorHandler(err, req, res, () => {});

    expect(res._json).toBeUndefined(); // Rien envoyé
  });

  it("Erreur sans statusCode → 500 par défaut", () => {
    const err = new Error("unknown");
    const req = mockReq();
    const res = mockRes();

    globalErrorHandler(err as AppError, req, res, () => {});

    expect(res.statusCode).toBe(500);
  });
});

describe("STEP 1: asyncHandler", () => {
  it("Endpoint async qui throw → next(err) appelé", async () => {
    const error = new Error("async boom");
    const handler = asyncHandler(async () => { throw error; });

    const req = {} as any;
    const res = {} as any;
    const next = vi.fn();

    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("Endpoint async réussi → next pas appelé", async () => {
    const handler = asyncHandler(async (_req, res) => {
      res.json({ ok: true });
    });

    const req = {} as any;
    const res = { json: vi.fn() } as any;
    const next = vi.fn();

    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});

describe("STEP 1: Logger structuré", () => {
  it("createLogger retourne un logger avec les 4 niveaux", () => {
    const log = createLogger("TestContext");
    expect(log.debug).toBeDefined();
    expect(log.info).toBeDefined();
    expect(log.warn).toBeDefined();
    expect(log.error).toBeDefined();
  });

  it("Logger écrit sur la console", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createLogger("Test");
    log.info("hello", { key: "value" });
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("[Test]");
    expect(output).toContain("hello");
    spy.mockRestore();
  });
});
