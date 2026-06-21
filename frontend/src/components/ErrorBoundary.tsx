import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../i18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-[var(--color-text)] mb-2">{t('common.error')}</h1>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">
              {this.state.error?.message || t('error.unexpected')}
            </p>
            <button
              onClick={this.handleReset}
              className="px-6 py-2.5 bg-[var(--color-primary)] text-white font-medium rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
            >
              {t('common.try_again')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
