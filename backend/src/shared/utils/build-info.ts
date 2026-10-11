import { readFileSync } from 'node:fs';

/**
 * Build/runtime metadata resolution for operational endpoints
 * (`GET /health/version`, and the payment gateway diagnostics endpoint).
 *
 * Revision provenance (root-cause fix for stale deployment metadata):
 *   - The deployment platform (Coolify) always exposes `SOURCE_COMMIT` to the
 *     RUNNING container — the exact commit the platform deployed. Coolify
 *     excludes it from the image build by default, so a value that is true at
 *     runtime must never be overridden by a commit baked into the image.
 *   - `GIT_COMMIT` was historically baked from a manually maintained env var and
 *     could be reported even when it was stale. It is now only a last-resort
 *     fallback and is never treated as corroborated.
 *
 * Precedence for the commit reported by the running container:
 *   1. platform runtime commit (SOURCE_COMMIT → GITHUB_SHA → COMMIT_SHA)
 *   2. commit baked into the image (`/app/git-commit.txt`)
 *   3. legacy `GIT_COMMIT` runtime env (not corroborated)
 *   4. the literal 'unknown'
 * A lower-priority source that disagrees with the chosen value is surfaced via
 * `mismatch`. Agreement of all available sources is reported as `consistent` —
 * a consistency check only, never proof of build provenance.
 */

const UNKNOWN = 'unknown';

/** Platform-supplied, per-deploy commit variables (authoritative at runtime). */
const PLATFORM_COMMIT_ENV_KEYS = ['SOURCE_COMMIT', 'GITHUB_SHA', 'COMMIT_SHA'] as const;

/** Legacy/manual commit variable — accepted only as a last resort. */
const LEGACY_COMMIT_ENV_KEYS = ['GIT_COMMIT'] as const;

/** Path of the commit file baked into the image at build time. */
export const IMAGE_GIT_COMMIT_FILE = '/app/git-commit.txt';

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

function readBakedCommit(filePath: string): string {
  try {
    return clean(readFileSync(filePath, 'utf-8')) ?? UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

function readFirstEnv(keys: readonly string[]): { value: string; key: string } | null {
  for (const key of keys) {
    const value = clean(process.env[key]);
    if (value) return { value, key };
  }
  return null;
}

export type GitCommitSource = 'platform' | 'image' | 'legacy-env' | 'unknown';

export interface GitCommitInfo {
  /** Authoritative commit of the running container, or 'unknown'. */
  commit: string;
  /** Which source produced `commit`. */
  source: GitCommitSource;
  /** Commit baked into the image, or 'unknown'. */
  imageCommit: string;
  /** Commit supplied by the platform at runtime, or 'unknown'. */
  platformCommit: string;
  /**
   * True when `commit` is known and no available lower-priority source disagrees
   * with it. This is a consistency check only — it does NOT verify that the
   * running artifact was built from that revision and is not proof of build
   * provenance (a platform-supplied runtime value is a claim, not proof).
   */
  consistent: boolean;
  /** True when a lower-priority source reports a different commit. */
  mismatch: boolean;
}

/**
 * Resolve the running container's commit together with its provenance.
 * The platform-supplied runtime commit wins over anything baked into the image,
 * so a stale build arg can never masquerade as the deployed revision.
 */
export function getGitCommitInfo(filePath: string = IMAGE_GIT_COMMIT_FILE): GitCommitInfo {
  const imageCommit = readBakedCommit(filePath);
  const platform = readFirstEnv(PLATFORM_COMMIT_ENV_KEYS);
  const legacy = readFirstEnv(LEGACY_COMMIT_ENV_KEYS);

  if (platform) {
    const contradicting = [imageCommit, legacy?.value].filter(
      (v): v is string => !!v && v !== UNKNOWN && v !== platform.value,
    );
    return {
      commit: platform.value,
      source: 'platform',
      imageCommit,
      platformCommit: platform.value,
      consistent: contradicting.length === 0,
      mismatch: contradicting.length > 0,
    };
  }

  if (imageCommit !== UNKNOWN) {
    const contradictsImage = !!legacy && legacy.value !== imageCommit;
    return {
      commit: imageCommit,
      source: 'image',
      imageCommit,
      platformCommit: UNKNOWN,
      consistent: !contradictsImage,
      mismatch: contradictsImage,
    };
  }

  if (legacy) {
    return {
      commit: legacy.value,
      source: 'legacy-env',
      imageCommit,
      platformCommit: UNKNOWN,
      consistent: false,
      mismatch: false,
    };
  }

  return {
    commit: UNKNOWN,
    source: 'unknown',
    imageCommit,
    platformCommit: UNKNOWN,
    consistent: false,
    mismatch: false,
  };
}

/** Commit SHA of the running build (platform → image → legacy env → 'unknown'). */
export function getGitCommit(): string {
  return getGitCommitInfo().commit;
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
