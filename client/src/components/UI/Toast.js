import React from 'react';

/**
 * Toast - Accessible, reusable toast component.
 *
 * Props:
 * - message: string | ReactNode
 * - type: 'success' | 'info' | 'error'
 * - onClose: () => void
 * - autoFocusClose: boolean (focus close button on mount; recommended for errors)
 * - duration: number (ms) - optional, for external timers; component itself doesn't auto-dismiss
 */
export default function Toast({ message, type = 'info', onClose, autoFocusClose = false }) {
  const closeRef = React.useRef(null);

  React.useEffect(() => {
    if (autoFocusClose && type === 'error') {
      const id = setTimeout(() => {
        try { closeRef.current && closeRef.current.focus(); } catch {}
      }, 0);
      return () => clearTimeout(id);
    }
  }, [autoFocusClose, type]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const role = type === 'error' ? 'alert' : 'status';
  const ariaLive = type === 'error' ? 'assertive' : 'polite';
  const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';

  return (
    <div className={`toast ${type}`} role={role} aria-live={ariaLive} aria-atomic="true" style={{ maxWidth: 440 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, whiteSpace: 'pre-line' }}>
        <span className="toast-icon" aria-hidden="true" style={{ fontSize: 18, lineHeight: '18px', marginTop: 2 }}>{icon}</span>
        <div style={{ flex: 1 }}>{message}</div>
        <button
          onClick={onClose}
          className="toast-close"
          aria-label="Dismiss notification"
          ref={closeRef}
          title="Close"
        >
          <span aria-hidden>✕</span>
        </button>
      </div>
    </div>
  );
}
