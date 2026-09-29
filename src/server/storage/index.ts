import 'server-only';
import { getConfig } from '../config';
import type { StorageAdapter } from './adapter';
import { LocalStorageAdapter } from './local';

let instance: StorageAdapter | undefined;

/** PLAN.md D20: local now; an `s3` implementation is added when §19 triggers it. */
export function getStorage(): StorageAdapter {
  if (!instance) instance = new LocalStorageAdapter(getConfig().mediaRoot);
  return instance;
}
