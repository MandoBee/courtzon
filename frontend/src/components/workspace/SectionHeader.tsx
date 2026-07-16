import { Link } from 'react-router-dom';

interface Props {
  icon: string;
  title: string;
  action?: { label: string; to: string };
}

export default function SectionHeader({ icon, title, action }: Props) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h2 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide">{title}</h2>
      </div>
      {action && (
        <Link to={action.to} className="text-xs text-[var(--color-primary)] font-medium">
          {action.label} →
        </Link>
      )}
    </div>
  );
}
