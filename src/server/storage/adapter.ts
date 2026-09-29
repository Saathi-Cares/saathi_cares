export type PutResult = { bytes: number; sha256: string };

export interface StorageAdapter {
  put(key: string, data: Buffer | NodeJS.ReadableStream, opts: { contentType: string }): Promise<PutResult>;
  get(key: string): Promise<NodeJS.ReadableStream>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  probeWritable(): Promise<void>;
}
