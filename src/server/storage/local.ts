import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ExternalServiceError, NotFoundError, ValidationError } from '../http/errors';
import type { PutResult, StorageAdapter } from './adapter';

// Every segment starts with a letter or digit, so `.` and `..` segments cannot occur.
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!KEY_PATTERN.test(key) || !full.startsWith(path.resolve(this.root) + path.sep))
      throw new ValidationError('Invalid storage key');
    return full;
  }

  async put(key: string, data: Buffer | NodeJS.ReadableStream): Promise<PutResult> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const hash = createHash('sha256');
    let bytes = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        bytes += chunk.length;
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    const source = Buffer.isBuffer(data) ? Readable.from(data) : data;
    const tmp = `${full}.${randomUUID()}.tmp`;
    try {
      await pipeline(source, counter, createWriteStream(tmp));
      await fs.rename(tmp, full); // atomic on the same filesystem: readers never see a partial file
    } catch (err) {
      await fs.rm(tmp, { force: true }); // never leave a partial upload behind
      throw err;
    }
    return { bytes, sha256: hash.digest('hex') };
  }

  async get(key: string): Promise<NodeJS.ReadableStream> {
    const full = this.resolve(key);
    try {
      await fs.access(full);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundError('File');
      throw err;
    }
    return createReadStream(full);
  }

  async exists(key: string): Promise<boolean> {
    const full = this.resolve(key);
    try {
      await fs.access(full);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false; // absence is the answer, not a failure
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async probeWritable(): Promise<void> {
    const probe = path.join(this.root, `.probe-${randomUUID()}`);
    try {
      await fs.mkdir(this.root, { recursive: true });
      await fs.writeFile(probe, 'ok');
      await fs.rm(probe);
    } catch (err) {
      throw new ExternalServiceError('storage', `Media root is not writable: ${this.root}`, {
        retryable: true,
        cause: err,
      });
    }
  }
}
