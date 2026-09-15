/**
 * Extraction d'archives ZIP/JAR/WAR sans binaire externe.
 */
import fs from "fs/promises";
import path from "path";
import { inflateRawSync } from "zlib";

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;
const ZIP64_EXTRA_ID = 0x0001;
const UINT32_MAX = 0xffffffff;

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

/** Position du bloc de fin de repertoire central, cherche depuis la fin. */
function findEndOfCentralDirectory(buffer: Buffer): number {
  const lowerBound = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= lowerBound; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIG) return offset;
  }
  throw new Error("Archive illisible : fin de repertoire central introuvable");
}

/** Nombre d'entrees et position du repertoire central, format 32 bits ou ZIP64. */
function readDirectoryLocation(buffer: Buffer, eocd: number): { count: number; offset: number } {
  let count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  if (count === 0xffff || offset === UINT32_MAX) {
    const locator = eocd - 20;
    if (locator >= 0 && buffer.readUInt32LE(locator) === EOCD64_LOCATOR_SIG) {
      const eocd64 = Number(buffer.readBigUInt64LE(locator + 8));
      if (buffer.readUInt32LE(eocd64) !== EOCD64_SIG) {
        throw new Error("Archive illisible : bloc ZIP64 invalide");
      }
      count = Number(buffer.readBigUInt64LE(eocd64 + 32));
      offset = Number(buffer.readBigUInt64LE(eocd64 + 48));
    }
  }

  return { count, offset };
}

/** Tailles et position reelles quand l'entree porte un champ additionnel ZIP64. */
function applyZip64Extra(entry: CentralEntry, extra: Buffer): void {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const headerId = extra.readUInt16LE(cursor);
    const size = extra.readUInt16LE(cursor + 2);
    if (headerId === ZIP64_EXTRA_ID) {
      let field = cursor + 4;
      if (entry.uncompressedSize === UINT32_MAX) {
        entry.uncompressedSize = Number(extra.readBigUInt64LE(field));
        field += 8;
      }
      if (entry.compressedSize === UINT32_MAX) {
        entry.compressedSize = Number(extra.readBigUInt64LE(field));
        field += 8;
      }
      if (entry.localOffset === UINT32_MAX) {
        entry.localOffset = Number(extra.readBigUInt64LE(field));
      }
      return;
    }
    cursor += 4 + size;
  }
}

/**
 * Normalise un nom d'entree : certaines archives produites sous Windows
 * utilisent l'antislash comme separateur, ce que la specification interdit.
 */
function normalizeEntryName(rawName: string): string {
  return rawName.replace(/\\/g, "/").replace(/^\/+/, "");
}

function readCentralDirectory(buffer: Buffer): CentralEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  const { count, offset } = readDirectoryLocation(buffer, eocd);

  const entries: CentralEntry[] = [];
  let cursor = offset;

  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIG) {
      throw new Error("Archive illisible : entree de repertoire central invalide");
    }
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);

    const entry: CentralEntry = {
      name: buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength),
      method: buffer.readUInt16LE(cursor + 10),
      compressedSize: buffer.readUInt32LE(cursor + 20),
      uncompressedSize: buffer.readUInt32LE(cursor + 24),
      localOffset: buffer.readUInt32LE(cursor + 42),
    };

    if (
      entry.compressedSize === UINT32_MAX ||
      entry.uncompressedSize === UINT32_MAX ||
      entry.localOffset === UINT32_MAX
    ) {
      applyZip64Extra(entry, buffer.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength));
    }

    entries.push(entry);
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function inflateEntry(buffer: Buffer, entry: CentralEntry): Buffer {
  const localNameLength = buffer.readUInt16LE(entry.localOffset + 26);
  const localExtraLength = buffer.readUInt16LE(entry.localOffset + 28);
  const dataStart = entry.localOffset + 30 + localNameLength + localExtraLength;
  const payload = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) return Buffer.from(payload);
  if (entry.method === 8) return inflateRawSync(payload);
  throw new Error(`Methode de compression non supportee (${entry.method}) pour ${entry.name}`);
}

/**
 * Extrait une archive dans un repertoire cible et retourne le nombre de fichiers ecrits.
 */
export async function extractArchive(archivePath: string, targetDir: string): Promise<number> {
  const buffer = await fs.readFile(archivePath);
  const entries = readCentralDirectory(buffer);
  const root = path.resolve(targetDir);
  await fs.mkdir(root, { recursive: true });

  let written = 0;

  for (const entry of entries) {
    const name = normalizeEntryName(entry.name);
    if (!name || name.startsWith("__MACOSX/")) continue;

    const destination = path.resolve(root, name);
    if (destination !== root && !destination.startsWith(root + path.sep)) {
      throw new Error(`Entree d'archive hors du repertoire cible : ${entry.name}`);
    }

    if (name.endsWith("/")) {
      await fs.mkdir(destination, { recursive: true });
      continue;
    }

    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, inflateEntry(buffer, entry));
    written++;
  }

  return written;
}
