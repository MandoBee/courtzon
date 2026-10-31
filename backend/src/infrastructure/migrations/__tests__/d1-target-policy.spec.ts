import { describe, expect, it } from 'vitest';
import {
  APPROVED_LOCAL_TARGET,
  assertApprovedLocalTarget,
  type ApprovedLocalTargetInput,
} from '../baseline/bootstrap-preflight.js';
import { connectionConfigFromEnvironment, parseConnectionConfig } from '../baseline/connection-config.js';
import {
  APPROVED_TEST_DATABASE,
  APPROVED_TEST_HOSTS,
  APPROVED_TEST_PORT,
} from '../../../../../e2e/helpers/cleanup-guard.js';

const APPROVED: ApprovedLocalTargetInput = {
  host: '127.0.0.1',
  port: 3307,
  database: 'courtzon_v3',
  expectDatabase: 'courtzon_v3',
};

describe('D1 local target policy — accepted target', () => {
  it('accepts the approved local test target', () => {
    expect(() => assertApprovedLocalTarget(APPROVED)).not.toThrow();
  });

  it('accepts every documented loopback host on port 3307', () => {
    for (const host of APPROVED_TEST_HOSTS) {
      expect(() => assertApprovedLocalTarget({ ...APPROVED, host })).not.toThrow();
    }
  });

  it('stays in parity with the e2e cleanup guard constants', () => {
    expect(APPROVED_LOCAL_TARGET.database).toBe(APPROVED_TEST_DATABASE);
    expect(APPROVED_LOCAL_TARGET.port).toBe(APPROVED_TEST_PORT);
    expect([...APPROVED_LOCAL_TARGET.hosts]).toEqual([...APPROVED_TEST_HOSTS]);
  });
});

describe('D1 local target policy — refused targets', () => {
  it('refuses the XAMPP/legacy port 3306', () => {
    expect(() => assertApprovedLocalTarget({ ...APPROVED, port: 3306 })).toThrow(/port must be 3307/);
  });

  it('refuses any non-loopback host', () => {
    for (const host of ['10.0.0.5', 'db.example.com', '0.0.0.0', '192.168.1.10']) {
      expect(() => assertApprovedLocalTarget({ ...APPROVED, host })).toThrow(/host must be loopback/);
    }
  });

  it('refuses courzon_v2 even when both database values agree', () => {
    expect(() =>
      assertApprovedLocalTarget({ ...APPROVED, database: 'courtzon_v2', expectDatabase: 'courtzon_v2' }),
    ).toThrow(/connection database must be "courtzon_v3"/);
  });

  it('refuses a different --expect-database even with the approved connection database', () => {
    expect(() => assertApprovedLocalTarget({ ...APPROVED, expectDatabase: 'courtzon_v2' })).toThrow(
      /--expect-database must be "courtzon_v3"/,
    );
  });

  it('refuses malformed database names', () => {
    expect(() => assertApprovedLocalTarget({ ...APPROVED, database: 'courtzon v3' })).toThrow(
      /connection database name is invalid/,
    );
    expect(() => assertApprovedLocalTarget({ ...APPROVED, expectDatabase: 'courtzon-v3' })).toThrow(
      /--expect-database is invalid/,
    );
  });

  it('refuses non-integer ports', () => {
    for (const port of [3307.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => assertApprovedLocalTarget({ ...APPROVED, port })).toThrow(/port must be 3307/);
    }
  });

  it('cannot be bypassed by environment-shaped connection values', () => {
    const remote = parseConnectionConfig({
      ...connectionConfigFromEnvironment({
        DB_HOST: '203.0.113.10',
        DB_PORT: '3307',
        DB_USER: 'readonly',
        DB_PASSWORD: 'not-a-real-secret',
      }),
      database: 'courtzon_v3',
    });
    expect(remote.ok).toBe(true);
    if (!remote.ok) return;
    expect(() =>
      assertApprovedLocalTarget({ ...remote.config, expectDatabase: remote.config.database }),
    ).toThrow(/host must be loopback/);

    const legacyPort = parseConnectionConfig({
      ...connectionConfigFromEnvironment({
        DB_HOST: '127.0.0.1',
        DB_PORT: '3306',
        DB_USER: 'readonly',
        DB_PASSWORD: 'not-a-real-secret',
      }),
      database: 'courtzon_v3',
    });
    expect(legacyPort.ok).toBe(true);
    if (!legacyPort.ok) return;
    expect(() =>
      assertApprovedLocalTarget({ ...legacyPort.config, expectDatabase: legacyPort.config.database }),
    ).toThrow(/port must be 3307/);
  });
});
