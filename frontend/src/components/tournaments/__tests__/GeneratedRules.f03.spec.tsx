import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeneratedRules } from '../GeneratedRules';

/**
 * F-03 — the tournament Overview used to lead with the rules snapshot, whose text
 * begins with the engine substrate ("Single Elimination — …"), making a
 * Group Stage + Knockout tournament look like a single-elimination one. The
 * AUTHORITATIVE persisted bracket-type name must now come FIRST, with the snapshot
 * demoted to secondary descriptive text.
 */
describe('F-03 — GeneratedRules shows the persisted format label first', () => {
  it('renders the bracket-type label BEFORE the rules snapshot', () => {
    render(
      <GeneratedRules
        title="Tournament Rules"
        formatLabel="Group Stage + Knockout"
        rules="Single Elimination — Padel Standard — Doubles. Best of 3 sets."
      />,
    );

    const block = screen.getByText('Tournament Rules').parentElement as HTMLElement;
    const text = block.textContent || '';

    expect(text).toContain('Group Stage + Knockout');
    expect(text).toContain('Single Elimination — Padel Standard — Doubles.');

    // The authoritative format is presented first; the substrate-bearing snapshot
    // follows as secondary information.
    expect(text.indexOf('Group Stage + Knockout')).toBeLessThan(
      text.indexOf('Single Elimination — Padel Standard'),
    );

    // The label is its own element (primary), not merely embedded in the snapshot.
    expect(screen.getByText('Group Stage + Knockout').tagName).toBe('P');
  });

  it('stays backward compatible without a format label', () => {
    render(<GeneratedRules title="Tournament Rules" rules="Best of 3 sets." />);

    const block = screen.getByText('Tournament Rules').parentElement as HTMLElement;
    expect(block.textContent).toContain('Best of 3 sets.');
    // No empty primary line is rendered when no label is supplied.
    expect(screen.queryByText('Group Stage + Knockout')).toBeNull();
  });

  it('renders nothing (or the empty node) when there are no rules', () => {
    const { container } = render(<GeneratedRules rules={null} formatLabel="Round Robin" />);
    expect(container.textContent).toBe('');
  });
});
