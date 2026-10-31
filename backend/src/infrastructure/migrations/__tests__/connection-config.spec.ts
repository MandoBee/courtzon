import { describe, expect, it } from 'vitest';
import { inspect } from 'node:util';
import {
  CONNECTION_CONFIG_EXIT_CODE,
  TLS_MODES,
  connectionConfigFromEnvironment,
  describeConnectionConfigIssues,
  parseConnectionConfig,
  type ConnectionConfigInput,
  type ConnectionConfigIssue,
  type ParsedConnectionConfig,
} from '../baseline/connection-config.js';

const BASE: ConnectionConfigInput = {
  host: '127.0.0.1',
  port: '3307',
  user: 'root',
  password: 'test-password',
  database: 'courtzon_v3',
};

const VALID_CA = '/etc/ssl/certs/ca.pem';

function expectSuccess(input: ConnectionConfigInput): ParsedConnectionConfig {
  const result = parseConnectionConfig(input);
  if (!result.ok) {
    throw new Error(`expected ok, got:\n${describeConnectionConfigIssues(result.issues)}`);
  }
  return result.config;
}

function expectFailure(input: ConnectionConfigInput): readonly ConnectionConfigIssue[] {
  const result = parseConnectionConfig(input);
  if (result.ok) throw new Error('expected failure but parsing succeeded');
  return result.issues;
}

function summarise(issues: readonly ConnectionConfigIssue[]): string[] {
  return issues.map((item) => `${item.field}:${item.code}`);
}

describe('connection config — required fields', () => {
  it('accepts a minimal valid configuration and defaults TLS to disabled', () => {
    const config = expectSuccess(BASE);

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3307);
    expect(config.user).toBe('root');
    expect(config.database).toBe('courtzon_v3');
    expect(config.password).toBe('test-password');
    expect(config.tls).toEqual({ mode: 'disabled', caPath: null, serverName: null });
  });

  it('trims surrounding whitespace for required text fields', () => {
    const config = expectSuccess({
      ...BASE,
      host: '  127.0.0.1  ',
      user: '  root  ',
      database: '  courtzon_v3  ',
    });

    expect(config.host).toBe('127.0.0.1');
    expect(config.user).toBe('root');
    expect(config.database).toBe('courtzon_v3');
  });

  it('reports every missing required field in deterministic order', () => {
    const issues = expectFailure({});

    expect(summarise(issues)).toEqual([
      'DB_HOST:MISSING_REQUIRED',
      'DB_PORT:MISSING_REQUIRED',
      'DB_USER:MISSING_REQUIRED',
      'EXPECTED_DATABASE:MISSING_REQUIRED',
    ]);
  });

  it('rejects empty and whitespace-only required fields', () => {
    const issues = expectFailure({ ...BASE, host: '   ', user: '', database: '  ' });

    expect(summarise(issues)).toEqual([
      'DB_HOST:MISSING_REQUIRED',
      'DB_USER:MISSING_REQUIRED',
      'EXPECTED_DATABASE:MISSING_REQUIRED',
    ]);
  });

  it('rejects non-string values for text fields', () => {
    const cases: Array<[string, ConnectionConfigInput]> = [
      ['DB_HOST', { ...BASE, host: 42 as unknown as string }],
      ['DB_USER', { ...BASE, user: {} as unknown as string }],
      ['EXPECTED_DATABASE', { ...BASE, database: [] as unknown as string }],
    ];

    for (const [field, input] of cases) {
      const issues = expectFailure(input);
      expect(summarise(issues)).toEqual([`${field}:INVALID_FIELD_TYPE`]);
    }
  });

  it('treats an omitted password as an empty string and keeps it readable', () => {
    const config = expectSuccess({ ...BASE, password: undefined });

    expect(config.password).toBe('');
  });

  it('rejects a non-string password without echoing the value', () => {
    const issues = expectFailure({ ...BASE, password: 12345 as unknown as string });

    expect(summarise(issues)).toEqual(['DB_PASSWORD:INVALID_FIELD_TYPE']);
    expect(JSON.stringify(issues)).not.toContain('12345');
  });
});

describe('connection config — DB_PORT validation', () => {
  it('accepts numeric strings, numbers, boundaries and surrounding whitespace', () => {
    const validPorts: Array<string | number> = ['1', 1, '65535', 65535, 3307, ' 3307 '];

    for (const port of validPorts) {
      const config = expectSuccess({ ...BASE, port });
      expect(config.port).toBe(Number(String(port).trim()));
    }
  });

  it('treats empty ports as missing', () => {
    for (const port of ['', '   ']) {
      expect(summarise(expectFailure({ ...BASE, port }))).toEqual(['DB_PORT:MISSING_REQUIRED']);
    }
  });

  it('rejects out-of-range, non-integer and non-numeric ports', () => {
    const invalidPorts: Array<string | number> = [
      '0',
      0,
      '65536',
      65536,
      '-1',
      '3.5',
      3.5,
      'abc',
      '3307abc',
      '+3307',
      '1e3',
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ];

    for (const port of invalidPorts) {
      expect(summarise(expectFailure({ ...BASE, port }))).toEqual(['DB_PORT:INVALID_PORT']);
    }
  });

  it('rejects non-string, non-number port types', () => {
    const issues = expectFailure({ ...BASE, port: true as unknown as number });

    expect(summarise(issues)).toEqual(['DB_PORT:INVALID_FIELD_TYPE']);
  });
});

describe('connection config — TLS mode selection', () => {
  it('defaults to disabled when no TLS variable is supplied', () => {
    expect(expectSuccess(BASE).tls.mode).toBe('disabled');
  });

  it('accepts an explicit disabled mode', () => {
    const config = expectSuccess({ ...BASE, sslMode: 'disabled' });

    expect(config.tls).toEqual({ mode: 'disabled', caPath: null, serverName: null });
  });

  it('trims the mode value while staying case-sensitive', () => {
    const config = expectSuccess({ ...BASE, sslMode: '  verify-ca  ', sslCa: VALID_CA });
    expect(config.tls.mode).toBe('verify-ca');

    expect(summarise(expectFailure({ ...BASE, sslMode: 'VERIFY-CA', sslCa: VALID_CA }))).toEqual([
      'DB_SSL_MODE:TLS_MODE_UNKNOWN',
    ]);
  });

  it('rejects unknown modes', () => {
    for (const sslMode of ['strict', 'require', 'verify_identity', '']) {
      expect(summarise(expectFailure({ ...BASE, sslMode }))).toEqual(['DB_SSL_MODE:TLS_MODE_UNKNOWN']);
    }
  });

  it('rejects a non-string mode', () => {
    const issues = expectFailure({ ...BASE, sslMode: 7 as unknown as string });

    expect(summarise(issues)).toEqual(['DB_SSL_MODE:INVALID_FIELD_TYPE']);
  });

  it('never enables or disables TLS implicitly when only other TLS variables are supplied', () => {
    expect(summarise(expectFailure({ ...BASE, sslCa: VALID_CA }))).toEqual([
      'DB_SSL_MODE:TLS_UNEXPECTED_WITHOUT_MODE',
    ]);

    expect(summarise(expectFailure({ ...BASE, sslServerName: 'db.example.com' }))).toEqual([
      'DB_SSL_MODE:TLS_UNEXPECTED_WITHOUT_MODE',
    ]);

    expect(
      summarise(expectFailure({ ...BASE, sslCa: 'relative/ca.pem', sslServerName: '  ' })),
    ).toEqual([
      'DB_SSL_MODE:TLS_UNEXPECTED_WITHOUT_MODE',
      'DB_SSL_CA:TLS_CA_NOT_ABSOLUTE',
      'DB_SSL_SERVER_NAME:TLS_SERVER_NAME_EMPTY',
    ]);
  });

  it('rejects TLS settings combined with disabled', () => {
    const issues = expectFailure({ ...BASE, sslMode: 'disabled', sslCa: VALID_CA, sslServerName: 'db.example.com' });

    expect(summarise(issues)).toEqual([
      'DB_SSL_CA:TLS_SETTING_WITH_DISABLED',
      'DB_SSL_SERVER_NAME:TLS_SETTING_WITH_DISABLED',
    ]);
  });
});

describe('connection config — CA path validation', () => {
  it('requires DB_SSL_CA for verify-ca and verify-full', () => {
    for (const sslMode of ['verify-ca', 'verify-full']) {
      expect(summarise(expectFailure({ ...BASE, sslMode }))).toEqual(['DB_SSL_CA:TLS_CA_REQUIRED']);
      expect(summarise(expectFailure({ ...BASE, sslMode, sslCa: '   ' }))).toEqual([
        'DB_SSL_CA:TLS_CA_REQUIRED',
      ]);
    }
  });

  it('accepts POSIX, Windows drive and UNC absolute paths', () => {
    const absolutePaths = ['/etc/ssl/ca.pem', 'C:\\certs\\ca.pem', 'C:/certs/ca.pem', '\\\\server\\share\\ca.pem'];

    for (const sslCa of absolutePaths) {
      const config = expectSuccess({ ...BASE, sslMode: 'verify-ca', sslCa });
      expect(config.tls.caPath).toBe(sslCa);
    }
  });

  it('rejects relative CA paths', () => {
    const relativePaths = ['ca.pem', './ca.pem', '../ca.pem', 'certs/ca.pem', '.\\ca.pem', 'C:ca.pem'];

    for (const sslCa of relativePaths) {
      expect(summarise(expectFailure({ ...BASE, sslMode: 'verify-ca', sslCa }))).toEqual([
        'DB_SSL_CA:TLS_CA_NOT_ABSOLUTE',
      ]);
    }
  });

  it('rejects CA paths containing null bytes', () => {
    const issues = expectFailure({ ...BASE, sslMode: 'verify-ca', sslCa: '/tmp/ca\u0000.pem' });

    expect(summarise(issues)).toEqual(['DB_SSL_CA:TLS_CA_INVALID_PATH']);
  });

  it('rejects a non-string CA path', () => {
    const issues = expectFailure({ ...BASE, sslMode: 'verify-ca', sslCa: 9 as unknown as string });

    expect(summarise(issues)).toEqual(['DB_SSL_CA:INVALID_FIELD_TYPE']);
  });
});

describe('connection config — server name validation', () => {
  it('accepts verify-full with a hostname, IPv4 or IPv6 literal', () => {
    for (const sslServerName of ['db.example.com', '127.0.0.1', '::1']) {
      const config = expectSuccess({ ...BASE, sslMode: 'verify-full', sslCa: VALID_CA, sslServerName });
      expect(config.tls).toEqual({ mode: 'verify-full', caPath: VALID_CA, serverName: sslServerName });
    }
  });

  it('allows verify-full without an explicit server name so the caller can default it to the host', () => {
    const config = expectSuccess({ ...BASE, sslMode: 'verify-full', sslCa: VALID_CA });

    expect(config.tls.serverName).toBeNull();
  });

  it('rejects empty or path-shaped server names', () => {
    const cases: Array<[string, string]> = [
      ['   ', 'TLS_SERVER_NAME_EMPTY'],
      ['db example.com', 'TLS_SERVER_NAME_INVALID'],
      ['db/example.com', 'TLS_SERVER_NAME_INVALID'],
      ['db\\example.com', 'TLS_SERVER_NAME_INVALID'],
    ];

    for (const [sslServerName, expectedCode] of cases) {
      const issues = expectFailure({
        ...BASE,
        sslMode: 'verify-full',
        sslCa: VALID_CA,
        sslServerName,
      });
      expect(summarise(issues)).toEqual([`DB_SSL_SERVER_NAME:${expectedCode}`]);
    }
  });

  it('rejects a server name with verify-ca', () => {
    const issues = expectFailure({
      ...BASE,
      sslMode: 'verify-ca',
      sslCa: VALID_CA,
      sslServerName: 'db.example.com',
    });

    expect(summarise(issues)).toEqual(['DB_SSL_SERVER_NAME:TLS_SERVER_NAME_WITHOUT_VERIFY_FULL']);
  });
});

describe('connection config — issue safety and determinism', () => {
  it('produces identical issues for repeated calls with the same input', () => {
    const input: ConnectionConfigInput = { ...BASE, sslMode: 'verify-full', sslServerName: '  ' };
    const first = expectFailure(input);
    const second = expectFailure(input);

    expect(second).toEqual(first);
  });

  it('keeps messages stable and never echoes supplied values', () => {
    const first = expectFailure({ ...BASE, port: 'abc' });
    const second = expectFailure({ ...BASE, port: 'xyz' });

    expect(first[0].message).toBe(second[0].message);
    expect(first[0].message).not.toContain('abc');
    expect(second[0].message).not.toContain('xyz');
  });

  it('renders CLI-safe issue lines', () => {
    expect(describeConnectionConfigIssues([])).toBe('');
    expect(
      describeConnectionConfigIssues([
        { field: 'DB_HOST', code: 'MISSING_REQUIRED', message: 'example message' },
      ]),
    ).toBe('- [MISSING_REQUIRED] DB_HOST: example message');
  });

  it('exposes the documented exit code and TLS modes', () => {
    expect(CONNECTION_CONFIG_EXIT_CODE).toBe(2);
    expect(TLS_MODES).toEqual(['disabled', 'verify-ca', 'verify-full']);
  });
});

describe('connection config — password non-disclosure', () => {
  const SECRET = 'S3cr3t-Do-Not-Leak';

  it('keeps the password readable but non-enumerable', () => {
    const config = expectSuccess({ ...BASE, password: SECRET });

    expect(config.password).toBe(SECRET);
    expect(Object.keys(config)).not.toContain('password');
    expect(Object.getOwnPropertyDescriptor(config, 'password')?.enumerable).toBe(false);
  });

  it('omits the password from JSON.stringify and object spread', () => {
    const config = expectSuccess({ ...BASE, password: SECRET });

    const json = JSON.stringify(config);
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain('password');

    const spread = { ...config };
    expect('password' in spread).toBe(false);
    expect(JSON.stringify(spread)).not.toContain(SECRET);
  });

  it('never prints the password through console inspection', () => {
    const config = expectSuccess({ ...BASE, password: SECRET });

    expect(inspect(config)).not.toContain(SECRET);
    expect(inspect(config, { showHidden: false })).not.toContain(SECRET);
  });

  it('omits the password from serialized success and failure results', () => {
    const success = parseConnectionConfig({ ...BASE, password: SECRET });
    expect(success.ok).toBe(true);
    expect(JSON.stringify(success)).not.toContain(SECRET);

    const failure = parseConnectionConfig({ ...BASE, password: SECRET, sslMode: 'verify-ca' });
    expect(failure.ok).toBe(false);
    expect(JSON.stringify(failure)).not.toContain(SECRET);
    expect(describeConnectionConfigIssues(failure.issues)).not.toContain(SECRET);
  });
});

describe('connection config — environment adapter', () => {
  it('maps an explicit environment record without touching globals', () => {
    const input = connectionConfigFromEnvironment({
      DB_HOST: '127.0.0.1',
      DB_PORT: '3307',
      DB_USER: 'root',
      DB_PASSWORD: 'env-secret',
      DB_SSL_MODE: 'verify-full',
      DB_SSL_CA: VALID_CA,
      DB_SSL_SERVER_NAME: 'db.example.com',
    });

    const config = expectSuccess({ ...input, database: 'courtzon_v3' });
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3307);
    expect(config.user).toBe('root');
    expect(config.password).toBe('env-secret');
    expect(config.tls).toEqual({ mode: 'verify-full', caPath: VALID_CA, serverName: 'db.example.com' });
  });

  it('does not read DB_NAME or MYSQL_DATABASE for the expected database', () => {
    const input = connectionConfigFromEnvironment({ DB_NAME: 'ignored', MYSQL_DATABASE: 'ignored' });

    expect(input.database).toBeUndefined();
    expect(summarise(expectFailure(input))).toEqual([
      'DB_HOST:MISSING_REQUIRED',
      'DB_PORT:MISSING_REQUIRED',
      'DB_USER:MISSING_REQUIRED',
      'EXPECTED_DATABASE:MISSING_REQUIRED',
    ]);
  });
});
