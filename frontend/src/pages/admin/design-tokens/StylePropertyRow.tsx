import type { ReactNode } from 'react';
import { RoleEditableCheckbox } from './RoleEditableCheckbox';
import { ResetTokenButton } from './ResetTokenButton';

/** Shared grid: label | Role | control | reset */
export const STYLE_PROPERTY_GRID =
  'grid grid-cols-[minmax(0,1fr)_2.75rem_minmax(9rem,1fr)_1.25rem] gap-x-2 gap-y-0 items-center';

export function StylePropertyRowHeader() {
  return (
    <div
      className={`${STYLE_PROPERTY_GRID} pb-1 mb-1 border-b border-[var(--color-border)] text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide`}
    >
      <span>Property</span>
      <span className="text-center">Role</span>
      <span className="text-right">Value</span>
      <span />
    </div>
  );
}

export function StylePropertyRow({
  label,
  tokenKey,
  description,
  isDirty,
  roleEditable,
  onRoleEditableChange,
  showRole = true,
  control,
  onReset,
}: {
  label: string;
  tokenKey?: string;
  description?: string;
  isDirty?: boolean;
  roleEditable?: boolean;
  onRoleEditableChange?: (v: boolean) => void;
  showRole?: boolean;
  control: ReactNode;
  onReset?: () => void;
}) {
  return (
    <div className={`${STYLE_PROPERTY_GRID} py-2 border-b border-[var(--color-border)] last:border-0`}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--color-text)]">{label}</span>
          {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] shrink-0" title="Unsaved" />}
        </div>
        {description && <p className="text-[10px] text-[var(--color-text-muted)]">{description}</p>}
        {tokenKey && <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{tokenKey}</span>}
      </div>
      <div className="flex justify-center">
        {showRole && onRoleEditableChange != null ? (
          <RoleEditableCheckbox compact checked={!!roleEditable} onChange={onRoleEditableChange} />
        ) : null}
      </div>
      <div className="flex justify-end min-w-0">{control}</div>
      <div className="flex justify-center">
        {onReset ? <ResetTokenButton onClick={onReset} /> : null}
      </div>
    </div>
  );
}
