import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { Link } from 'react-router-dom';

interface Props {
  flag: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureFlagGuard({ flag, children, fallback }: Props) {
  const enabled = useFeatureFlag(flag);
  if (enabled) return <>{children}</>;
  if (fallback) return <>{fallback}</>;
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="text-5xl mb-4">🚧</div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">Feature Unavailable</h1>
      <p className="text-[var(--color-text-muted)] mb-6 max-w-md">This feature is currently disabled. Please check back later.</p>
      <Link to="/" className="px-5 py-2.5 text-sm font-semibold text-white bg-[var(--gradient-primary)] rounded-xl">Go Home</Link>
    </div>
  );
}
