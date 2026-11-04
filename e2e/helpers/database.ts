import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import { hashPassword } from '../../backend/src/shared/utils/password';
import {
  assertApprovedTestTarget,
  runSafeCleanup,
  type DestructiveCleanupAuthorization,
} from './cleanup-guard';

export type { DestructiveCleanupAuthorization } from './cleanup-guard';

const DB_CONFIG = {
  host: process.env.TEST_DB_HOST || '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT) || 3307,
  user: process.env.TEST_DB_USER || 'root',
  password: process.env.TEST_DB_PASSWORD || 'courtzon2026',
  database: process.env.TEST_DB_NAME || 'courtzon_v3',
  charset: 'utf8mb4',
  timezone: '+00:00',
};

let pool: mysql.Pool | null = null;

export async function connect(): Promise<mysql.Pool> {
  // Fail closed before opening a connection: only the approved local test
  // target (courtzon_v3 on 127.0.0.1:3307) is allowed.
  assertApprovedTestTarget(DB_CONFIG);
  if (pool) return pool;
  pool = mysql.createPool({
    ...DB_CONFIG,
    connectionLimit: 5,
    waitForConnections: true,
  });
  const conn = await pool.getConnection();
  conn.release();
  return pool;
}

export async function close(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function query<T = mysql.RowDataPacket[]>(
  sql: string,
  params?: unknown[],
): Promise<[T, mysql.FieldPacket[]]> {
  const p = await connect();
  return p.execute<T>(sql, params);
}

export function generateSessionToken(): string {
  return randomBytes(48).toString('base64url');
}

const TRUNCATE_TABLES = [
  'notifications',
  'bookings',
  'booking_items',
  'booking_participants',
  'user_sessions',
  'user_roles',
  'user_role_scopes',
  'user_devices',
  'wallet_transactions',
  'wallets',
  'organisation_members',
  'resources',
  'branches',
  'organisation_schedules',
  'organisation_documents',
  'organisations',
  'users',
];

/**
 * Destructive cleanup — DEFERRED and FAIL-CLOSED.
 *
 * Uses the approved local test database (`courtzon_v3`) only, and requires an
 * explicit `DestructiveCleanupAuthorization` (fixed confirmation token +
 * campaign id). Run this only once, after the full testing campaign; never
 * during routine test cases. See `cleanup-guard.ts`.
 */
export async function cleanup(authorization?: DestructiveCleanupAuthorization): Promise<void> {
  assertApprovedTestTarget(DB_CONFIG);
  await runSafeCleanup(DB_CONFIG.database, authorization, connect, TRUNCATE_TABLES);
}

export interface InsertUserData {
  phoneNumber: string;
  password: string;
  fullName: string;
  email: string;
  gender: 'male' | 'female';
  timezone?: string;
  countryId?: number;
  birthDate?: string;
  mainSportId?: number;
  mainLevelId?: number;
  languageId?: number;
  isActive?: boolean;
  isVerified?: boolean;
}

export async function insertUser(data: InsertUserData): Promise<number> {
  const {
    phoneNumber,
    password,
    fullName,
    email,
    gender,
    timezone = 'UTC',
    countryId = 1,
    birthDate,
    mainSportId,
    mainLevelId,
    languageId,
    isActive = true,
    isVerified = true,
  } = data;

  // Password must use the application's accepted format: backend
  // `verifyPassword` rejects anything that does not start with `$pbkdf2-`
  // (`backend/src/shared/utils/password.ts:29-31`). Hashing with sha256 here
  // made every seeded user fail the real phone+password login.
  const hashedPassword = hashPassword(password);

  // Login looks the user up by the country-code-prefixed `full_phone`
  // (`authService.login` → `findByPhone`), and registration stores
  // `${countries.phone_code}${localNumber}`. Seed the same format here so E2E
  // users can authenticate through the real phone-login contract.
  const [countryRows] = await query<mysql.RowDataPacket[]>(
    'SELECT phone_code FROM countries WHERE id = ? LIMIT 1',
    [countryId],
  );
  const countryPhoneCode = (countryRows[0] as any)?.phone_code as string | undefined;
  if (!countryPhoneCode) {
    throw new Error(`Cannot seed E2E user: country ${countryId} has no phone_code`);
  }
  // `authService.login` normalizes the code to a leading '+', so seed the same.
  const normalizedCode = countryPhoneCode.startsWith('+')
    ? countryPhoneCode
    : `+${countryPhoneCode}`;
  const fullPhone = phoneNumber.startsWith('+')
    ? phoneNumber
    : `${normalizedCode}${phoneNumber}`;

  const [result] = await query<mysql.ResultSetHeader>(
    `INSERT INTO users (
      public_id, phone_number, full_phone, password_hash, full_name, email, gender,
      timezone, country_id, birth_date,
      language_id, account_status
    ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      phoneNumber,
      fullPhone,
      hashedPassword,
      fullName,
      email,
      gender,
      timezone,
      countryId,
      birthDate || null,
      languageId || null,
    ],
  );
  return result.insertId;
}

export interface InsertOrganisationData {
  ownerId: number;
  name: string;
  orgTypeId: number;
  email?: string;
  phone?: string;
  website?: string;
  isVerified?: boolean;
  isActive?: boolean;
  countryId?: number;
  cityId?: number;
}

export async function insertOrganisation(
  data: InsertOrganisationData,
): Promise<number> {
  const {
    ownerId,
    name,
    orgTypeId,
    email = null,
    phone = null,
    website = '',
    isVerified = true,
    isActive = true,
    countryId = 1,
  } = data;

  const [result] = await query<mysql.ResultSetHeader>(
    `INSERT INTO organisations (
      public_id, owner_id, name, slug, org_type_id, email, phone, website,
      is_verified, is_active, country_id
    ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ownerId, name, `org-${name}-${Math.random().toString(36).slice(2, 10)}`, orgTypeId, email, phone, website, isVerified, isActive, countryId],
  );
  return result.insertId;
}

export interface InsertBranchData {
  organisationId: number;
  name: string;
  cityId?: number;
  countryId?: number;
  timezone?: string;
  lat?: number;
  lng?: number;
  isActive?: boolean;
}

export async function insertBranch(data: InsertBranchData): Promise<number> {
  const {
    organisationId,
    name,
    cityId = 1,
    countryId = 1,
    timezone = 'UTC',
    lat = 0,
    lng = 0,
    isActive = true,
  } = data;

  const [result] = await query<mysql.ResultSetHeader>(
    // Schema of record (`branches`): the location columns are `city` (string),
    // `latitude` and `longitude`. `city_id` / `lat` / `lng` do not exist in this
    // table, and `slug` is required by the insert, so one is generated here.
    `INSERT INTO branches (
      public_id, organisation_id, name, slug, city, country_id,
      timezone, latitude, longitude, is_active,
      created_at, updated_at
    ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      organisationId,
      name,
      `branch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      String(cityId),
      countryId,
      timezone,
      lat,
      lng,
      isActive,
    ],
  );
  return result.insertId;
}

export interface InsertResourceData {
  branchId: number;
  name: string;
  resourceTypeId?: number;
  sportId?: number;
  capacity?: number;
  isActive?: boolean;
  pricePerHour?: number;
  currencyId?: number;
}

export async function insertResource(
  data: InsertResourceData,
): Promise<number> {
  const {
    branchId,
    name,
    resourceTypeId = 1,
    sportId = 1,
    capacity = 4,
    isActive = true,
    pricePerHour = 50,
  } = data;

  const [result] = await query<mysql.ResultSetHeader>(
    // Schema of record (`resources`): the price column is `hourly_price`, and the
    // table has no `price_per_hour` and no `currency_id` column. The optional
    // `currencyId` field stays in `InsertResourceData` for callers, but is
    // deliberately not written here.
    `INSERT INTO resources (
      public_id, branch_id, name, resource_type_id, sport_id,
      capacity, is_active, hourly_price,
      created_at, updated_at
    ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      branchId,
      name,
      resourceTypeId,
      sportId,
      capacity,
      isActive,
      pricePerHour,
    ],
  );
  return result.insertId;
}
