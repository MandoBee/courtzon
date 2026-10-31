import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LiveTlsConfigurationError,
  readLiveSchema,
  readTlsSessionCipher,
  resolveLiveTls,
  type MetadataConnection,
} from '../baseline/live-metadata.js';
import type { ParsedTlsConfig } from '../baseline/connection-config.js';
import type { StaticValidationReport } from '../baseline/static-validation.js';

const STATIC_OK: StaticValidationReport = {
  ok: true,
  findings: [],
  summary: {
    baselineSha256: '0'.repeat(64),
    schemaHead: '203',
    tableCount: 0,
    triggerCount: 0,
    pinCount: 0,
    migrationCount: 0,
    objectCount: 0,
    findings: 0,
  },
  hashes: {
    baseline: '0'.repeat(64),
    requirements: '1'.repeat(64),
    inventory: '2'.repeat(64),
    object: '3'.repeat(64),
    schema: '4'.repeat(64),
    migrations: '5'.repeat(64),
  },
};

// Framing-only fixture: it is NOT a real certificate and is never trusted.
const TEST_PEM = ['-----BEGIN CERTIFICATE-----', 'MIIBnotarealcertificate', '-----END CERTIFICATE-----', ''].join('\n');
const PRIVATE_KEY_PEM = ['-----BEGIN PRIVATE KEY-----', 'MIIEnotarealprivatekey', '-----END PRIVATE KEY-----', ''].join('\n');

const SECRET = 'S3cr3t-Do-Not-Leak';

interface TlsFiles {
  ca: string;
  empty: string;
  text: string;
  privateKey: string;
  nul: string;
  directory: string;
  missing: string;
}

let files: TlsFiles;
let tempRoot: string;

beforeAll(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'courtzon-tls-'));
  files = {
    ca: join(tempRoot, 'ca.pem'),
    empty: join(tempRoot, 'empty.pem'),
    text: join(tempRoot, 'not-a-cert.txt'),
    privateKey: join(tempRoot, 'key.pem'),
    nul: join(tempRoot, 'nul.pem'),
    directory: join(tempRoot, 'certs-dir'),
    missing: join(tempRoot, 'missing.pem'),
  };
  await writeFile(files.ca, TEST_PEM, 'utf8');
  await writeFile(files.empty, '', 'utf8');
  await writeFile(files.text, 'this is not a certificate', 'utf8');
  await writeFile(files.privateKey, PRIVATE_KEY_PEM, 'utf8');
  await writeFile(files.nul, '-----BEGIN CERTIFICATE-----\n\u0000\n-----END CERTIFICATE-----\n', 'utf8');
  await mkdir(files.directory, { recursive: true });
});

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

async function expectTlsError(promise: Promise<unknown>): Promise<LiveTlsConfigurationError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(LiveTlsConfigurationError);
    return error as LiveTlsConfigurationError;
  }
  throw new Error('expected LiveTlsConfigurationError');
}

function tlsConfig(overrides: Partial<ParsedTlsConfig> = {}): ParsedTlsConfig {
  return { mode: 'verify-ca', caPath: files.ca, serverName: null, ...overrides };
}

interface FakeConnection {
  connection: MetadataConnection;
  queries: string[];
  isEnded: () => boolean;
}

function makeFake(cipher: string | null): FakeConnection {
  const queries: string[] = [];
  let ended = false;
  const connection: MetadataConnection = {
    async query<T>(sql: string): Promise<[T[], unknown]> {
      queries.push(sql);
      if (sql.includes('Ssl_cipher')) {
        if (cipher === null) return [[] as T[], undefined];
        return [[{ Variable_name: 'Ssl_cipher', Value: cipher } as unknown as T], undefined];
      }
      throw new Error('unexpected query after the TLS status check');
    },
    async end(): Promise<void> {
      ended = true;
    },
  };
  return { connection, queries, isEnded: () => ended };
}

async function runReader(tls: ParsedTlsConfig | undefined, cipher: string | null): Promise<{ report: Awaited<ReturnType<typeof readLiveSchema>>; fake: FakeConnection }> {
  const fake = makeFake(cipher);
  const report = await readLiveSchema({
    staticValidation: STATIC_OK,
    expectDatabase: 'courtzon_v3',
    connection: {
      host: '127.0.0.1',
      port: 3307,
      user: 'root',
      password: SECRET,
      database: 'courtzon_v3',
      ...(tls ? { tls } : {}),
    },
    createConnection: async () => fake.connection,
  });
  return { report, fake };
}

describe('resolveLiveTls — mode handling', () => {
  it('returns no SSL options when TLS is absent (current behaviour preserved)', async () => {
    const resolved = await resolveLiveTls(undefined, '127.0.0.1');

    expect(resolved).toEqual({ mode: 'disabled', ssl: null, serverName: null });
  });

  it('does not read a CA file when the mode is explicitly disabled', async () => {
    const resolved = await resolveLiveTls(
      { mode: 'disabled', caPath: '/definitely/not/read.pem', serverName: null },
      '127.0.0.1',
    );

    expect(resolved).toEqual({ mode: 'disabled', ssl: null, serverName: null });
  });

  it('builds verification-enabled SSL options for verify-ca', async () => {
    const resolved = await resolveLiveTls(tlsConfig(), '127.0.0.1');

    expect(resolved.mode).toBe('verify-ca');
    expect(resolved.serverName).toBeNull();
    expect(resolved.ssl).not.toBeNull();
    expect(resolved.ssl?.rejectUnauthorized).toBe(true);
    expect(resolved.ssl?.verifyIdentity).toBe(false);
    expect(resolved.ssl?.ca.equals(Buffer.from(TEST_PEM, 'utf8'))).toBe(true);
  });

  it('enables same-connection identity verification for verify-full with a matching DNS host', async () => {
    const resolved = await resolveLiveTls(
      tlsConfig({ mode: 'verify-full', serverName: 'db.example.com' }),
      'db.example.com',
    );

    expect(resolved.mode).toBe('verify-full');
    expect(resolved.serverName).toBe('db.example.com');
    expect(resolved.ssl?.rejectUnauthorized).toBe(true);
    expect(resolved.ssl?.verifyIdentity).toBe(true);
  });

  it('defaults the verify-full server name to a DNS connection host', async () => {
    const resolved = await resolveLiveTls(tlsConfig({ mode: 'verify-full', serverName: null }), 'db.example.com');

    expect(resolved.serverName).toBe('db.example.com');
    expect(resolved.ssl?.verifyIdentity).toBe(true);
  });

  it('accepts a verify-full server name that differs only by case or a trailing dot', async () => {
    const resolved = await resolveLiveTls(
      tlsConfig({ mode: 'verify-full', serverName: 'DB.Example.COM.' }),
      'db.example.com',
    );

    expect(resolved.ssl?.verifyIdentity).toBe(true);
  });

  it('rejects verify-full with an IP host instead of verifying identity on a separate connection', async () => {
    const error = await expectTlsError(
      resolveLiveTls(tlsConfig({ mode: 'verify-full', serverName: '127.0.0.1' }), '127.0.0.1'),
    );

    expect(error.message).toContain('cannot be used with an IP host');
  });

  it('rejects verify-full when the server name differs from the connection host', async () => {
    const error = await expectTlsError(
      resolveLiveTls(tlsConfig({ mode: 'verify-full', serverName: 'other.example.com' }), 'db.example.com'),
    );

    expect(error.message).toContain('requires DB_SSL_SERVER_NAME to match DB_HOST');
  });

  it('rejects an unknown mode when called directly, bypassing the shared parser', async () => {
    const error = await expectTlsError(
      resolveLiveTls(
        tlsConfig({ mode: 'verify-identity' as unknown as ParsedTlsConfig['mode'] }),
        'db.example.com',
      ),
    );

    expect(error.message).toContain('Unsupported DB_SSL_MODE');
  });

  it('never disables certificate verification in enabled modes', async () => {
    const ca = await resolveLiveTls(tlsConfig({ mode: 'verify-ca' }), '127.0.0.1');
    expect(ca.ssl?.rejectUnauthorized).toBe(true);
    expect(ca.ssl?.verifyIdentity).toBe(false);

    const full = await resolveLiveTls(
      tlsConfig({ mode: 'verify-full', serverName: 'db.example.com' }),
      'db.example.com',
    );
    expect(full.ssl?.rejectUnauthorized).toBe(true);
    expect(full.ssl?.verifyIdentity).toBe(true);
  });
});

describe('resolveLiveTls — CA failure modes', () => {
  it('rejects a missing CA file without echoing the path', async () => {
    const error = await expectTlsError(resolveLiveTls(tlsConfig({ caPath: files.missing }), '127.0.0.1'));

    expect(error.message).not.toContain(files.missing);
    expect(error.message).not.toContain('BEGIN CERTIFICATE');
  });

  it('rejects a missing caPath defense-in-depth', async () => {
    await expectTlsError(resolveLiveTls(tlsConfig({ caPath: null }), '127.0.0.1'));
  });

  it('rejects a directory path', async () => {
    await expectTlsError(resolveLiveTls(tlsConfig({ caPath: files.directory }), '127.0.0.1'));
  });

  it('rejects an empty file', async () => {
    await expectTlsError(resolveLiveTls(tlsConfig({ caPath: files.empty }), '127.0.0.1'));
  });

  it('rejects content without PEM certificate framing', async () => {
    const error = await expectTlsError(resolveLiveTls(tlsConfig({ caPath: files.text }), '127.0.0.1'));

    expect(error.message).not.toContain('this is not a certificate');
  });

  it('rejects private keys supplied as a CA bundle', async () => {
    const error = await expectTlsError(resolveLiveTls(tlsConfig({ caPath: files.privateKey }), '127.0.0.1'));

    expect(error.message).not.toContain('MIIEnotarealprivatekey');
  });

  it('rejects binary content in the CA bundle', async () => {
    await expectTlsError(resolveLiveTls(tlsConfig({ caPath: files.nul }), '127.0.0.1'));
  });

  it('rejects an empty verify-full server name instead of falling back silently', async () => {
    await expectTlsError(
      resolveLiveTls(tlsConfig({ mode: 'verify-full', serverName: '' }), 'db.example.com'),
    );
  });
});

describe('readTlsSessionCipher', () => {
  it('returns the negotiated cipher', async () => {
    const fake = makeFake('  TLS_AES_256_GCM_SHA384  ');

    await expect(readTlsSessionCipher(fake.connection)).resolves.toBe('TLS_AES_256_GCM_SHA384');
  });

  it('returns an empty string when the status row is absent or valueless', async () => {
    await expect(readTlsSessionCipher(makeFake(null).connection)).resolves.toBe('');

    const bare: MetadataConnection = {
      async query<T>(): Promise<[T[], unknown]> {
        return [[{ Variable_name: 'Ssl_cipher' } as unknown as T], undefined];
      },
      async end(): Promise<void> {},
    };
    await expect(readTlsSessionCipher(bare)).resolves.toBe('');
  });

  it('matches the value column case-insensitively', async () => {
    const lower: MetadataConnection = {
      async query<T>(): Promise<[T[], unknown]> {
        return [[{ variable_name: 'Ssl_cipher', value: 'TLS_CHACHA20_POLY1305_SHA256' } as unknown as T], undefined];
      },
      async end(): Promise<void> {},
    };

    await expect(readTlsSessionCipher(lower)).resolves.toBe('TLS_CHACHA20_POLY1305_SHA256');
  });
});

describe('readLiveSchema — TLS enforcement', () => {
  it('fails closed when an enabled mode has no negotiated cipher', async () => {
    const { report, fake } = await runReader({ mode: 'verify-ca', caPath: null, serverName: null }, null);

    expect(report.ok).toBe(false);
    expect(report.fatal?.code).toBe('TLS_NOT_ESTABLISHED');
    expect(fake.isEnded()).toBe(true);
    expect(fake.queries.some((sql) => sql.includes('Ssl_cipher'))).toBe(true);
    expect(fake.queries.every((sql) => !sql.includes('information_schema'))).toBe(true);
  });

  it('never leaks the password in the TLS failure report', async () => {
    const { report } = await runReader({ mode: 'verify-ca', caPath: null, serverName: null }, null);

    expect(JSON.stringify(report)).not.toContain(SECRET);
  });

  it('continues past the status check when the session is encrypted', async () => {
    const { report, fake } = await runReader(
      { mode: 'verify-ca', caPath: null, serverName: null },
      'TLS_AES_256_GCM_SHA384',
    );

    expect(report.fatal?.code).not.toBe('TLS_NOT_ESTABLISHED');
    expect(fake.queries[0]).toContain('Ssl_cipher');
  });

  it('skips the status check entirely when TLS is disabled', async () => {
    const { report, fake } = await runReader(undefined, 'TLS_AES_256_GCM_SHA384');

    expect(fake.queries.some((sql) => sql.includes('Ssl_cipher'))).toBe(false);
    expect(report.fatal?.code).not.toBe('TLS_NOT_ESTABLISHED');
  });
});
