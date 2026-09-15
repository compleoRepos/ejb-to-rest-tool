/**
 * Tests de l'extraction d'archives. Les fixtures sont des ZIP fabriques en
 * memoire, dont un exemplaire utilisant l'antislash comme separateur, forme
 * produite par certains outils Windows.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { deflateRawSync } from "zlib";
import { extractArchive } from "./archiveExtract";

interface Fixture {
  name: string;
  content?: string;
  deflated?: boolean;
}

function buildZip(entries: Fixture[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const raw = Buffer.from(entry.content ?? "", "utf8");
    const payload = entry.deflated ? deflateRawSync(raw) : raw;
    const method = entry.deflated ? 8 : 0;

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    locals.push(local, payload);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);

    offset += local.length + payload.length;
  }

  const centralBlock = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBlock, eocd]);
}

let workDir: string;

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "archive-extract-"));
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

async function extractFixture(entries: Fixture[]): Promise<{ target: string; written: number }> {
  const archive = path.join(workDir, "fixture.zip");
  const target = path.join(workDir, "out");
  await fs.writeFile(archive, buildZip(entries));
  const written = await extractArchive(archive, target);
  return { target, written };
}

describe("extractArchive", () => {
  it("extrait une archive aux separateurs normalises", async () => {
    const { target, written } = await extractFixture([
      { name: "projet/" },
      { name: "projet/pom.xml", content: "<project/>" },
      { name: "projet/src/Main.java", content: "class Main {}", deflated: true },
    ]);

    expect(written).toBe(2);
    expect(await fs.readFile(path.join(target, "projet/pom.xml"), "utf8")).toBe("<project/>");
    expect(await fs.readFile(path.join(target, "projet/src/Main.java"), "utf8")).toBe("class Main {}");
  });

  it("extrait une archive dont les entrees utilisent l'antislash", async () => {
    const { target, written } = await extractFixture([
      { name: "projet\\target\\" },
      { name: "projet\\pom.xml", content: "<project/>" },
      { name: "projet\\target\\classes\\Main.class", content: "octets", deflated: true },
    ]);

    expect(written).toBe(2);
    expect((await fs.stat(path.join(target, "projet/target"))).isDirectory()).toBe(true);
    expect(await fs.readFile(path.join(target, "projet/pom.xml"), "utf8")).toBe("<project/>");
    expect(await fs.readFile(path.join(target, "projet/target/classes/Main.class"), "utf8")).toBe("octets");
  });

  it("refuse une entree pointant hors du repertoire cible", async () => {
    await expect(extractFixture([{ name: "../evasion.txt", content: "x" }])).rejects.toThrow(
      /hors du repertoire cible/
    );
  });
});
