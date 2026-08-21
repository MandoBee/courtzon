/**
 * Schema ↔ Code ID Length Compatibility Tests
 *
 * This test suite prevents the class of bugs where the application generates
 * identifiers that exceed the database column width, causing ER_DATA_TOO_LONG
 * errors and HTTP 500 responses.
 *
 * Every ID generator in the codebase must have a corresponding entry in
 * COLUMN_MAX_LENGTHS. If you add a new column or change a generator format,
 * this test will catch the mismatch.
 */
import { describe, it, expect } from 'vitest';
import { generateUUID, generateSessionToken, generateRefreshToken, hashToken, generateQRToken } from '../shared/utils/token.js';
import { generateUlid } from '../shared/event-bus/event-envelope.js';

// ─────────────────────────────────────────────────────────────────────
// Registry of DB column max lengths (VARCHAR lengths from schema DDL)
// Update this when columns are added or widened via migration.
// ─────────────────────────────────────────────────────────────────────

const COLUMN_MAX_LENGTHS: Record<string, number> = {
  // ── command / event pipeline ──
  'processed_commands.command_id':       128,
  'processed_commands.command_type':     64,
  'processed_commands.subscriber_id':    128,
  'processed_commands.correlation_id':   64,
  'processed_commands.causation_id':     64,

  'processed_events.event_id':          26,
  'processed_events.subscriber_id':     128,

  'published_events.event_id':          26,
  'published_events.correlation_id':    64,
  'published_events.causation_id':      64,

  'dead_letter_entries.message_id':     128,
  'dead_letter_entries.message_type':   64,
  'dead_letter_entries.source':         64,
  'dead_letter_entries.subscriber_id':  128,
  'dead_letter_entries.correlation_id': 64,
  'dead_letter_entries.causation_id':   64,

  // ── workflow ──
  'workflow_instances.public_id':       26,
  'workflow_instances.correlation_id':  64,
  'workflow_events.correlation_id':     64,

  // ── payment ──
  'payment_transactions.trace_id':      36,
  'payment_transactions.gateway_reference': 255,
  'payment_transactions.idempotency_key': 64,

  // ── public IDs ──
  'users.public_id':                    36,
  'organisations.public_id':            36,
  'branches.public_id':                 36,
  'resources.public_id':                36,
  'bookings.public_id':                 36,
  'orders.public_id':                   36,
  'wallet_transactions.public_id':      36,
  'uploads.public_id':                  36,
  'tournaments.public_id':              36,
  'transactions.public_id':             36,

  // ── tokens / hashes ──
  'user_sessions.session_token_hash':   64,
  'user_sessions.refresh_token_hash':   255,

  // ── reference types (human-readable strings) ──
  'financial_journal_entries.reference_type': 100,
  'wallet_transactions.reference_type':       100,
  'inventory_logs.reference_type':            50,
  'payment_transactions.reference_type':      50,
};

// ─────────────────────────────────────────────────────────────────────
// Registry of all ID generators and their maximum output lengths.
// The key is a descriptive name; the value is the MAXIMUM chars.
// ─────────────────────────────────────────────────────────────────────

const GENERATOR_MAX_LENGTHS: Record<string, number> = {
  // Utility functions
  'generateUUID()':                     36,
  'crypto.randomUUID()':                36,
  'MySQL UUID()':                       36,
  'generateUlid()':                     26,
  'generateSessionToken()':            64,
  'generateRefreshToken()':            86,
  'hashToken()':                        64,
  'generateQRToken()':                  42,

  // Command IDs — template literal format: `${prefix}-${Date.now()}-${rand6}`
  // Date.now() in 2026 = 13 digits, rand6 = Math.random().toString(36).slice(2,8) = 6 chars
  // Total = prefix.length + 1 + 13 + 1 + 6 = prefix.length + 21
  'command.process-payment':            36,  // "process-payment"(15) + 21
  'command.deposit-wallet':             35,  // "deposit-wallet"(14) + 21
  'command.withdraw-wallet':            36,  // "withdraw-wallet"(15) + 21
  'command.ConfirmBooking':             35,  // "ConfirmBooking"(14) + 21
  'command.CancelBooking':              34,  // "CancelBooking"(13) + 21
  'command.CompleteBooking':            36,  // "CompleteBooking"(15) + 21
  'command.expire-booking':             35,  // "expire-booking"(14) + 21
  'command.complete-booking':           37,  // "complete-booking"(16) + 21
  'command.create-booking':             35,  // "create-booking"(14) + 21
  'command.confirm-booking':            36,  // "confirm-booking"(15) + 21
  'command.cancel-booking':             35,  // "cancel-booking"(14) + 21
  'command.dispatch-notification':      42,  // "dispatch-notification"(21) + 21

  // Workflow command ID: `${correlationId}:${step.name}`
  // correlationId = ULID(26), step.name typically ≤ 40 chars
  'command.workflow-composite':         67,  // 26 + 1 + 40

  // Workflow public_id: `${Date.now().toString(36)}-${random6}`.substring(0, 26)
  'workflow.public_id':                 26,  // truncated to 26

  // Gateway references
  'gateway.wallet_reference':           21,  // "wallet_"(7) + 13
  'gateway.v2_reference':               17,  // "v2_"(3) + 13
  'gateway.paymob_special_reference':   42,  // "${refType}_${refId}_${ts}"
};

// ─────────────────────────────────────────────────────────────────────
// Mappings: which generator fills which DB column
// ─────────────────────────────────────────────────────────────────────

const GENERATOR_TO_COLUMN: Record<string, string[]> = {
  'generateUUID()': [
    'users.public_id',
    'organisations.public_id',
    'branches.public_id',
    'resources.public_id',
    'bookings.public_id',
    'orders.public_id',
    'wallet_transactions.public_id',
    'uploads.public_id',
    'tournaments.public_id',
    'transactions.public_id',
  ],
  'crypto.randomUUID()': [
    'payment_transactions.trace_id',
    'uploads.public_id',
  ],
  'MySQL UUID()': [
    'orders.public_id',
    'tournaments.public_id',
    'organisations.public_id',
  ],
  'generateUlid()': [
    'processed_events.event_id',
    'published_events.event_id',
    'workflow_instances.public_id',
  ],
  'generateSessionToken()': [
    'user_sessions.session_token_hash',
  ],
  'generateRefreshToken()': [
    'user_sessions.refresh_token_hash',
  ],
  'hashToken()': [
    'user_sessions.session_token_hash',
    'user_sessions.refresh_token_hash',
  ],
  'generateQRToken()': [
    // stored as TEXT or separate column, not varchar-limited
  ],
  'command.process-payment':      ['processed_commands.command_id', 'dead_letter_entries.message_id'],
  'command.deposit-wallet':       ['processed_commands.command_id', 'dead_letter_entries.message_id'],
  'command.withdraw-wallet':      ['processed_commands.command_id', 'dead_letter_entries.message_id'],
  'command.ConfirmBooking':       ['processed_commands.command_id', 'dead_letter_entries.message_id'],
  'command.CancelBooking':        ['processed_commands.command_id', 'dead_letter_entries.message_id'],
  'command.expire-booking':       ['processed_commands.command_id', 'dead_letter_entries.message_id'],
  'command.complete-booking':     ['processed_commands.command_id', 'dead_letter_entries.message_id'],
  'command.create-booking':       ['processed_commands.command_id', 'dead_letter_entries.message_id'],
  'command.CompleteBooking':       ['processed_commands.command_id', 'dead_letter_entries.message_id'],
  'command.confirm-booking':      ['processed_commands.command_id', 'dead_letter_entries.message_id'],
  'command.cancel-booking':       ['processed_commands.command_id', 'dead_letter_entries.message_id'],
  'command.dispatch-notification':['processed_commands.command_id', 'dead_letter_entries.message_id'],
  'command.workflow-composite':   ['processed_commands.command_id', 'dead_letter_entries.message_id'],
  'workflow.public_id':           ['workflow_instances.public_id'],
  'gateway.wallet_reference':     ['payment_transactions.gateway_reference'],
  'gateway.v2_reference':         ['payment_transactions.gateway_reference'],
  'gateway.paymob_special_reference': ['payment_transactions.gateway_reference'],
};

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('Schema ↔ Code ID Length Compatibility', () => {

  describe('Utility functions produce expected lengths', () => {
    it('generateUUID() always produces exactly 36 chars', () => {
      for (let i = 0; i < 100; i++) {
        expect(generateUUID()).toHaveLength(36);
      }
    });

    it('generateUlid() always produces exactly 26 chars', () => {
      for (let i = 0; i < 100; i++) {
        expect(generateUlid()).toHaveLength(26);
      }
    });

    it('generateSessionToken() produces ≤ 64 chars', () => {
      for (let i = 0; i < 100; i++) {
        const token = generateSessionToken();
        expect(token.length).toBeLessThanOrEqual(64);
        expect(token.length).toBeGreaterThan(0);
      }
    });

    it('generateRefreshToken() produces ≤ 86 chars', () => {
      for (let i = 0; i < 100; i++) {
        const token = generateRefreshToken();
        expect(token.length).toBeLessThanOrEqual(86);
        expect(token.length).toBeGreaterThan(0);
      }
    });

    it('hashToken() always produces exactly 64 chars (SHA-256 hex)', () => {
      expect(hashToken('test')).toHaveLength(64);
      expect(hashToken('')).toHaveLength(64);
      expect(hashToken('a'.repeat(1000))).toHaveLength(64);
    });

    it('generateQRToken() produces ≤ 42 chars', () => {
      for (let i = 0; i < 100; i++) {
        const token = generateQRToken(i + 1);
        expect(token.length).toBeLessThanOrEqual(42);
        expect(token.startsWith('QR_')).toBe(true);
      }
    });
  });

  describe('Template-literal command IDs never exceed 128 chars', () => {
    const templateGenerators: Array<{ name: string; prefix: string }> = [
      { name: 'process-payment',      prefix: 'process-payment' },
      { name: 'deposit-wallet',       prefix: 'deposit-wallet' },
      { name: 'withdraw-wallet',      prefix: 'withdraw-wallet' },
      { name: 'ConfirmBooking',       prefix: 'ConfirmBooking' },
      { name: 'CancelBooking',        prefix: 'CancelBooking' },
      { name: 'CompleteBooking',      prefix: 'CompleteBooking' },
      { name: 'expire-booking',       prefix: 'expire-booking' },
      { name: 'complete-booking',     prefix: 'complete-booking' },
      { name: 'create-booking',       prefix: 'create-booking' },
      { name: 'confirm-booking',      prefix: 'confirm-booking' },
      { name: 'cancel-booking',       prefix: 'cancel-booking' },
      { name: 'dispatch-notification', prefix: 'dispatch-notification' },
    ];

    for (const gen of templateGenerators) {
      it(`command.${gen.name}: max length ≤ 128`, () => {
        const prefix = gen.prefix;
        const maxTs = 9999999999999;   // max 13-digit timestamp
        const maxRand = 'zzzzzz';       // max base-36 slice(2,8)
        const maxId = `${prefix}-${maxTs}-${maxRand}`;
        const registered = GENERATOR_MAX_LENGTHS[`command.${gen.name}`];
        expect(registered).toBeDefined();
        expect(maxId.length).toBe(registered);
        expect(maxId.length).toBeLessThanOrEqual(128);
      });
    }

    it('command.workflow-composite: max length ≤ 128', () => {
      const maxCorrelationId = 'A'.repeat(26); // ULID
      const maxStepName = 'A'.repeat(40);
      const maxId = `${maxCorrelationId}:${maxStepName}`;
      expect(maxId.length).toBe(67);
      expect(maxId.length).toBeLessThanOrEqual(128);
    });
  });

  describe('Every generator fits its target column', () => {
    for (const [generator, columns] of Object.entries(GENERATOR_TO_COLUMN)) {
      if (columns.length === 0) continue;

      it(`${generator} fits all target columns`, () => {
        const maxLen = GENERATOR_MAX_LENGTHS[generator];
        expect(maxLen).toBeDefined();

        for (const col of columns) {
          const colMaxLen = COLUMN_MAX_LENGTHS[col];
          expect(colMaxLen).toBeDefined();
          expect(maxLen).toBeLessThanOrEqual(colMaxLen);
        }
      });
    }
  });

  describe('Registry completeness — no orphan entries', () => {
    it('every GENERATOR_TO_COLUMN key exists in GENERATOR_MAX_LENGTHS', () => {
      for (const gen of Object.keys(GENERATOR_TO_COLUMN)) {
        expect(GENERATOR_MAX_LENGTHS[gen]).toBeDefined();
      }
    });

    it('every GENERATOR_TO_COLUMN value column exists in COLUMN_MAX_LENGTHS', () => {
      for (const [gen, columns] of Object.entries(GENERATOR_TO_COLUMN)) {
        for (const col of columns) {
          expect(COLUMN_MAX_LENGTHS[col]).toBeDefined();
        }
      }
    });
  });

  describe('No VARCHAR(26) column can receive template-literal IDs', () => {
    const varchar26Columns = Object.entries(COLUMN_MAX_LENGTHS)
      .filter(([, len]) => len === 26)
      .map(([col]) => col);

    for (const col of varchar26Columns) {
      it(`${col} (VARCHAR 26): no template-literal generator targets it`, () => {
        for (const [gen, targets] of Object.entries(GENERATOR_TO_COLUMN)) {
          if (targets.includes(col) && gen.startsWith('command.')) {
            throw new Error(
              `MISMATCH: template-literal generator "${gen}" (${GENERATOR_MAX_LENGTHS[gen]} chars) targets "${col}" (VARCHAR 26)`,
            );
          }
        }
      });
    }
  });
});
