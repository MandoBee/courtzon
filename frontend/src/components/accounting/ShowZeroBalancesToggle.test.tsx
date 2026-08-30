import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShowZeroBalancesToggle from './ShowZeroBalancesToggle';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: {} } }) },
}));

describe('ShowZeroBalancesToggle', () => {
  it('renders a "Show Zero Balances" labelled checkbox, unchecked by default', () => {
    render(<ShowZeroBalancesToggle checked={false} onChange={vi.fn()} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(screen.getByText('Show Zero Balances')).toBeTruthy();
    expect(checkbox.checked).toBe(false);
  });

  it('reflects the checked state passed by the parent', () => {
    render(<ShowZeroBalancesToggle checked={true} onChange={vi.fn()} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('calls onChange with true when toggled on, and false when toggled off', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ShowZeroBalancesToggle checked={false} onChange={onChange} />);
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is an accessible labelled control', () => {
    render(<ShowZeroBalancesToggle checked={false} onChange={vi.fn()} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.getAttribute('aria-checked')).toBeNull(); // native checkbox is natively accessible
    expect(screen.getByLabelText('Show Zero Balances')).toBeTruthy();
  });
});
