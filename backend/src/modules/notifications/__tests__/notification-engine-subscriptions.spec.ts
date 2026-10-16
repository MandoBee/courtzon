import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * P1-04A — Notification engine subscription/handler consistency.
 *
 * The notification engine keeps TWO hand-maintained lists:
 *   • `eventGroups`      → the handler map (each `events: [...]` group);
 *   • `subscribedEvents` → the list actually registered via eventBusV2.on().
 *
 * A name that is in the handler map but missing from `subscribedEvents` never
 * registers its handler, so the notification is silently dropped. This is the
 * P1-04 defect (referee + coach lifecycle events). This suite parses the engine
 * source and asserts the two lists cannot drift, instead of hard-coding a few
 * event names — so any FUTURE omission fails the test.
 *
 * The suite is fully isolated: it only reads one source file (no database,
 * network, or runtime event-bus usage).
 */

const ENGINE_PATH = path.resolve(
  process.cwd(),
  'src/modules/notifications/application/notification-engine.ts',
);

/**
 * Subscribed-without-handler exceptions. These are subscribed events that
 * currently have no `eventGroups` handler (documented in notification-engine.ts).
 * The second assertion below also fails if one of these stops being subscribed,
 * so the exception set is exact.
 */
const ALLOWED_NO_HANDLER = ['system:digest', 'setting:profile-applied'];

const COACH_LIFECYCLE_EVENTS = [
  'coach:application-submitted', 'coach:application-approved', 'coach:application-rejected',
  'coach:verified',
  'coach:platform-activated', 'coach:platform-suspended', 'coach:platform-deactivated',
  'coach:org-accepted', 'coach:org-rejected', 'coach:org-suspended', 'coach:org-resumed', 'coach:org-ended',
  'coach:invite-accepted', 'coach:invite-rejected',
];

function readEngineSource(): string {
  return fs.readFileSync(ENGINE_PATH, 'utf8');
}

/** All event names declared in the handler map (`events: [...]` groups). */
function extractHandlerMapEvents(src: string): string[] {
  const events: string[] = [];
  for (const group of src.matchAll(/events:\s*\[([\s\S]*?)\]/g)) {
    for (const quoted of group[1].matchAll(/'([^']+)'/g)) events.push(quoted[1]);
  }
  return events;
}

/** All event names present in the `subscribedEvents` array literal. */
function extractSubscribedEvents(src: string): string[] {
  const block = src.match(/const subscribedEvents: string\[\] = \[([\s\S]*?)\];/);
  if (!block) throw new Error('subscribedEvents array not found in notification-engine.ts');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('P1-04A — notification engine subscription consistency', () => {
  const src = readEngineSource();
  const handlerEvents = extractHandlerMapEvents(src);
  const subscribedEvents = extractSubscribedEvents(src);

  it('parses both lists (a source-shape change must not make the suite pass vacuously)', () => {
    expect(handlerEvents.length).toBeGreaterThan(100);
    expect(subscribedEvents.length).toBeGreaterThan(100);
  });

  it('subscribedEvents contains no duplicate entries', () => {
    const seen = new Set<string>();
    const duplicates = subscribedEvents.filter((e) => (seen.has(e) ? true : (seen.add(e), false)));
    expect(duplicates).toEqual([]);
  });

  it('every event handled by eventGroups is present in subscribedEvents', () => {
    const subscribed = new Set(subscribedEvents);
    const missing = [...new Set(handlerEvents)].filter((e) => !subscribed.has(e)).sort();
    expect(missing).toEqual([]);
  });

  it('every subscribed event has a handler, except the documented exceptions', () => {
    const handled = new Set(handlerEvents);
    const withoutHandler = subscribedEvents.filter((e) => !handled.has(e));
    const unexpected = withoutHandler.filter((e) => !ALLOWED_NO_HANDLER.includes(e)).sort();
    const documentedButNotSubscribed = ALLOWED_NO_HANDLER.filter((e) => !subscribedEvents.includes(e));
    expect(unexpected).toEqual([]);
    expect(documentedButNotSubscribed).toEqual([]);
  });

  it('referee lifecycle events are truly subscribed (not only handler-map declared)', () => {
    expect(subscribedEvents).toContain('referee:assigned');
    expect(subscribedEvents).toContain('referee:unassigned');
  });

  it('all coach lifecycle events are truly subscribed', () => {
    const missing = COACH_LIFECYCLE_EVENTS.filter((e) => !subscribedEvents.includes(e));
    expect(missing).toEqual([]);
  });
});
