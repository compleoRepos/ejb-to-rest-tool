import { describe, it } from "vitest";
import { ALL_FIXTURES } from "./fixtures";
import { runFullTest } from "./helpers";

describe("debug", () => {
  it("check Void.builder and Object", () => {
    for (const f of ALL_FIXTURES.slice(0, 3)) {
      const r = runFullTest(f);
      const voidFiles = r.generation.files.filter((file: any) => file.content.includes("Void.builder()") || file.content.includes("Void.VoidBuilder"));
      const objectFiles = r.generation.files.filter((file: any) => /public Object \w+\(/.test(file.content));
      console.log(`[${f.id}] Void.builder: ${voidFiles.length} files, Object: ${objectFiles.length} files`);
      for (const vf of voidFiles) {
        const lines = vf.content.split("\n").filter((l: string) => l.includes("Void.builder") || l.includes("Void.VoidBuilder"));
        console.log(`  Void.builder in: ${vf.path} → ${lines[0]?.trim()}`);
      }
      for (const of2 of objectFiles) {
        const lines = of2.content.split("\n").filter((l: string) => /public Object \w+\(/.test(l));
        console.log(`  Object in: ${of2.path} → ${lines[0]?.trim()}`);
      }
    }
  });
});
