import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { StorageProvider, StoredFile } from './storage-provider.interface.js';

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;
  private urlPrefix: string;

  constructor(baseDir: string, urlPrefix = '/uploads') {
    this.baseDir = baseDir;
    this.urlPrefix = urlPrefix;
    mkdirSync(baseDir, { recursive: true });
  }

  async save(buffer: Buffer, relativePath: string, mimeType: string): Promise<StoredFile> {
    const fullPath = join(this.baseDir, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
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
