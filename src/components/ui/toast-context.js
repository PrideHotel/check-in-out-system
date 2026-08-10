import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

/** Access the toast API from anywhere under <ToastProvider>. */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a <ToastProvider>');
  }
  return context;
}
