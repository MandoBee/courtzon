import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { uploadRepository } from '../../upload/infrastructure/upload.repository.js';
import { organisationRepository } from '../infrastructure/repositories/organisation.repository.js';

const UPLOAD_BASE = resolve(import.meta.dirname, '..', '..', '..', '..', 'uploads');

function uploadFileExists(publicPath: string | null): boolean {
  if (!publicPath) return false;
  const relative = publicPath.replace(/^\/uploads\/?/, '');
  return existsSync(join(UPLOAD_BASE, relative));
}

async function resolveCategory(
  orgId: number,
  category: 'logo' | 'cover',
  storedUrl: string | null,
  healDb: boolean,
): Promise<string | null> {
  if (uploadFileExists(storedUrl)) return storedUrl;

  const uploads = await uploadRepository.findByEntity('organisation', orgId, category);
  const latest = uploads[0];
  const field = category === 'logo' ? 'logo_url' : 'cover_url';

  if (!latest?.file_path || !uploadFileExists(latest.file_path)) {
    if (healDb && storedUrl) {
      await organisationRepository.update(orgId, { [field]: null });
    }
    return null;
  }

  if (healDb && latest.file_path !== storedUrl) {
    await organisationRepository.update(orgId, { [field]: latest.file_path });
  }

  return latest.file_path;
}

/** Use latest on-disk upload when organisations.logo_url/cover_url points at a deleted file. */
export async function resolveOrganisationMedia(
  orgId: number,
  logoUrl: string | null,
  coverUrl: string | null,
  options?: { healDb?: boolean },
): Promise<{ logo_url: string | null; cover_url: string | null }> {
  const healDb = options?.healDb !== false;
  const [logo_url, cover_url] = await Promise.all([
    resolveCategory(orgId, 'logo', logoUrl, healDb),
    resolveCategory(orgId, 'cover', coverUrl, healDb),
  ]);
  return { logo_url, cover_url };
}
