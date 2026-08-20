import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { marketplaceComplaintRepository } from '../infrastructure/repositories/marketplace-complaint.repository.js';
import { marketplaceComplaintService } from '../application/marketplace-complaint.service.js';

const log = createModuleLogger('marketplace-complaint-worker');

type RowData = import('mysql2/promise').RowDataPacket[];

/**
 * Scheduled BullMQ worker: resolves complaints whose replacement/reshipment
 * receipt confirmation window (7 days) has expired without the player confirming.
 * Simple minimal behaviour — the complaint is auto-resolved as completed.
 */
export async function handleComplaintReceiptTimeout(): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT id FROM marketplace_complaints
     WHERE status = 'awaiting_confirmation'
       AND receipt_awaited = 1
       AND receipt_due_at IS NOT NULL
       AND receipt_due_at <= NOW()
     LIMIT 200`,
  );
  if (!rows.length) return;

  let resolved = 0;
  for (const row of rows as any[]) {
    const complaint = await marketplaceComplaintRepository.findById(row.id);
    if (!complaint || complaint.status !== 'awaiting_confirmation') continue;
    try {
      await marketplaceComplaintRepository.updateFields(complaint.id, {
        resolved_at: new Date(),
        resolved_by: complaint.resolved_by,
      });
      await marketplaceComplaintRepository.updateStatus(complaint.id, 'resolved', complaint.aggregate_version, {
        resolved_at: new Date(),
      });
      resolved++;
    } catch (err) {
      log.warn({ err, complaintId: complaint.id }, 'Complaint receipt timeout resolution skipped (version conflict or race)');
    }
  }

  log.info({ resolved }, 'Complaint receipt timeout resolution completed');
}

/**
 * Scheduled BullMQ worker: escalates complaints whose collection deadline has
 * passed while collection is still pending. The complaint stays open and the
 * disputed Financial Entitlement stays ON_HOLD; CourtZon staff are notified for
 * manual intervention. Idempotent (collection_escalated_at guard).
 */
export async function handleComplaintCollectionEscalation(): Promise<void> {
  const escalated = await marketplaceComplaintService.escalateOverdueCollections(100);
  if (escalated > 0) {
    log.info({ escalated }, 'Collection-deadline escalation completed');
  }
}