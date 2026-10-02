import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '../http/errors';
import { LocalStorageAdapter } from './local';

let root: string;
let storage: LocalStorageAdapter;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'saathi-storage-'));
  storage = new LocalStorageAdapter(root);
});
afterEach(async () => fs.rm(root, { recursive: true, force: true }));

describe('LocalStorageAdapter', () => {
  it('stores, reports size and sha256, reads back, and deletes', async () => {
    const put = await storage.put('private/a/b.txt', Buffer.from('hello'));
    expect(put.bytes).toBe(5);
    expect(put.sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    const chunks: Buffer[] = [];
    for await (const c of await storage.get('private/a/b.txt')) chunks.push(Buffer.from(c));
    expect(Buffer.concat(chunks).toString()).toBe('hello');
    expect(await storage.exists('private/a/b.txt')).toBe(true);
    await storage.delete('private/a/b.txt');
    expect(await storage.exists('private/a/b.txt')).toBe(false);
  });

  it('get rejects with NotFoundError for a missing key', async () => {
    await expect(storage.get('private/missing.txt')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('accepts a stream', async () => {
    const put = await storage.put('public/s.txt', Readable.from(['ab', 'cd']));
    expect(put.bytes).toBe(4);
  });

  it('rejects path traversal and absolute keys', async () => {
    for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'C:\\x', 'a\\b', '']) {
      await expect(storage.put(bad, Buffer.from('x'))).rejects.toThrow(/key/i);
    }
    expect(await fs.readdir(root)).toEqual([]);
  });

  // These resolve inside the root, so only the key pattern rejects them: an accepted `a/../b` would alias `b`.
  it('rejects dot segments that stay inside the root', async () => {
    for (const bad of ['a/../b', 'private/./x', './x', 'private/..', '.hidden']) {
      await expect(storage.put(bad, Buffer.from('x'))).rejects.toBeInstanceOf(ValidationError);
      await expect(storage.exists(bad)).rejects.toBeInstanceOf(ValidationError);
    }
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('rejects Windows reserved device names in any segment, with or without an extension', async () => {
    for (const bad of ['con', 'nul.txt', 'a/COM1/b', 'private/Lpt9', 'aux.tar.gz', 'PRN/x']) {
      await expect(storage.exists(bad)).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it('accepts names that only start like a reserved device name', async () => {
    for (const good of ['private/console.txt', 'private/con-1', 'private/com10', 'private/nulls.txt']) {
      await storage.put(good, Buffer.from('x'));
      expect(await storage.exists(good)).toBe(true);
    }
  });

  it('accepts dots inside a segment', async () => {
    await storage.put('private/x..jpg', Buffer.from('x'));
    expect(await storage.exists('private/x..jpg')).toBe(true);
  });

  it('exists rejects an invalid key instead of answering false', async () => {
    for (const bad of ['../x', 'a/../../x', '/etc/passwd', '']) {
      await expect(storage.exists(bad)).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it('exists rethrows a filesystem error other than ENOENT', async () => {
    const denied = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    vi.spyOn(fs, 'access').mockRejectedValueOnce(denied);
    await expect(storage.exists('private/a.txt')).rejects.toBe(denied);
  });

  it('removes the temp file and rethrows when the source stream fails midway', async () => {
    const boom = new Error('source failed midway');
    async function* failing(): AsyncGenerator<Buffer> {
      yield Buffer.from('partial');
      throw boom;
    }
    await expect(storage.put('private/f.txt', Readable.from(failing()))).rejects.toBe(boom);
    const entries = await fs.readdir(root, { recursive: true });
    expect(entries.filter((e) => e.endsWith('.tmp'))).toEqual([]);
    expect(await storage.exists('private/f.txt')).toBe(false);
  });

  // chmod is advisory on Windows; CI (Linux) exercises this test
  it.skipIf(process.platform === 'win32')(
    'probeWritable throws a retryable ExternalServiceError when the root is not writable',
    async () => {
      const unwritable = new LocalStorageAdapter(path.join(root, 'missing', 'deeper'));
      await fs.mkdir(path.join(root, 'missing'), { recursive: true });
      await fs.chmod(path.join(root, 'missing'), 0o500);
      await expect(unwritable.probeWritable()).rejects.toMatchObject({ service: 'storage', retryable: true });
    },
  );
});
