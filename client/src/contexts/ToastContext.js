import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message, { type = 'info', duration = 2000 } = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => remove(id), duration);
  }, [remove]);

  const getToastStyles = (type) => {
    const baseStyles = {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px 16px',
      borderRadius: '10px',
      boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
      fontSize: '14px',
      fontWeight: '500',
      minWidth: '280px',
      maxWidth: '420px',
      animation: 'slideInRight 0.3s ease-out',
      border: '1px solid',
    };

    const typeStyles = {
      success: {
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        color: '#fff',
        borderColor: 'rgba(255, 255, 255, 0.2)',
      },
      error: {
        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        color: '#fff',
        borderColor: 'rgba(255, 255, 255, 0.2)',
      },
      warning: {
        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        color: '#fff',
        borderColor: 'rgba(255, 255, 255, 0.2)',
      },
      info: {
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        color: '#fff',
        borderColor: 'rgba(255, 255, 255, 0.2)',
      },
    };

    return { ...baseStyles, ...(typeStyles[type] || typeStyles.info) };
  };

  const getIcon = (type) => {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ',
    };
    return icons[type] || icons.info;
  };

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div style={{ 
        position: 'fixed', 
        right: '20px', 
        bottom: '20px', 
        display: 'flex', 
        flexDirection: 'column-reverse', 
        gap: '12px', 
        zIndex: 9999,
        pointerEvents: 'none',
      }}>
        {toasts.map((t) => (
          <div 
            key={t.id} 
            role={t.type === 'error' ? 'alert' : 'status'} 
            aria-live={t.type === 'error' ? 'assertive' : 'polite'}
            style={{ 
              ...getToastStyles(t.type),
              pointerEvents: 'auto',
            }}
          >
            <span style={{ 
              fontSize: '18px', 
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.2)',
            }}>
              {getIcon(t.type)}
            </span>
            <span style={{ flex: 1 }}>{t.message}</span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @media (max-width: 768px) {
          [style*="position: fixed"][style*="right: 20px"][style*="bottom: 20px"] {
            right: 10px !important;
            bottom: 10px !important;
            left: 10px !important;
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
