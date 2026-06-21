import { createContext, useContext, useState, useCallback, useRef } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, action?: { label: string; onClick: () => void }, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = 'success', action?: { label: string; onClick: () => void }, duration?: number) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, type, action }]);
    const ms = duration ?? (type === 'error' ? 5000 : 4000);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, ms);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] shadow-lg border text-sm font-medium animate-slide-in
              ${t.type === 'success' ? 'bg-[var(--color-success-bg)] border-[var(--color-border)] text-[var(--color-success-text)]' : ''}
              ${t.type === 'error' ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/40 dark:border-red-700 dark:text-red-300' : ''}
              ${t.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/40 dark:border-yellow-700 dark:text-yellow-300' : ''}
              ${t.type === 'info' ? 'bg-[var(--color-info-bg)] border-[var(--color-border)] text-[var(--color-info-text)] border-[var(--color-border)]' : ''}`}>
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button onClick={() => { t.action!.onClick(); removeToast(t.id); }}
                className="text-xs font-semibold underline hover:no-underline whitespace-nowrap">{t.action.label}</button>
            )}
            <button onClick={() => removeToast(t.id)} className="text-current opacity-50 hover:opacity-100 ml-1">&times;</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
