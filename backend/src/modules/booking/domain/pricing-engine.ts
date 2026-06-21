import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export interface PriceBreakdown {
  totalPrice: number;
  standardAmount: number;
  peakAmount: number;
  peakMultiplier: number;
}

export class PricingEngine {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async calculatePrice(
    resourceId: number,
    startTime: string,
    endTime: string,
  ): Promise<PriceBreakdown> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT hourly_price, branch_id FROM resources WHERE id = ? AND is_active = TRUE',
      [resourceId]
    );
    if (!rows.length) throw new Error('Resource not found');
    const hourlyPrice = Number(rows[0].hourly_price || 0);
    const branchId = rows[0].branch_id;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const totalMinutes = endMinutes - startMinutes;
    const hours = Math.max(totalMinutes / 60, 0.5);

    const bookingDate = new Date();
    const dayOfWeek = bookingDate.getDay() === 0 ? 7 : bookingDate.getDay();

    const [peakRows] = await this.pool.execute<RowData>(
      `SELECT start_time, end_time, price_multiplier FROM peak_hour_pricing
       WHERE resource_id = ? AND day_of_week = ?
       ORDER BY start_time`,
      [resourceId, dayOfWeek]
    );

    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    let standardAmount = 0;
    let peakAmount = 0;
    let peakMultiplier = 1;

    if (peakRows.length === 0) {
      standardAmount = hourlyPrice * hours;
      return { totalPrice: standardAmount, standardAmount, peakAmount, peakMultiplier: 1 };
    }

    let cursor = startMinutes;
    while (cursor < endMinutes) {
      const segmentEnd = Math.min(
        cursor + 60,
        endMinutes
      );
      const segmentHours = (segmentEnd - cursor) / 60;

      const activePeak = peakRows.find((p: any) => {
        const pStart = toMinutes(p.start_time);
        const pEnd = toMinutes(p.end_time);
        return cursor < pEnd && segmentEnd > pStart;
      });

      if (activePeak) {
        const mult = Number(activePeak.price_multiplier);
        peakAmount += hourlyPrice * segmentHours * mult;
        peakMultiplier = Math.max(peakMultiplier, mult);
      } else {
        standardAmount += hourlyPrice * segmentHours;
      }

      cursor = segmentEnd;
    }

    const totalPrice = standardAmount + peakAmount;

    return { totalPrice, standardAmount, peakAmount, peakMultiplier };
  }
}

export const pricingEngine = new PricingEngine();
