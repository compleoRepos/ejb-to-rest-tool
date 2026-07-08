import { describe, it, expect } from "vitest";
import { inferBianDomain, inferBianActionTerm, toPascalCase } from "./bianGenerator";

describe("BIAN Generator - Service Domain Mapping", () => {
  it("should map virement to Payment Order", () => {
    const result = inferBianDomain("virement-bmcedirect");
    expect(result.domain).toBe("Payment Order");
    expect(result.domainId).toBe("payment-order");
  });

  it("should map carte to Card Administration", () => {
    const result = inferBianDomain("gestion-carte-bmcedirect");
    expect(result.domain).toBe("Card Administration");
  });

  it("should map credit/pret to Consumer Loan", () => {
    const result = inferBianDomain("simulation-credit");
    expect(result.domain).toBe("Consumer Loan");
  });

  it("should map notification/sms to Party Notification", () => {
    const result = inferBianDomain("envoi-sms-bmcedirect");
    expect(result.domain).toBe("Party Notification");
  });

  it("should map compte to Current Account", () => {
    const result = inferBianDomain("consultation-compte");
    expect(result.domain).toBe("Current Account");
  });

  it("should map change/devise to Foreign Exchange", () => {
    const result = inferBianDomain("change-devise");
    expect(result.domain).toBe("Foreign Exchange");
  });

  it("should map facture/paiement to Payment Execution", () => {
    const result = inferBianDomain("paiement-facture-bmcedirect");
    expect(result.domain).toBe("Payment Execution");
  });

  it("should default unknown adapters to Customer Management", () => {
    const result = inferBianDomain("unknown-random-project");
    expect(result.domain).toBe("Customer Management");
  });
});

describe("BIAN Generator - Action Term Inference", () => {
  it("should infer Initiate for creation operations", () => {
    expect(inferBianActionTerm("saveVirement", "POST")).toBe("Initiate");
    expect(inferBianActionTerm("createOrder", "POST")).toBe("Initiate");
    expect(inferBianActionTerm("addBeneficiaire", "POST")).toBe("Initiate");
  });

  it("should infer Retrieve for query operations", () => {
    expect(inferBianActionTerm("findSolde", "GET")).toBe("Retrieve");
    expect(inferBianActionTerm("getSolde", "GET")).toBe("Retrieve");
    expect(inferBianActionTerm("listComptes", "GET")).toBe("Retrieve");
    expect(inferBianActionTerm("searchClient", "GET")).toBe("Retrieve");
  });

  it("should infer Update for modification operations", () => {
    expect(inferBianActionTerm("updateAdresse", "PUT")).toBe("Update");
    expect(inferBianActionTerm("modifyProfile", "PUT")).toBe("Update");
  });

  it("should infer Control for deletion operations", () => {
    expect(inferBianActionTerm("deleteVirement", "DELETE")).toBe("Control");
    expect(inferBianActionTerm("cancelOperation", "POST")).toBe("Control");
  });

  it("should infer Evaluate for validation operations", () => {
    expect(inferBianActionTerm("validateIBAN", "POST")).toBe("Evaluate");
    expect(inferBianActionTerm("checkSolde", "GET")).toBe("Evaluate");
  });

  it("should infer Execute for execution operations", () => {
    expect(inferBianActionTerm("executeVirement", "POST")).toBe("Execute");
    expect(inferBianActionTerm("processPayment", "POST")).toBe("Execute");
  });

  it("should fall back to HTTP method when operation name is ambiguous", () => {
    expect(inferBianActionTerm("doSomething", "GET")).toBe("Retrieve");
    expect(inferBianActionTerm("doSomething", "POST")).toBe("Initiate");
    expect(inferBianActionTerm("doSomething", "PUT")).toBe("Update");
    expect(inferBianActionTerm("doSomething", "DELETE")).toBe("Control");
  });
});

describe("BIAN Generator - Utility Functions", () => {
  it("should convert to PascalCase correctly", () => {
    expect(toPascalCase("virement-bmcedirect")).toBe("VirementBmcedirect");
    expect(toPascalCase("payment-order")).toBe("PaymentOrder");
    expect(toPascalCase("card_administration")).toBe("CardAdministration");
    expect(toPascalCase("simple")).toBe("Simple");
  });

  it("should handle empty and single-char strings", () => {
    expect(toPascalCase("a")).toBe("A");
    expect(toPascalCase("ab")).toBe("Ab");
  });
});
