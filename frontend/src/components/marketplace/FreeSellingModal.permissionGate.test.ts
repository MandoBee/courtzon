import { describe, it, expect } from 'vitest';
import source from './FreeSellingModal.tsx?raw';

/**
 * P1-01 — player free-selling must be gated by the player-specific activation
 * permission. `marketplace.sell` belongs to shop/org seller roles and is no
 * longer granted to players; using it here would either hide the activation
 * button entirely or (previously) show a button whose API call is denied.
 */
describe('FreeSellingModal permission gate (P1-01)', () => {
  it('gates activation on marketplace.player.activate', () => {
    expect(source).toContain('<Can permission="marketplace.player.activate">');
  });

  it('does not gate activation on the seller role permission', () => {
    expect(source).not.toContain('permission="marketplace.sell"');
  });
});
