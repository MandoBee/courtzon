import { resolve } from 'node:path';
import { env } from '../../../config/env.js';
import type { StorageProvider } from './storage-provider.interface.js';
import { LocalStorageProvider } from './local-storage.provider.js';
import { S3StorageProvider } from './s3-storage.provider.js';

const UPLOAD_BASE = resolve(import.meta.dirname, '..', '..', '..', '..', 'uploads');

export function createStorageProvider(): StorageProvider {
  if (env.STORAGE_PROVIDER === 's3' || env.STORAGE_PROVIDER === 'r2') {
    return new S3StorageProvider();
  }
  return new LocalStorageProvider(UPLOAD_BASE);
}
