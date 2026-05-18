/**
 * Tests unitaires — ParenBalancer v12.12
 * Couvre les patterns BMCE de parenthèses multi-lignes.
 */
import { describe, test, expect } from "vitest";
import { ParenBalancer } from "./ParenBalancer";

describe("ParenBalancer — BMCE log multi-ligne", () => {

  test("log.info multi-ligne sans parenthèse fermante", () => {
    const source = `
      public void m() {
        log.info("error "
            + e.getMessage()
            + " for user "
            + user.getId();
      }
    `;
    const b = new ParenBalancer();
    const { fixed, fixCount } = b.balance(source);
    expect(fixCount).toBeGreaterThan(0);
    expect(fixed).toContain("user.getId());");
  });

  test("Statement déjà balancé — pas de modification", () => {
    const source = `
      public void m() {
        log.info("ok " + user.getId());
      }
    `;
    const b = new ParenBalancer();
    const { fixCount } = b.balance(source);
    expect(fixCount).toBe(0);
  });

  test("Strings avec parens à l'intérieur — ignorées", () => {
    const source = `
      String s = "hello (world)";
      System.out.println(s);
    `;
    const b = new ParenBalancer();
    const { fixCount } = b.balance(source);
    expect(fixCount).toBe(0);
  });

  test("Appel multi-ligne avec 2 parenthèses manquantes", () => {
    const source = `
      public void m() {
        service.execute(
            request.getBody(
                "param1",
                "param2";
      }
    `;
    const b = new ParenBalancer();
    const { fixed, fixCount } = b.balance(source);
    expect(fixCount).toBe(2);
    expect(fixed).toContain('"param2"));');
  });

  test("Commentaire ligne avec parens — ignoré", () => {
    const source = `
      // log.info("test (
      int x = 5;
    `;
    const b = new ParenBalancer();
    const { fixCount } = b.balance(source);
    expect(fixCount).toBe(0);
  });

  test("Bloc comment avec parens — ignoré", () => {
    const source = `
      /* log.info("test (
         more stuff ) */
      int x = 5;
    `;
    const b = new ParenBalancer();
    const { fixCount } = b.balance(source);
    expect(fixCount).toBe(0);
  });

  test("Pattern BMCE réel: actionTestEmail multi-ligne", () => {
    const source = `
      public void process() {
        actionTestEmail(((Action) envIn.getBody()).getOperation(),
            envIn.getHeader().getSessionId(),
            envIn.getHeader().getLang();
      }
    `;
    const b = new ParenBalancer();
    const { fixed, fixCount } = b.balance(source);
    expect(fixCount).toBeGreaterThan(0);
    // La ligne avec ; doit avoir les ) manquantes insérées
    expect(fixed).toContain("getLang()");
    expect(fixed).toContain(";");
  });
});
