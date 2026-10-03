'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { ...toast, id }]);
    if (toast.duration !== 0) {
      setTimeout(() => removeToast(id), toast.duration ?? 4000);
    }
  }, []);
  
  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);
  
  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onClose={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: string) => void }) {
  const colors = {
    success: { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', icon: '' },
    error:   { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', icon: '' },
    warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', icon: '' },
    info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', icon: '' },
  };
  const c = colors[toast.type];
  
  return (
    <div style={{ 
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      padding: '12px 16px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 300, maxWidth: 400,
      animation: 'slideIn 0.3s ease'
    }}>
      <span>{c.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{toast.title}</div>
        {toast.message && <div style={{ fontSize: '.875rem', opacity: 0.9 }}>{toast.message}</div>}
      </div>
      <button onClick={() => onClose(toast.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.text }}>✕</button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}