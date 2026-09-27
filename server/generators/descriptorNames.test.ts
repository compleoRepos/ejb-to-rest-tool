import { describe, it, expect } from "vitest";
import { jsonPropertyName } from "./descriptorGenerator";

describe("jsonPropertyName", () => {
  it("rend le nom lu par Jackson 1 depuis les accesseurs", () => {
    expect(jsonPropertyName("IdCtr")).toBe("idCtr");
    expect(jsonPropertyName("NumDeleg")).toBe("numDeleg");
    expect(jsonPropertyName("numToken")).toBe("numToken");
    expect(jsonPropertyName("URLRetour")).toBe("urlretour");
  });
});
