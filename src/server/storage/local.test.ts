import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    const put = await storage.put('private/a/b.txt', Buffer.from('hello'), { contentType: 'text/plain' });
    expect(put.bytes).toBe(5);
    expect(put.sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    const chunks: Buffer[] = [];
    for await (const c of await storage.get('private/a/b.txt')) chunks.push(Buffer.from(c));
    expect(Buffer.concat(chunks).toString()).toBe('hello');
    expect(await storage.exists('private/a/b.txt')).toBe(true);
    await storage.delete('private/a/b.txt');
    expect(await storage.exists('private/a/b.txt')).toBe(false);
  });

  it('accepts a stream', async () => {
    const put = await storage.put('public/s.txt', Readable.from(['ab', 'cd']), { contentType: 'text/plain' });
    expect(put.bytes).toBe(4);
  });

  it('rejects path traversal and absolute keys', async () => {
    for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'C:\\x', 'a\\b', '']) {
      await expect(storage.put(bad, Buffer.from('x'), { contentType: 'text/plain' })).rejects.toThrow(/key/i);
    }
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('removes the temp file and rethrows when the source stream fails midway', async () => {
    const boom = new Error('source failed midway');
    async function* failing(): AsyncGenerator<Buffer> {
      yield Buffer.from('partial');
      throw boom;
    }
    await expect(
      storage.put('private/f.txt', Readable.from(failing()), { contentType: 'text/plain' }),
    ).rejects.toBe(boom);
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
