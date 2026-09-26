// Preconfigured storage helpers for Manus WebDev templates
// Uploads via Forge Server presigned URL to S3 (PUT direct).
// Downloads return /manus-storage/{key} paths served via 307 redirect.
// Local fallback: when Forge is not configured (no keys), or an upload fails,
// the object is written to disk and served by the same /manus-storage route.

import path from "path";
import os from "os";
import fs from "fs/promises";
import { ENV } from "./_core/env";

// Directory holding objects written by the local fallback.
export const LOCAL_STORAGE_DIR = path.join(os.tmpdir(), "ejb-to-rest-storage");

function isForgeConfigured(): boolean {
  return !!(ENV.forgeApiUrl && ENV.forgeApiKey);
}

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

/** Absolute on-disk path for a storage key, guarded against traversal. */
export function resolveLocalStoragePath(key: string): string | null {
  const clean = normalizeKey(key).replace(/\\/g, "/");
  const full = path.resolve(LOCAL_STORAGE_DIR, clean);
  const root = path.resolve(LOCAL_STORAGE_DIR);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

async function storagePutLocal(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const filePath = resolveLocalStoragePath(key);
  if (!filePath) throw new Error(`Invalid storage key: ${key}`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const buffer = typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data as any);
  await fs.writeFile(filePath, buffer);
  return { key, url: `/manus-storage/${key}` };
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));

  // No Forge credentials (e.g. local run): write to disk and serve locally.
  if (!isForgeConfigured()) {
    return storagePutLocal(key, data, contentType);
  }

  try {
    const { forgeUrl, forgeKey } = getForgeConfig();

    // 1. Get presigned PUT URL from Forge
    const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
    presignUrl.searchParams.set("path", key);

    const presignResp = await fetch(presignUrl, {
      headers: { Authorization: `Bearer ${forgeKey}` },
    });

    if (!presignResp.ok) {
      const msg = await presignResp.text().catch(() => presignResp.statusText);
      throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
    }

    const { url: s3Url } = (await presignResp.json()) as { url: string };
    if (!s3Url) throw new Error("Forge returned empty presign URL");

    // 2. PUT file directly to S3
    const blob =
      typeof data === "string"
        ? new Blob([data], { type: contentType })
        : new Blob([data as any], { type: contentType });

    const uploadResp = await fetch(s3Url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });

    if (!uploadResp.ok) {
      throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
    }

    return { key, url: `/manus-storage/${key}` };
  } catch (err) {
    // Remote storage failed at runtime: keep the object available locally.
    console.warn(`[storage] remote upload failed, falling back to local disk: ${(err as Error).message}`);
    return storagePutLocal(key, data, contentType);
  }
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);

  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}
