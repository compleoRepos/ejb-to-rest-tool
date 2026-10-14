import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { findGeneratedWeb, withoutGeneratedWeb, keepRepositoryFiles, hasRepositoryReadme } from "./repositoryFix";
import { generateAdapterDocumentation } from "./adapterGenerator";

const LATIN1 = Buffer.from([0x63, 0x6f, 0x6e, 0x74, 0x72, 0xf4, 0x6c, 0x65, 0x0d, 0x0a]);

async function write(root: string, rel: string, content: string | Buffer) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

async function read(root: string, rel: string) {
  return fs.readFile(path.join(root, rel));
}

describe("depot qui porte deja son module web", () => {
  let base: string;
  let input: string;
  let output: string;

  beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), "repo-"));
    input = path.join(base, "neobank-x");
    output = path.join(base, "sortie");
    await write(input, "pom.xml", "<project>\r\n\t<modules>\r\n\t\t<module>neobank-x-ejb</module>\r\n\t\t<module>neobank-x-web</module>\r\n\t</modules>\r\n</project>\r\n");
    await write(input, "neobank-x-ejb/pom.xml", "<project>ejb</project>\r\n");
    await write(input, "neobank-x-ejb/src/main/java/A.java", LATIN1);
    await write(input, "neobank-x-ear/pom.xml", "<project>ear neobank-x-web</project>\r\n");
    await write(input, "neobank-x-web/pom.xml", "<project>ancien web</project>\n");
    await write(input, "neobank-x-web/src/main/resources/descriptor/neobank-x.json", "{}");
    await write(input, "neobank-x-web/src/main/java/Ancien.java", "class Ancien {}");
    await write(input, "README.md", "# redige a la main\r\n");
    await write(input, "docs/fiche-deploiement.md", "fiche\r\n");
    await write(input, "docs/runbooks/README.md", "runbooks\r\n");
    await write(input, "sql/sequences.sql", "create sequence s;\r\n");
    await write(input, ".gitignore", "target/\r\n");
    await write(input, "neobank-x-ejb/target/classes/A.class", "binaire");
    await write(input, ".git/HEAD", "ref: refs/heads/refonte/lot1-v1\n");
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it("reconnait le module web genere a son descripteur d'endpoints", async () => {
    expect(await findGeneratedWeb(input)).toBe("neobank-x-web");
    await fs.rm(path.join(input, "neobank-x-web/src/main/resources/descriptor"), { recursive: true });
    expect(await findGeneratedWeb(input)).toBeNull();
  });

  it("ecarte l'ancien module web de l'entree du generateur", async () => {
    const source = await withoutGeneratedWeb(input);
    expect(source.previousWeb).toBe("neobank-x-web");
    expect(source.path).not.toBe(input);
    const entries = await fs.readdir(source.path);
    expect(entries).not.toContain("neobank-x-web");
    expect(entries).not.toContain(".git");
    expect(entries).toContain("neobank-x-ejb");
    expect(await read(source.path, "neobank-x-ejb/src/main/java/A.java")).toEqual(LATIN1);
    await source.cleanup();
    expect(await fs.readdir(input)).toContain("neobank-x-web");
  });

  it("rend tout le depot a l'octet pres, sauf le module web regenere", async () => {
    await write(output, "pom.xml", "<project>regenere</project>\n");
    await write(output, "neobank-x-ejb/pom.xml", "<project>ejb reecrit</project>\n");
    await write(output, "neobank-x-ejb/src/main/java/A.java", "reencode");
    await write(output, "neobank-x-ear/pom.xml", "<project>ear regenere</project>\n");
    await write(output, "neobank-x-web/pom.xml", "<project>nouveau web</project>\n");
    await write(output, "README.md", "# README du moteur\n");
    await keepRepositoryFiles(output, input);

    for (const rel of [
      "pom.xml",
      "neobank-x-ejb/pom.xml",
      "neobank-x-ejb/src/main/java/A.java",
      "neobank-x-ear/pom.xml",
      "README.md",
      "docs/fiche-deploiement.md",
      "docs/runbooks/README.md",
      "sql/sequences.sql",
      ".gitignore",
    ]) {
      expect(await read(output, rel), rel).toEqual(await read(input, rel));
    }
    expect((await read(output, "neobank-x-web/pom.xml")).toString()).toContain("nouveau web");
    await expect(fs.access(path.join(output, "neobank-x-web/src/main/java/Ancien.java"))).rejects.toThrow();
    await expect(fs.access(path.join(output, "neobank-x-ejb/target"))).rejects.toThrow();
    await expect(fs.access(path.join(output, ".git"))).rejects.toThrow();
  });

  it("premiere generation : poms racine et EAR generes conserves, le reste rendu tel quel", async () => {
    await fs.rm(path.join(input, "neobank-x-web"), { recursive: true });
    await write(output, "pom.xml", "<project>avec module web</project>\n");
    await write(output, "neobank-x-ear/pom.xml", "<project>ear avec war</project>\n");
    await write(output, "neobank-x-web/pom.xml", "<project>web</project>\n");
    await write(output, "README.md", "# README du moteur\n");
    await keepRepositoryFiles(output, input);

    expect((await read(output, "pom.xml")).toString()).toContain("avec module web");
    expect((await read(output, "neobank-x-ear/pom.xml")).toString()).toContain("ear avec war");
    expect(await read(output, "README.md")).toEqual(await read(input, "README.md"));
    expect(await read(output, "sql/sequences.sql")).toEqual(await read(input, "sql/sequences.sql"));
    expect(await read(output, ".gitignore")).toEqual(await read(input, ".gitignore"));
  });

  it("le README du depot n'est pas reecrit par la documentation", async () => {
    await write(output, "README.md", "# redige a la main\r\n");
    await write(output, "DEPLOYMENT.md", "obsolete");
    expect(await hasRepositoryReadme(input)).toBe(true);
    await generateAdapterDocumentation(output, "neobank-x", 1, 1, true);
    expect((await read(output, "README.md")).toString()).toBe("# redige a la main\r\n");
    await expect(fs.access(path.join(output, "DEPLOYMENT.md"))).rejects.toThrow();
  });
});
