import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../env.js";

/**
 * Where uploaded files live. Keys are opaque, server-generated paths ("photos/2026/10/<uuid>/original.jpg")
 * so a driver for S3 or similar can replace the local disk one without touching callers.
 */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Streams the file; rejects with a NotFound-ish error when it doesn't exist. */
  get(key: string): Promise<Readable>;
  getBuffer(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*(\/[A-Za-z0-9][A-Za-z0-9_.-]*)*$/;

/** Rejects anything that isn't a plain relative key (no "..", no absolute paths, no odd characters). */
export function assertKey(key: string) {
  if (!KEY_RE.test(key) || key.split("/").some((s) => s === "." || s === "..")) throw new Error(`Invalid storage key: ${key}`);
}

export class LocalDiskDriver implements StorageDriver {
  /** The root is resolved on every call so tests can point UPLOAD_DIR at a temp dir. */
  constructor(private root: () => string) {}

  private resolve(key: string) {
    assertKey(key);
    const root = path.resolve(this.root());
    const file = path.resolve(root, key);
    if (!file.startsWith(root + path.sep)) throw new Error(`Invalid storage key: ${key}`);
    return file;
  }

  async put(key: string, body: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body, { flag: "wx" }); // never overwrite an existing file
  }

  async get(key: string) {
    const file = this.resolve(key);
    await stat(file); // throws ENOENT before headers are sent
    return createReadStream(file);
  }

  async getBuffer(key: string) {
    return readFile(this.resolve(key));
  }

  async exists(key: string) {
    try {
      return (await stat(this.resolve(key))).isFile();
    } catch {
      return false;
    }
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

/**
 * Cloudinary, for hosts without a persistent disk (Vercel). Files are stored byte-for-byte as private "raw" assets
 * (public id = key) and only the API can read them, so photos stay behind login like on local disk.
 */
export class CloudinaryDriver implements StorageDriver {
  private static readonly opts = { resource_type: "raw", type: "authenticated" } as const;

  constructor(config: { cloudName: string; apiKey: string; apiSecret: string }) {
    cloudinary.config({ cloud_name: config.cloudName, api_key: config.apiKey, api_secret: config.apiSecret, secure: true });
  }

  async put(key: string, body: Buffer) {
    assertKey(key);
    await new Promise<void>((resolve, reject) => {
      cloudinary.uploader
        // overwrite: false keeps the existing file and reports existing: true instead of failing; treat that as an error.
        .upload_stream({ ...CloudinaryDriver.opts, public_id: key, overwrite: false }, (err, res) =>
          err ? reject(err) : res?.existing ? reject(new Error(`Storage key already exists: ${key}`)) : resolve(),
        )
        .end(body);
    });
  }

  private async fetch(key: string, method: "GET" | "HEAD" = "GET") {
    assertKey(key);
    const url = cloudinary.url(key, { ...CloudinaryDriver.opts, sign_url: true });
    const res = await fetch(url, { method });
    if (!res.ok) throw new Error(`Storage file not found: ${key} (${res.status})`);
    return res;
  }

  async get(key: string) {
    const res = await this.fetch(key);
    return Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  }

  async getBuffer(key: string) {
    return Buffer.from(await (await this.fetch(key)).arrayBuffer());
  }

  async exists(key: string) {
    return this.fetch(key, "HEAD").then(
      () => true,
      () => false,
    );
  }

  async delete(key: string) {
    assertKey(key);
    await cloudinary.uploader.destroy(key, { ...CloudinaryDriver.opts, invalidate: true });
  }
}

/** Cloudinary when its credentials are set (never in tests), otherwise the local disk. */
export const storage: StorageDriver =
  env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret && !env.isTest
    ? new CloudinaryDriver(env.cloudinary as { cloudName: string; apiKey: string; apiSecret: string })
    : new LocalDiskDriver(() => process.env.UPLOAD_DIR || env.uploadDir);

/** A fresh folder key for one upload: "photos/2026/10/<uuid>". Never derived from the user's file name. */
export function newPhotoFolder(now = new Date()) {
  return `photos/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}`;
}
