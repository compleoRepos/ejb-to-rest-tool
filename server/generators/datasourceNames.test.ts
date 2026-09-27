import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { collectDatasourceNames } from "./outputMappingFix";

async function ejbModule(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ds-"));
  for (const [name, content] of Object.entries(files)) {
    const f = path.join(dir, "src/main/resources/META-INF", name);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, content, "utf-8");
  }
  return dir;
}

describe("collectDatasourceNames", () => {
  it("rend chaque reference jdbc declaree, triee et sans doublon", async () => {
    const dir = await ejbModule({
      "ibm-ejb-jar-bnd.xml": `<resource-ref name="jdbc/ebankdirect_xa" binding-name="jdbc/ebankdirect_xa"/>
<resource-ref name="jdbc/ebankdirect_dwhds_nonxa" binding-name="jdbc/ebankdirect_dwhds_nonxa"/>`,
      "ejb-jar.xml": `<res-ref-name>jdbc/ebankdirect_xa</res-ref-name><res-ref-name>jdbc/ebankdirect_datacenterds_nonxa</res-ref-name>`,
    });
    expect(await collectDatasourceNames(dir)).toEqual([
      "jdbc/ebankdirect_datacenterds_nonxa",
      "jdbc/ebankdirect_dwhds_nonxa",
      "jdbc/ebankdirect_xa",
    ]);
  });

  it("retombe sur jdbc/ebankdirect_xa sans reference", async () => {
    const dir = await ejbModule({ "ejb-jar.xml": "<ejb-jar/>" });
    expect(await collectDatasourceNames(dir)).toEqual(["jdbc/ebankdirect_xa"]);
  });
});
