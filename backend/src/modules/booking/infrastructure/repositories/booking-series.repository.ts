import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import { toMySqlDateTime } from '../../../../shared/utils/mysql-date.js';

type RowData = mysql.RowDataPacket[];

export interface BookingSeriesRow {
  id: number;
  publicId: string;
  organisationId: number;
  branchId: number;
  resourceId: number;
  createdBy: number;
  recurrenceType: string;
  weekdays: string; // 'mon,thu' (stored SET codes)
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  status: string;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

const WEEKDAY_CODE: Record<number, string> = {
  1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 7: 'sun',
};

export function weekdayNumbersToSet(weekdays: number[]): string {
  const codes = [...new Set(weekdays)]
    .filter(n => WEEKDAY_CODE[n])
    .sort((a, b) => a - b)
    .map(n => WEEKDAY_CODE[n]);
  return codes.join(',');
}

export function weekdaySetToNumbers(setValue: string): number[] {
  if (!setValue) return [];
  const reverse: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
  return setValue.split(',').map((c) => c.trim()).filter((c) => reverse[c]).map((c) => reverse[c]);
}

function mapRow(row: any): BookingSeriesRow {
  const fmt = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ') : v);
  return {
    id: Number(row.id),
    publicId: row.public_id,
    organisationId: Number(row.organisation_id),
    branchId: Number(row.branch_id),
    resourceId: Number(row.resource_id),
    createdBy: Number(row.created_by),
    recurrenceType: row.recurrence_type,
    weekdays: row.weekdays,
    startDate: fmt(row.start_date),
    endDate: fmt(row.end_date),
    startTime: (row.start_time instanceof Date
      ? row.start_time.toISOString().slice(11, 16)
      : String(row.start_time).slice(0, 5)),
    endTime: (row.end_time instanceof Date
      ? row.end_time.toISOString().slice(11, 16)
      : String(row.end_time).slice(0, 5)),
    timezone: row.timezone,
    status: row.status,
    idempotencyKey: row.idempotency_key ?? null,
    createdAt: fmt(row.created_at),
    updatedAt: fmt(row.updated_at),
  };
}

export class BookingSeriesRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async create(data: {
    publicId: string;
    organisationId: number;
    branchId: number;
    resourceId: number;
    createdBy: number;
    weekdays: string; // SET codes e.g. 'mon,thu'
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    timezone: string;
    status?: string;
    idempotencyKey?: string | null;
  }, conn?: mysql.PoolConnection): Promise<number> {
    const db = conn ?? this.pool;
    const [result] = await db.execute<mysql.ResultSetHeader>(
      `INSERT INTO booking_series
        (public_id, organisation_id, branch_id, resource_id, created_by, recurrence_type,
         weekdays, start_date, end_date, start_time, end_time, timezone, status, idempotency_key)
       VALUES (?, ?, ?, ?, ?, 'weekly', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.publicId,
        data.organisationId,
        data.branchId,
        data.resourceId,
        data.createdBy,
        data.weekdays,
        data.startDate,
        data.endDate,
        data.startTime,
        data.endTime,
        data.timezone,
        data.status || 'active',
        data.idempotencyKey || null,
      ],
    );
    return result.insertId;
  }

  async findById(id: number): Promise<BookingSeriesRow | null> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM booking_series WHERE id = ?', [id],
    );
    return rows.length ? mapRow(rows[0] as any) : null;
  }

  async findByIdempotencyKey(key: string): Promise<BookingSeriesRow | null> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM booking_series WHERE idempotency_key = ?', [key],
    );
    return rows.length ? mapRow(rows[0] as any) : null;
  }

  /** R2 — series list. Null orgId (platform admin) returns ALL series. */
  async listByOrg(organisationId: number | null | undefined, branchId?: number): Promise<BookingSeriesRow[]> {
    let sql = 'SELECT * FROM booking_series';
    const params: any[] = [];
    const where: string[] = [];
    if (organisationId != null) {
      where.push('organisation_id = ?');
      params.push(organisationId);
    }
    if (branchId) {
      where.push('branch_id = ?');
      params.push(branchId);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY id DESC';
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows.map((r: any) => mapRow(r));
  }
}

export const bookingSeriesRepository = new BookingSeriesRepository();