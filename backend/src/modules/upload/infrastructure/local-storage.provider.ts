import { mkdirSync, chmodSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { StorageProvider, StoredFile } from './storage-provider.interface.js';

const DIR_MODE = 0o777;

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;
  private urlPrefix: string;

  constructor(baseDir: string, urlPrefix = '/uploads') {
    this.baseDir = baseDir;
    this.urlPrefix = urlPrefix;
    mkdirSync(baseDir, { recursive: true, mode: DIR_MODE });
    try { chmodSync(baseDir, DIR_MODE); } catch { /* bind mount may restrict chmod */ }
  }

  async save(buffer: Buffer, relativePath: string, mimeType: string): Promise<StoredFile> {
    const fullPath = join(this.baseDir, relativePath);
    const dir = dirname(fullPath);
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    try { chmodSync(dir, DIR_MODE); } catch { /* bind mount may restrict chmod */ }
    writeFileSync(fullPath, buffer);

    return {
      filePath: `${this.urlPrefix}/${relativePath}`,
      size: buffer.length,
      mimeType,
    };
  }

  async delete(relativePath: string): Promise<void> {
    const fullPath = join(this.baseDir, relativePath);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }

  getUrl(relativePath: string): string {
    return `${this.urlPrefix}/${relativePath}`;
  }
}
