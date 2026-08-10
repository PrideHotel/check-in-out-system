import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { ToastContext } from './toast-context';

const VARIANTS = {
  success: {
    icon: CheckCircle2,
    wrap: 'border-emerald-200 bg-white',
    accent: 'bg-emerald-500',
    iconColor: 'text-emerald-600',
  },
  error: {
    icon: AlertCircle,
    wrap: 'border-rose-200 bg-white',
    accent: 'bg-rose-500',
    iconColor: 'text-rose-600',
  },
  info: {
    icon: Info,
    wrap: 'border-sky-200 bg-white',
    accent: 'bg-sky-500',
    iconColor: 'text-sky-600',
  },
};

/**
 * Lightweight toast notifications — a friendlier replacement for window.alert().
 * Usage: const toast = useToast(); toast.success('Checked in');
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (variant, message, { title, duration = 5000 } = {}) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((current) => [...current.slice(-2), { id, variant, message, title }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration)
      );
      return id;
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      show: push,
      success: (message, options) => push('success', message, options),
      error: (message, options) => push('error', message, options),
      info: (message, options) => push('info', message, options),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 top-20 z-50 flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-5 sm:items-end sm:px-0"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map(({ id, variant, message, title }) => {
          const style = VARIANTS[variant] ?? VARIANTS.info;
          const Icon = style.icon;

          return (
            <div
              key={id}
              className={`pointer-events-auto flex w-full max-w-sm animate-slide-in-right overflow-hidden rounded-xl border shadow-card ${style.wrap}`}
            >
              <span className={`w-1 shrink-0 ${style.accent}`} aria-hidden="true" />
              <div className="flex flex-1 items-start gap-3 p-3.5">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconColor}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  {title && <p className="text-sm font-semibold text-slate-900">{title}</p>}
                  <p className="break-words text-sm text-slate-600">{message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(id)}
                  className="-m-1 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Dismiss notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
