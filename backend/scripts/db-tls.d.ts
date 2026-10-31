export type DbTlsMode = 'disable' | 'require' | 'verify-ca';

export type DatabaseEnvironment = 'local' | 'non-local' | 'unknown';

export interface DbTlsMysql2Options {
  ssl?: {
    ca?: string[];
    rejectUnauthorized?: boolean;
    verifyIdentity?: boolean;
  };
}

export interface DbTlsPolicy {
  mode: DbTlsMode;
  environment: DatabaseEnvironment;
  local: boolean;
  caPath: string | null;
  caPem: string | null;
  warnings: string[];
  cliArgs: string[];
  mysql2: DbTlsMysql2Options;
}

export declare const DB_TLS_MODES: readonly DbTlsMode[];
export declare const DATABASE_ENVIRONMENTS: readonly DatabaseEnvironment[];
export declare const LOCAL_DEFAULT_MODE: DbTlsMode;

export declare class DbTlsPolicyError extends Error {
  constructor(message: string);
}

export declare function classifyDatabaseEnvironment(env?: NodeJS.ProcessEnv): DatabaseEnvironment;

export declare function isLocalDatabaseEnvironment(env?: NodeJS.ProcessEnv): boolean;

export declare function resolveDbTlsPolicy(
  env?: NodeJS.ProcessEnv,
  options?: { environment?: DatabaseEnvironment },
): DbTlsPolicy;

export declare function describeDbTlsPolicy(policy: Pick<DbTlsPolicy, 'mode' | 'caPath'>): string;
