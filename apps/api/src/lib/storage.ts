import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
 * Cloudflare R2 (S3-compatible), for hosts without a persistent disk. The bucket stays private: only the API reads it,
 * so photos stay behind login like on local disk.
 */
export class R2Driver implements StorageDriver {
  private client: S3Client;
  private bucket: string;

  constructor(config: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string }) {
    // The S3 endpoint is the account URL; drop a "/<bucket>" path if it was pasted from the dashboard.
    this.client = new S3Client({
      region: "auto",
      endpoint: new URL(config.endpoint).origin,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    this.bucket = config.bucket;
  }

  async put(key: string, body: Buffer, contentType: string) {
    assertKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string) {
    assertKey(key);
    // Rejects with NoSuchKey before any headers are sent.
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.Body as Readable;
  }

  async getBuffer(key: string) {
    assertKey(key);
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async exists(key: string) {
    assertKey(key);
    return this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })).then(
      () => true,
      () => false,
    );
  }

  async delete(key: string) {
    assertKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** R2 when its settings are all present (never in tests), otherwise the local disk. */
export const storage: StorageDriver =
  env.r2.endpoint && env.r2.bucket && env.r2.accessKeyId && env.r2.secretAccessKey && !env.isTest
    ? new R2Driver(env.r2 as { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string })
    : new LocalDiskDriver(() => process.env.UPLOAD_DIR || env.uploadDir);

/** A fresh folder key for one upload: "photos/2026/10/<uuid>". Never derived from the user's file name. */
export function newPhotoFolder(now = new Date()) {
  return `photos/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}`;
}
