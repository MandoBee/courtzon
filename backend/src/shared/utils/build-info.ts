import { readFileSync } from 'node:fs';

/**
 * Build/runtime metadata resolution for operational endpoints
 * (`GET /health/version`, and the payment gateway diagnostics endpoint).
 *
 * Why this exists: the image bakes `/app/git-commit.txt` from the `GIT_COMMIT`
 * Docker build arg. When a CI/CD platform (e.g. Coolify) builds the image
 * WITHOUT passing that arg, the file contains the literal "unknown" — and the
 * previous inline resolver returned it verbatim, MASKING any valid runtime value
 * (e.g. a commit SHA exposed via environment). This resolver treats empty and
 * "unknown" as absent, then falls back to runtime environment variables, so the
 * deployed commit is observable whenever the platform exposes it.
 */

const UNKNOWN = 'unknown';

function clean(value: string | undefined | null): string | null {
  const v = (value ?? '').trim();
  if (!v || v.toLowerCase() === UNKNOWN) return null;
  return v;
}

/**
 * Resolve an operational build value, in order:
 *   1. the build-time file baked into the image (skipped when missing/empty/"unknown"),
 *   2. the first non-empty runtime environment variable in `envKeys`,
 *   3. the literal 'unknown'.
 */
export function readBuildValue(filePath: string, envKeys: string[]): string {
  try {
    const fromFile = clean(readFileSync(filePath, 'utf-8'));
    if (fromFile) return fromFile;
  } catch {
    /* file absent (local dev / no metadata layer) — fall through to env */
  }

  for (const key of envKeys) {
    const fromEnv = clean(process.env[key]);
    if (fromEnv) return fromEnv;
  }
  return UNKNOWN;
}

/** Commit SHA of the running build (baked file → runtime env → 'unknown'). */
export function getGitCommit(): string {
  return readBuildValue('/app/git-commit.txt', [
    'GIT_COMMIT',
    'SOURCE_COMMIT',
    'GITHUB_SHA',
    'COMMIT_SHA',
  ]);
}

/** Build timestamp of the running image. */
export function getBuildTime(): string {
  return readBuildValue('/app/build-time.txt', ['BUILD_TIME', 'SOURCE_DATE']);
}

/** Application version. */
export function getAppVersion(): string {
  return readBuildValue('/app/version.txt', ['APP_VERSION']);
}

/** Expected migration marker baked into the image. */
export function getExpectedMigration(): string {
  return readBuildValue('/app/expected-migration.txt', ['EXPECTED_MIGRATION']);
}
