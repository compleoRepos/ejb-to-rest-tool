import { ALL_FIXTURES } from "./fixtures";
import { runFullTest } from "./helpers";

for (const f of ALL_FIXTURES.slice(0, 3)) {
  const r = runFullTest(f);
  const voidFiles = r.generation.files.filter((file: any) => file.content.includes("Void.builder()") || file.content.includes("Void.VoidBuilder"));
  const objectFiles = r.generation.files.filter((file: any) => /public Object \w+\(/.test(file.content));
  console.log(`[${f.id}] Void.builder: ${voidFiles.length} files, Object: ${objectFiles.length} files`);
  for (const vf of voidFiles) {
    console.log(`  Void.builder in: ${vf.path}`);
  }
  for (const of2 of objectFiles) {
    console.log(`  Object in: ${of2.path}`);
  }
}
