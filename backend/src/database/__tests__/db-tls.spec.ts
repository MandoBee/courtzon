import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import {
  DATABASE_ENVIRONMENTS,
  DB_TLS_MODES,
  DbTlsPolicyError,
  classifyDatabaseEnvironment,
  describeDbTlsPolicy,
  isLocalDatabaseEnvironment,
  resolveDbTlsPolicy,
} from '../../../scripts/db-tls.js';

const FIXTURE_CA = fileURLToPath(new URL('./fixtures/test-ca.pem', import.meta.url));
const SHELL_LIB = fileURLToPath(new URL('../../../scripts/db-tls.sh', import.meta.url));

const tempDirs: string[] = [];
function tempFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cz-dbtls-'));
  tempDirs.push(dir);
  const file = join(dir, name);
  writeFileSync(file, content);
  return file;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const LOCAL_ENV = { COURTZON_MIGRATION_ENV: 'local' } as NodeJS.ProcessEnv;
const PROD_ENV = {
  COURTZON_MIGRATION_ENV: 'production',
  NODE_ENV: 'production',
} as NodeJS.ProcessEnv;
const UNKNOWN_ENV = {} as NodeJS.ProcessEnv;

// ── environment classification ───────────────────────────────────────────────
describe('environment classification', () => {
  it('treats an explicit COURTZON_MIGRATION_ENV=local as local', () => {
    expect(classifyDatabaseEnvironment({ COURTZON_MIGRATION_ENV: 'local' })).toBe('local');
    expect(isLocalDatabaseEnvironment({ COURTZON_MIGRATION_ENV: 'local' })).toBe(true);
  });

  it('treats any other explicit COURTZON_MIGRATION_ENV as non-local', () => {
    expect(classifyDatabaseEnvironment({ COURTZON_MIGRATION_ENV: 'production' })).toBe('non-local');
    expect(classifyDatabaseEnvironment({ COURTZON_MIGRATION_ENV: 'staging' })).toBe('non-local');
  });

  it('lets an explicit non-local migration environment win over NODE_ENV', () => {
    expect(
      classifyDatabaseEnvironment({
        COURTZON_MIGRATION_ENV: 'production',
        NODE_ENV: 'development',
      }),
    ).toBe('non-local');
  });

  it('falls back to NODE_ENV development/test when the migration env is unset', () => {
    expect(classifyDatabaseEnvironment({ NODE_ENV: 'development' })).toBe('local');
    expect(classifyDatabaseEnvironment({ NODE_ENV: 'test' })).toBe('local');
  });

  it('treats NODE_ENV=production or any other value as non-local', () => {
    expect(classifyDatabaseEnvironment({ NODE_ENV: 'production' })).toBe('non-local');
    expect(classifyDatabaseEnvironment({ NODE_ENV: 'staging' })).toBe('non-local');
  });

  it('reports UNKNOWN when both signals are absent or empty — never local', () => {
    expect(classifyDatabaseEnvironment({})).toBe('unknown');
    expect(classifyDatabaseEnvironment({ NODE_ENV: '', COURTZON_MIGRATION_ENV: '' })).toBe('unknown');
    expect(classifyDatabaseEnvironment({ NODE_ENV: '   ', COURTZON_MIGRATION_ENV: '  ' })).toBe('unknown');
    expect(isLocalDatabaseEnvironment({})).toBe(false);
  });

  it('trims and lowercases the environment signals', () => {
    expect(classifyDatabaseEnvironment({ COURTZON_MIGRATION_ENV: ' LOCAL ' })).toBe('local');
    expect(classifyDatabaseEnvironment({ NODE_ENV: ' PRODUCTION ' })).toBe('non-local');
    expect(classifyDatabaseEnvironment({ NODE_ENV: '\tDevelopment\n' })).toBe('local');
    expect(classifyDatabaseEnvironment({ COURTZON_MIGRATION_ENV: 'lo cal' })).toBe('non-local');
  });

  it('supports exactly three environment classes', () => {
    expect(DATABASE_ENVIRONMENTS).toEqual(['local', 'non-local', 'unknown']);
  });
});

// ── modes ────────────────────────────────────────────────────────────────────
describe('disable mode', () => {
  it('is the compatibility default for the explicit local environment', () => {
    const policy = resolveDbTlsPolicy({ ...LOCAL_ENV });
    expect(policy.mode).toBe('disable');
    expect(policy.environment).toBe('local');
    expect(policy.local).toBe(true);
    expect(policy.warnings).toEqual([]);
    expect(policy.mysql2).not.toHaveProperty('ssl');
    expect(policy.cliArgs).toEqual(['--skip-ssl']);
  });

  it('is selectable explicitly and maps to plaintext in both runtimes', () => {
    const policy = resolveDbTlsPolicy({ ...LOCAL_ENV, DB_TLS_MODE: 'disable' });
    expect(policy.mode).toBe('disable');
    expect(policy.mysql2).not.toHaveProperty('ssl');
    expect(policy.cliArgs).toEqual(['--skip-ssl']);
    expect(describeDbTlsPolicy(policy)).toContain('plaintext');
  });

  it('warns loudly (but does not fail) when explicitly selected outside local', () => {
    const policy = resolveDbTlsPolicy({ ...PROD_ENV, DB_TLS_MODE: 'disable' });
    expect(policy.mode).toBe('disable');
    expect(policy.warnings).toHaveLength(1);
    expect(policy.warnings[0]).toContain('NOT encrypted');
    expect(policy.warnings[0]).toContain('non-local');
  });

  it('warns with a distinct message in an UNKNOWN environment', () => {
    const policy = resolveDbTlsPolicy({ ...UNKNOWN_ENV, DB_TLS_MODE: 'disable' });
    expect(policy.mode).toBe('disable');
    expect(policy.environment).toBe('unknown');
    expect(policy.warnings).toHaveLength(1);
    expect(policy.warnings[0]).toContain('cannot be classified');
    expect(policy.warnings[0]).toContain('NOT encrypted');
  });

  it('never becomes the implicit non-local default', () => {
    expect(() => resolveDbTlsPolicy({ ...PROD_ENV })).toThrow(DbTlsPolicyError);
    expect(() => resolveDbTlsPolicy({ ...PROD_ENV })).toThrow(/DB_TLS_MODE is not set/);
  });
});

describe('require mode', () => {
  it('requires encryption without certificate verification', () => {
    const policy = resolveDbTlsPolicy({ ...LOCAL_ENV, DB_TLS_MODE: 'require' });
    expect(policy.mode).toBe('require');
    expect(policy.mysql2.ssl).toEqual({ rejectUnauthorized: false });
    expect(policy.cliArgs).toEqual(['--ssl', '--skip-ssl-verify-server-cert']);
    expect(policy.warnings).toEqual([]);
  });

  it('does not warn and does not fall back when used in production', () => {
    const policy = resolveDbTlsPolicy({ ...PROD_ENV, DB_TLS_MODE: 'require' });
    expect(policy.mode).toBe('require');
    expect(policy.warnings).toEqual([]);
  });
});

describe('verify-ca mode', () => {
  it('enables chain and hostname verification with the configured CA', () => {
    const policy = resolveDbTlsPolicy({
      ...PROD_ENV,
      DB_TLS_MODE: 'verify-ca',
      DB_TLS_CA_PATH: FIXTURE_CA,
    });
    expect(policy.mode).toBe('verify-ca');
    expect(policy.caPath).toBe(FIXTURE_CA);
    expect(policy.mysql2.ssl?.rejectUnauthorized).toBe(true);
    expect(policy.mysql2.ssl?.verifyIdentity).toBe(true);
    expect(policy.mysql2.ssl?.ca).toHaveLength(1);
    expect(policy.mysql2.ssl?.ca?.[0]).toContain('BEGIN CERTIFICATE');
    expect(policy.cliArgs).toEqual([
      '--ssl',
      `--ssl-ca=${FIXTURE_CA}`,
      '--ssl-verify-server-cert',
    ]);
  });

  it('fails fast when DB_TLS_CA_PATH is missing', () => {
    expect(() => resolveDbTlsPolicy({ ...PROD_ENV, DB_TLS_MODE: 'verify-ca' })).toThrow(
      /DB_TLS_CA_PATH/,
    );
  });

  it('fails fast when the CA path does not exist', () => {
    expect(() =>
      resolveDbTlsPolicy({
        ...PROD_ENV,
        DB_TLS_MODE: 'verify-ca',
        DB_TLS_CA_PATH: join(tmpdir(), 'cz-does-not-exist-ca.pem'),
      }),
    ).toThrow(/does not exist or is not accessible/);
  });

  it('fails fast when the CA path is not a regular file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cz-dbtls-dir-'));
    tempDirs.push(dir);
    expect(() =>
      resolveDbTlsPolicy({ ...PROD_ENV, DB_TLS_MODE: 'verify-ca', DB_TLS_CA_PATH: dir }),
    ).toThrow(/not a regular file/);
  });

  it('fails fast when the CA file is empty', () => {
    const empty = tempFile('empty-ca.pem', '');
    expect(() =>
      resolveDbTlsPolicy({ ...PROD_ENV, DB_TLS_MODE: 'verify-ca', DB_TLS_CA_PATH: empty }),
    ).toThrow(/not a PEM certificate/);
  });

  it('fails fast when the CA file is not PEM', () => {
    const junk = tempFile('junk-ca.pem', 'not a certificate at all\n');
    expect(() =>
      resolveDbTlsPolicy({ ...PROD_ENV, DB_TLS_MODE: 'verify-ca', DB_TLS_CA_PATH: junk }),
    ).toThrow(/not a PEM certificate/);
  });

  it('fails fast when the PEM header is present but the payload is invalid', () => {
    const broken = tempFile(
      'broken-ca.pem',
      '-----BEGIN CERTIFICATE-----\nbm90LWEtY2VydGlmaWNhdGU=\n-----END CERTIFICATE-----\n',
    );
    expect(() =>
      resolveDbTlsPolicy({ ...PROD_ENV, DB_TLS_MODE: 'verify-ca', DB_TLS_CA_PATH: broken }),
    ).toThrow(/invalid certificate/);
  });

  it('fails fast on a CA path containing whitespace (shell and Node must agree)', () => {
    expect(() =>
      resolveDbTlsPolicy({
        ...PROD_ENV,
        DB_TLS_MODE: 'verify-ca',
        DB_TLS_CA_PATH: '/certs/ca with space.pem',
      }),
    ).toThrow(/whitespace/);
  });
});

// ── UNKNOWN environment ──────────────────────────────────────────────────────
describe('UNKNOWN environment', () => {
  it('fails closed when DB_TLS_MODE is unset', () => {
    expect(() => resolveDbTlsPolicy({ ...UNKNOWN_ENV })).toThrow(DbTlsPolicyError);
    expect(() => resolveDbTlsPolicy({ ...UNKNOWN_ENV })).toThrow(/cannot be classified/);
    expect(() => resolveDbTlsPolicy({ ...UNKNOWN_ENV })).toThrow(/Refusing to infer local plaintext/);
  });

  it('accepts an explicit valid mode', () => {
    const require = resolveDbTlsPolicy({ ...UNKNOWN_ENV, DB_TLS_MODE: 'require' });
    expect(require.mode).toBe('require');
    expect(require.environment).toBe('unknown');
    expect(require.warnings).toEqual([]);

    const verify = resolveDbTlsPolicy({
      ...UNKNOWN_ENV,
      DB_TLS_MODE: 'verify-ca',
      DB_TLS_CA_PATH: FIXTURE_CA,
    });
    expect(verify.mode).toBe('verify-ca');
    expect(verify.environment).toBe('unknown');
  });

  it('does not invent a local default while the environment is unknown', () => {
    expect(() => resolveDbTlsPolicy({ ...UNKNOWN_ENV })).toThrow(/DB_TLS_MODE is not set/);
  });
});

// ── validation ───────────────────────────────────────────────────────────────
describe('validation', () => {
  it('fails fast on an unknown mode and lists the supported ones', () => {
    expect(() => resolveDbTlsPolicy({ ...LOCAL_ENV, DB_TLS_MODE: 'preferred' })).toThrow(
      /Invalid DB_TLS_MODE "preferred".*disable, require, verify-ca/s,
    );
  });

  it('normalises case and surrounding whitespace', () => {
    expect(resolveDbTlsPolicy({ ...LOCAL_ENV, DB_TLS_MODE: ' REQUIRE ' }).mode).toBe('require');
    expect(resolveDbTlsPolicy({ ...LOCAL_ENV, DB_TLS_MODE: ' disAble\t' }).mode).toBe('disable');
    expect(
      resolveDbTlsPolicy({ ...LOCAL_ENV, DB_TLS_MODE: '\nVerify-CA ', DB_TLS_CA_PATH: FIXTURE_CA })
        .mode,
    ).toBe('verify-ca');
  });

  it('rejects internal whitespace identically instead of stripping it', () => {
    expect(() => resolveDbTlsPolicy({ ...LOCAL_ENV, DB_TLS_MODE: 'dis able' })).toThrow(
      /Invalid DB_TLS_MODE "dis able"/,
    );
    expect(() => resolveDbTlsPolicy({ ...LOCAL_ENV, DB_TLS_MODE: 'ver ify-ca' })).toThrow(
      /Invalid DB_TLS_MODE/,
    );
  });

  it('supports exactly three modes', () => {
    expect(DB_TLS_MODES).toEqual(['disable', 'require', 'verify-ca']);
  });
});

// ── secrets ──────────────────────────────────────────────────────────────────
describe('secret hygiene', () => {
  const SECRET = 'sup3r-secret-password-value';
  const base = { ...PROD_ENV, DB_PASSWORD: SECRET, MYSQL_ROOT_PASSWORD: SECRET };

  it('never leaks credentials in policy errors', () => {
    const cases: Array<Record<string, string>> = [
      { DB_TLS_MODE: 'nonsense' },
      { DB_TLS_MODE: 'verify-ca' },
      { DB_TLS_MODE: 'verify-ca', DB_TLS_CA_PATH: '/nonexistent/ca.pem' },
    ];
    for (const envCase of cases) {
      try {
        resolveDbTlsPolicy({ ...base, ...envCase });
        throw new Error('expected resolveDbTlsPolicy to throw');
      } catch (error) {
        expect(String((error as Error).message)).not.toContain(SECRET);
      }
    }
  });

  it('never leaks credentials in the unknown-environment error', () => {
    try {
      resolveDbTlsPolicy({ DB_PASSWORD: SECRET, MYSQL_ROOT_PASSWORD: SECRET });
      throw new Error('expected resolveDbTlsPolicy to throw');
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(SECRET);
    }
  });

  it('never leaks credentials in the log-safe description', () => {
    const policy = resolveDbTlsPolicy({ ...LOCAL_ENV, DB_TLS_MODE: 'disable' });
    expect(describeDbTlsPolicy(policy)).not.toContain(SECRET);
  });
});

// ── CLI / mysql2 / shell agreement ───────────────────────────────────────────
describe('CLI and mysql2 agreement', () => {
  const expected = {
    disable: { cli: ['--skip-ssl'], ssl: undefined },
    require: {
      cli: ['--ssl', '--skip-ssl-verify-server-cert'],
      ssl: { rejectUnauthorized: false },
    },
    'verify-ca': {
      cli: ['--ssl', `--ssl-ca=${FIXTURE_CA}`, '--ssl-verify-server-cert'],
      ssl: { rejectUnauthorized: true, verifyIdentity: true },
    },
  } as const;

  for (const mode of DB_TLS_MODES) {
    it(`maps ${mode} to the documented CLI flags and mysql2 options`, () => {
      const policy = resolveDbTlsPolicy({
        ...PROD_ENV,
        DB_TLS_MODE: mode,
        ...(mode === 'verify-ca' ? { DB_TLS_CA_PATH: FIXTURE_CA } : {}),
      });
      expect(policy.cliArgs).toEqual(expected[mode].cli);
      if (expected[mode].ssl === undefined) {
        expect(policy.mysql2).not.toHaveProperty('ssl');
      } else {
        expect(policy.mysql2.ssl).toMatchObject(expected[mode].ssl);
      }
    });
  }

  const bash = findBash();

  const agreementCases: Array<{ name: string; env: NodeJS.ProcessEnv }> = [
    { name: 'explicit local', env: { COURTZON_MIGRATION_ENV: 'local' } },
    { name: 'explicit local + disable', env: { COURTZON_MIGRATION_ENV: 'local', DB_TLS_MODE: 'disable' } },
    { name: 'padded local + padded mode', env: { COURTZON_MIGRATION_ENV: ' LOCAL ', DB_TLS_MODE: ' disAble ' } },
    { name: 'NODE_ENV=test + require', env: { NODE_ENV: 'test', DB_TLS_MODE: 'require' } },
    { name: 'production + require', env: { COURTZON_MIGRATION_ENV: 'production', DB_TLS_MODE: 'require' } },
    {
      name: 'unknown + verify-ca',
      env: { DB_TLS_MODE: 'verify-ca', DB_TLS_CA_PATH: FIXTURE_CA },
    },
  ];

  for (const testCase of agreementCases) {
    it.skipIf(!bash)(`shell and Node agree: ${testCase.name}`, () => {
      const shell = runShellPolicy(bash as string, testCase.env);
      const policy = resolveDbTlsPolicy(testCase.env);

      expect(shell.status).toBe(0);
      expect(shell.mode).toBe(policy.mode);
      expect(shell.args).toBe(policy.cliArgs.join(' '));
      expect(shell.environment).toBe(policy.environment);
    });
  }

  it.skipIf(!bash)('shell and Node reject internal whitespace identically', () => {
    const env = { COURTZON_MIGRATION_ENV: 'local', DB_TLS_MODE: 'dis able' };
    const shell = runShellPolicy(bash as string, env);
    expect(shell.status).not.toBe(0);
    expect(() => resolveDbTlsPolicy(env)).toThrow(/Invalid DB_TLS_MODE "dis able"/);
  });

  it.skipIf(!bash)('shell and Node both fail closed in an UNKNOWN environment', () => {
    const shell = runShellPolicy(bash as string, {});
    expect(shell.status).not.toBe(0);
    expect(shell.environment).toBe('unknown');
    expect(() => resolveDbTlsPolicy({})).toThrow(/cannot be classified/);
  });
});

type ShellPolicyResult = {
  status: number;
  mode: string;
  args: string;
  environment: string;
};

const POLICY_ENV_KEYS = [
  'COURTZON_MIGRATION_ENV',
  'NODE_ENV',
  'DB_TLS_MODE',
  'DB_TLS_CA_PATH',
] as const;

/**
 * Build an isolated policy environment: the ambient process env (PATH, HOME…)
 * minus every variable the policy reads, plus the case's values. Without this
 * the shell subprocess would inherit vitest's own NODE_ENV=test and classify
 * the deployment environment differently from the explicit Node-side input.
 */
function buildPolicyEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const isolated: NodeJS.ProcessEnv = { ...process.env };
  for (const key of POLICY_ENV_KEYS) delete isolated[key];
  return { ...isolated, ...env };
}

function runShellPolicy(bash: string, env: NodeJS.ProcessEnv): ShellPolicyResult {
  const script = [
    '. "$1" || exit 2',
    'if db_tls_resolve 2>/dev/null; then',
    '  printf "%s|%s|%s" "$DB_TLS_MODE_RESOLVED" "$DB_TLS_CLI_ARGS" "$DB_TLS_ENVIRONMENT"',
    'else',
    '  printf "FAIL|FAIL|%s" "$DB_TLS_ENVIRONMENT"',
    '  exit 3',
    'fi',
  ].join('\n');

  const result = spawnSync(bash, ['-c', script, 'db-tls-test', SHELL_LIB.replace(/\\/g, '/')], {
    env: buildPolicyEnv(env),
    encoding: 'utf8',
  });

  const [mode = '', args = '', environment = ''] = (result.stdout || '').trim().split('|');
  return { status: result.status ?? 1, mode, args, environment };
}

function findBash(): string | null {
  const candidates = [
    process.env.COURTZON_TEST_BASH,
    'C:\\Program Files\\Git\\bin\\bash.exe',
    '/bin/bash',
    '/usr/bin/bash',
    'bash',
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-c', 'printf ok'], { encoding: 'utf8' });
    if (probe.status === 0 && (probe.stdout || '').includes('ok')) return candidate;
  }
  return null;
}
