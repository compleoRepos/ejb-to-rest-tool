/**
 * Local filesystem storage — Autonomous OpenShift deployment.
 * Replaces Manus S3 proxy with local disk storage.
 * Files are stored under STORAGE_PATH (default: /data/uploads)
 * and served via Express static middleware at /uploads/*
 */

import { ENV } from './_core/env';
import * as fs from 'fs';
import * as path from 'path';

function getStoragePath(): string {
  const storagePath = ENV.storagePath || '/data/uploads';
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }
  return storagePath;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, '');
}

/**
 * Store file bytes to local filesystem.
 * Returns { key, url } where url is the public path to access the file.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = 'application/octet-stream'
): Promise<{ key: string; url: string }> {
  const storagePath = getStoragePath();
  const key = normalizeKey(relKey);
  const filePath = path.join(storagePath, key);

  // Ensure parent directories exist
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write file
  const buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
  fs.writeFileSync(filePath, buffer);

  // Return public URL (served by Express static middleware)
  const url = `/uploads/${key}`;
  return { key, url };
}

/**
 * Get a URL for an existing file.
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const url = `/uploads/${key}`;
  return { key, url };
}
