import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const UPLOAD_ROOT = resolve(import.meta.dirname, '..', '..', '..', 'uploads');

export function uploadFileExists(publicPath: string | null | undefined): boolean {
  if (!publicPath?.trim()) return false;
  const relative = publicPath.replace(/^\/uploads\/?/, '');
  return existsSync(join(UPLOAD_ROOT, relative));
}

/** Return the URL only when the file exists on disk (avoids 404s for stale DB paths). */
export function sanitizeUploadUrl(publicPath: string | null | undefined): string | null {
  if (!publicPath) return null;
  return uploadFileExists(publicPath) ? publicPath : null;
}
