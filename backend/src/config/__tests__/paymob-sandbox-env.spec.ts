import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Focused regression test for the production PAYMOB_SANDBOX guard.
 *
 * The guard previously could never fire because the zod schema defaulted
 * `PAYMOB_SANDBOX` to 'true'. The default is removed, so env.ts must now refuse
 * to start in production when the provider is `paymob` and the value is missing
 * or blank, while local/test environments keep working without it.
 *
 * The test loads the real env module with process.exit mocked (it throws a
 * sentinel instead of terminating the worker). No database, network or payment
 * gateway is touched.
 */

const BASE_ENV: Record<string, string> = {
  NODE_ENV: 'production',
  SESSION_SECRET: 'test-session-secret-at-least-32-characters-long',
  DB_HOST: 'mysql',
  DB_PORT: '3306',
  DB_NAME: 'courtzon_test',
  DB_USER: 'root',
  DB_PASSWORD: 'test-only-password',
  REDIS_HOST: 'redis',
  REDIS_PORT: '6379',
  PAYMENT_GATEWAY_PROVIDER: 'paymob',
};

const MANAGED_KEYS = [...Object.keys(BASE_ENV), 'PAYMOB_SANDBOX'];

let savedEnv: Record<string, string | undefined> = {};
let exitSpy: ReturnType<typeof vi.spyOn>;

function loadEnvModule(overrides: Record<string, string | undefined>) {
  for (const key of MANAGED_KEYS) {
    const value = key in overrides ? overrides[key] : BASE_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  return import('../env.js');
}

beforeEach(() => {
  savedEnv = {};
  for (const key of MANAGED_KEYS) savedEnv[key] = process.env[key];
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`ENV_EXIT_${code}`);
  }) as never);
});

afterEach(() => {
  exitSpy.mockRestore();
  for (const key of MANAGED_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key] as string;
  }
  vi.resetModules();
});

describe('PAYMOB_SANDBOX production guard', () => {
  it('refuses to start in production when PAYMOB_SANDBOX is missing', async () => {
    await expect(loadEnvModule({ PAYMOB_SANDBOX: undefined })).rejects.toThrow('ENV_EXIT_1');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('treats an empty PAYMOB_SANDBOX as missing', async () => {
    await expect(loadEnvModule({ PAYMOB_SANDBOX: '   ' })).rejects.toThrow('ENV_EXIT_1');
  });

  it('accepts an explicit value in production', async () => {
    const mod = await loadEnvModule({ PAYMOB_SANDBOX: 'false' });
    expect(mod.env.PAYMOB_SANDBOX).toBe('false');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('does not require PAYMOB_SANDBOX outside production', async () => {
    const mod = await loadEnvModule({ NODE_ENV: 'development', PAYMOB_SANDBOX: undefined });
    expect(mod.env.PAYMOB_SANDBOX).toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('does not require PAYMOB_SANDBOX for a non-Paymob provider in production', async () => {
    const mod = await loadEnvModule({
      PAYMENT_GATEWAY_PROVIDER: 'fawry',
      PAYMOB_SANDBOX: undefined,
    });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(mod.env.PAYMENT_GATEWAY_PROVIDER).toBe('fawry');
  });
});
