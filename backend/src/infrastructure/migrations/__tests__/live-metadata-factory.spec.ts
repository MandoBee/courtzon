import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLiveSchema } from '../baseline/live-metadata.js';
import type { LiveConnectionConfig, MetadataConnection } from '../baseline/live-metadata.js';
import type { StaticValidationReport } from '../baseline/static-validation.js';

const { createConnectionMock } = vi.hoisted(() => ({ createConnectionMock: vi.fn() }));

// The factory is the only place that calls mysql2. Mocking it makes the
// credential-bearing connection observable without opening any socket.
vi.mock('mysql2/promise', () => ({
  default: { createConnection: createConnectionMock },
}));

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

const SECRET = 'S3cr3t-Do-Not-Leak';
const TEST_PEM = ['-----BEGIN CERTIFICATE-----', 'MIIBnotarealcertificate', '-----END CERTIFICATE-----', ''].join('\n');

let caPath: string;
let badCaPath: string;
let missingCaPath: string;
let tempRoot: string;

beforeAll(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'courtzon-factory-'));
  caPath = join(tempRoot, 'ca.pem');
  badCaPath = join(tempRoot, 'bad-ca.pem');
  missingCaPath = join(tempRoot, 'missing-ca.pem');
  await writeFile(caPath, TEST_PEM, 'utf8');
  await writeFile(badCaPath, 'this is not a PEM certificate', 'utf8');
});

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

beforeEach(() => {
  createConnectionMock.mockReset();
});

interface FakeConnection {
  connection: MetadataConnection;
  queries: string[];
  isEnded: () => boolean;
}

function makeFake(): FakeConnection {
  const queries: string[] = [];
  let ended = false;
  const connection: MetadataConnection = {
    async query<T>(sql: string): Promise<[T[], unknown]> {
      queries.push(sql);
      if (sql.includes('Ssl_cipher')) {
        return [[{ Variable_name: 'Ssl_cipher', Value: 'TLS_AES_256_GCM_SHA384' } as unknown as T], undefined];
      }
      // Stop after the TLS status check; the factory wiring is what is asserted.
      throw new Error('unexpected query after the TLS status check');
    },
    async end(): Promise<void> {
      ended = true;
    },
  };
  return { connection, queries, isEnded: () => ended };
}

function connection(overrides: Partial<LiveConnectionConfig> = {}): LiveConnectionConfig {
  return {
    host: 'db.example.com',
    port: 3307,
    user: 'root',
    password: SECRET,
    database: 'courtzon_v3',
    ...overrides,
  };
}

async function runWithFake(options: LiveConnectionConfig): Promise<{ report: Awaited<ReturnType<typeof readLiveSchema>>; fake: FakeConnection }> {
  const fake = makeFake();
  createConnectionMock.mockResolvedValue(fake.connection);
  const report = await readLiveSchema({
    staticValidation: STATIC_OK,
    expectDatabase: 'courtzon_v3',
    connection: options,
  });
  return { report, fake };
}

function firstCreateOptions(): Record<string, unknown> {
  const call = createConnectionMock.mock.calls[0];
  expect(call).toBeDefined();
  return call?.[0] as Record<string, unknown>;
}

describe('mysql2 factory — TLS option propagation', () => {
  it('passes verifyIdentity: true for a verify-full DNS connection', async () => {
    const { report, fake } = await runWithFake(
      connection({ tls: { mode: 'verify-full', caPath, serverName: 'db.example.com' } }),
    );

    const options = firstCreateOptions();
    expect(options.ssl).toMatchObject({ rejectUnauthorized: true, verifyIdentity: true });
    expect(Buffer.isBuffer((options.ssl as { ca?: unknown }).ca)).toBe(true);
    expect(report.fatal?.code).not.toBe('TLS_NOT_ESTABLISHED');
    expect(fake.queries[0]).toContain('Ssl_cipher');
  });

  it('defaults the verify-full identity to the DNS host', async () => {
    await runWithFake(connection({ tls: { mode: 'verify-full', caPath, serverName: null } }));

    expect(firstCreateOptions().ssl).toMatchObject({ rejectUnauthorized: true, verifyIdentity: true });
  });

  it('passes verifyIdentity: false for verify-ca while keeping chain verification', async () => {
    await runWithFake(connection({ host: '127.0.0.1', tls: { mode: 'verify-ca', caPath, serverName: null } }));

    expect(firstCreateOptions().ssl).toMatchObject({ rejectUnauthorized: true, verifyIdentity: false });
  });

  it('omits ssl entirely when TLS is disabled', async () => {
    const { report } = await runWithFake(connection({ host: '127.0.0.1', tls: { mode: 'disabled', caPath: null, serverName: null } }));

    expect('ssl' in firstCreateOptions()).toBe(false);
    expect(report.fatal?.code).not.toBe('TLS_NOT_ESTABLISHED');
  });
});

describe('mysql2 factory — unsupported verify-full configurations', () => {
  it('rejects an IP host before opening a connection', async () => {
    const report = await readLiveSchema({
      staticValidation: STATIC_OK,
      expectDatabase: 'courtzon_v3',
      connection: connection({ host: '127.0.0.1', tls: { mode: 'verify-full', caPath, serverName: null } }),
    });

    expect(report.fatal?.code).toBe('TLS_CONFIGURATION_FAILED');
    expect(report.fatal?.message).toBe('TLS configuration could not be applied');
    expect(report.fatal?.details).toContain('cannot be used with an IP host');
    expect(JSON.stringify(report)).not.toContain(SECRET);
    expect(String(report.fatal?.details)).not.toContain(tempRoot);
    expect(createConnectionMock).not.toHaveBeenCalled();
  });

  it('rejects a server name that differs from the connection host before opening a connection', async () => {
    const report = await readLiveSchema({
      staticValidation: STATIC_OK,
      expectDatabase: 'courtzon_v3',
      connection: connection({ tls: { mode: 'verify-full', caPath, serverName: 'other.example.com' } }),
    });

    expect(report.fatal?.code).toBe('TLS_CONFIGURATION_FAILED');
    expect(report.fatal?.details).toContain('requires DB_SSL_SERVER_NAME to match DB_HOST');
    expect(JSON.stringify(report)).not.toContain(SECRET);
    expect(createConnectionMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown mode before opening a connection', async () => {
    const report = await readLiveSchema({
      staticValidation: STATIC_OK,
      expectDatabase: 'courtzon_v3',
      connection: connection({
        tls: { mode: 'verify-identity' as unknown as 'verify-full', caPath, serverName: 'db.example.com' },
      }),
    });

    expect(report.fatal?.code).toBe('TLS_CONFIGURATION_FAILED');
    expect(report.fatal?.details).toContain('Unsupported DB_SSL_MODE');
    expect(JSON.stringify(report)).not.toContain(SECRET);
    expect(createConnectionMock).not.toHaveBeenCalled();
  });
});

describe('mysql2 factory — CA failure reasons', () => {
  it('surfaces a safe reason when the CA file is missing, without the path or password', async () => {
    const report = await readLiveSchema({
      staticValidation: STATIC_OK,
      expectDatabase: 'courtzon_v3',
      connection: connection({
        host: '127.0.0.1',
        tls: { mode: 'verify-ca', caPath: missingCaPath, serverName: null },
      }),
    });

    expect(report.fatal?.code).toBe('TLS_CONFIGURATION_FAILED');
    expect(report.fatal?.details).toContain('DB_SSL_CA could not be read');
    expect(String(report.fatal?.details)).not.toContain(missingCaPath);
    expect(JSON.stringify(report)).not.toContain(SECRET);
    expect(createConnectionMock).not.toHaveBeenCalled();
  });

  it('surfaces a safe reason for invalid CA content without echoing the file contents', async () => {
    const report = await readLiveSchema({
      staticValidation: STATIC_OK,
      expectDatabase: 'courtzon_v3',
      connection: connection({
        host: '127.0.0.1',
        tls: { mode: 'verify-ca', caPath: badCaPath, serverName: null },
      }),
    });

    expect(report.fatal?.code).toBe('TLS_CONFIGURATION_FAILED');
    expect(report.fatal?.details).toContain('not a valid PEM certificate bundle');
    expect(String(report.fatal?.details)).not.toContain('this is not a PEM certificate');
    expect(JSON.stringify(report)).not.toContain('this is not a PEM certificate');
    expect(JSON.stringify(report)).not.toContain(SECRET);
    expect(createConnectionMock).not.toHaveBeenCalled();
  });
});

describe('mysql2 factory — identity failure prevents schema reading', () => {
  it('stops on a handshake identity failure without issuing any metadata query', async () => {
    createConnectionMock.mockRejectedValue(
      Object.assign(new Error('certificate identity mismatch'), { code: 'HANDSHAKE_SSL_ERROR' }),
    );

    const report = await readLiveSchema({
      staticValidation: STATIC_OK,
      expectDatabase: 'courtzon_v3',
      connection: connection({ tls: { mode: 'verify-full', caPath, serverName: 'db.example.com' } }),
    });

    expect(createConnectionMock).toHaveBeenCalledTimes(1);
    expect(report.fatal?.code).toBe('CONNECTION_FAILED');
    expect(report.ok).toBe(false);
    expect(JSON.stringify(report)).not.toContain(SECRET);
  });
});
