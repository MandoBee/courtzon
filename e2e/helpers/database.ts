import { createHash, randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';

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

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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

export async function cleanup(): Promise<void> {
  const p = await connect();
  await p.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of TRUNCATE_TABLES) {
    try {
      await p.query(`TRUNCATE TABLE \`${table}\``);
    } catch {
      // table may not exist in some environments
    }
  }
  await p.query('SET FOREIGN_KEY_CHECKS = 1');
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

  const hashedPassword = hashToken(password);

  const [result] = await query<mysql.ResultSetHeader>(
    `INSERT INTO users (
      phone_number, password_hash, full_name, email, gender,
      timezone, country_id, birth_date, main_sport_id,
      main_level_id, language_id, is_active, is_verified,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      phoneNumber,
      hashedPassword,
      fullName,
      email,
      gender,
      timezone,
      countryId,
      birthDate || null,
      mainSportId || null,
      mainLevelId || null,
      languageId || null,
      isActive,
      isVerified,
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
    cityId = 1,
  } = data;

  const [result] = await query<mysql.ResultSetHeader>(
    `INSERT INTO organisations (
      owner_id, name, org_type_id, email, phone, website,
      is_verified, is_active, country_id, city_id,
      created_at, updated_at, public_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(),
      UUID())`,
    [ownerId, name, orgTypeId, email, phone, website, isVerified, isActive, countryId, cityId],
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
    `INSERT INTO branches (
      organisation_id, name, city_id, country_id,
      timezone, lat, lng, is_active,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [organisationId, name, cityId, countryId, timezone, lat, lng, isActive],
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
    currencyId = 1,
  } = data;

  const [result] = await query<mysql.ResultSetHeader>(
    `INSERT INTO resources (
      branch_id, name, resource_type_id, sport_id,
      capacity, is_active, price_per_hour, currency_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      branchId,
      name,
      resourceTypeId,
      sportId,
      capacity,
      isActive,
      pricePerHour,
      currencyId,
    ],
  );
  return result.insertId;
}
