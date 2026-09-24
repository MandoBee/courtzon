import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
  process.env.JWT_SECRET = 'test-secret';
});

import { resolveTemplate, renderRecipientNotice } from '../application/template.service.js';

const TEMPLATE_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), 'src/modules/notifications/application/template.service.ts'),
  'utf-8',
);

const tpl = (titleTemplate: string, bodyTemplate: string) => ({ titleTemplate, bodyTemplate } as any);

describe('G9-D5 — template conditional rendering ({{#if}}) no longer leaks', () => {
  it('removes a {{#if key}} block when the key is missing', () => {
    const { body } = resolveTemplate(tpl('T', 'Your match result: {{result}}{{#if ranking}}. Ranking: #{{ranking}}{{/if}}.'), { result: 'win' });
    expect(body).toBe('Your match result: win.');
  });

  it('keeps and substitutes a {{#if key}} block when the key is present', () => {
    const { body } = resolveTemplate(
      tpl('T', '{{name}} has finished.{{#if winnerName}} Winner: {{winnerName}}.{{/if}}'),
      { name: 'Cup', winnerName: 'Niazy' },
    );
    expect(body).toBe('Cup has finished. Winner: Niazy.');
  });

  it('resolves plain placeholders as before', () => {
    const { title, body } = resolveTemplate(tpl('{{name}} starts', 'On {{startDate}}'), { name: 'Cup', startDate: 'Oct 1' });
    expect(title).toBe('Cup starts');
    expect(body).toBe('On Oct 1');
  });
});

describe('G9-D5 — tournament template content (no technical event names)', () => {
  const removedTechnicalTitles = [
    'Tournament Withdrawal Resolved',
    'Tournament Match Created',
    'Tournament Match Progressed',
    'Tournament Stage Completed',
    'Tournament Participant Replaced',
    'Tournament Registration Open',
  ];

  it('L/M. EN + AR tournament templates are defined for every mapped event', () => {
    const events = [
      'tournament:created', 'tournament:registration-open', 'tournament:registration-closed',
      'tournament:starting-soon', 'tournament:match-scheduled', 'tournament:result',
      'tournament:bracket-generated', 'tournament:completed', 'tournament:waitlist-promoted',
      'tournament:stage-completed', 'tournament:match-created', 'tournament:match-progressed',
      'tournament:participant-replaced', 'tournament:withdrawal-resolved',
    ];
    for (const ev of events) {
      expect(TEMPLATE_SOURCE).toContain(`eventName: '${ev}', locale: 'en', categorySlug: 'tournament'`);
      expect(TEMPLATE_SOURCE).toContain(`eventName: '${ev}', locale: 'ar', categorySlug: 'tournament'`);
    }
  });

  it('N. no technical event names leak into player-facing titles', () => {
    for (const title of removedTechnicalTitles) {
      expect(TEMPLATE_SOURCE).not.toContain(`titleTemplate: '${title}'`);
    }
  });

  it('N. rendered tournament output never leaks {{#if}}/{{...}} markers', () => {
    const { body } = resolveTemplate(tpl('T', '{{name}} has finished.{{#if winnerName}} Winner: {{winnerName}}.{{/if}}'), { name: 'Cup' });
    expect(body).toBe('Cup has finished.');
    expect(body).not.toMatch(/\{\{/);
  });

  it('match-scheduled / result route to /matches/{{matchId}}; others to /tournaments/{{tournamentId}}', () => {
    expect(TEMPLATE_SOURCE).toContain("titleTemplate: 'Your Match Is Scheduled'");
    expect(TEMPLATE_SOURCE).toContain("titleTemplate: 'تم جدولة مباراتك'");
    expect(TEMPLATE_SOURCE).toContain("titleTemplate: 'Match Result'");
    expect(TEMPLATE_SOURCE).toContain("routePattern: '/matches/{{matchId}}'");
    expect(TEMPLATE_SOURCE).toContain("routePattern: '/tournaments/{{tournamentId}}'");
  });
});

describe('G9-D5 — recipient notice role-aware titles', () => {
  it('advancing opponent gets a player-facing title, not the event name', () => {
    const notice = renderRecipientNotice('tournament:withdrawal-resolved', 'advancing', 'en', { tournamentId: 1 });
    expect(notice?.title).toBe('You Advance!');
    expect(notice?.body).toContain('opponent withdrew');
  });

  it('withdrawn user gets a confirmation title', () => {
    const notice = renderRecipientNotice('tournament:withdrawal-resolved', 'withdrawn', 'en', { tournamentId: 1 });
    expect(notice?.title).toBe('Withdrawal Confirmed');
  });

  it('replacement participant gets an onboarding title (AR)', () => {
    const notice = renderRecipientNotice('tournament:participant-replaced', 'replacement', 'ar', { tournamentId: 1 });
    expect(notice?.title).toBe('تمت إضافتك!');
    expect(notice?.body).toContain('بديل');
  });
});