import React, { useState, useEffect } from 'react';
import { FaCheck, FaTimes, FaExclamationTriangle, FaInfoCircle } from 'react-icons/fa';
import './Toast.css';

export default function Toast({ message, type = 'success', duration = 3000, onClose }) {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [announced, setAnnounced] = useState(false);

  // Announce to screen readers when toast appears
  useEffect(() => {
    if (isVisible && !announced) {
      // Create a temporary element for screen reader announcement
      const announcement = document.createElement('div');
      announcement.setAttribute('aria-live', 'assertive');
      announcement.setAttribute('aria-atomic', 'true');
      announcement.className = 'sr-only';
      announcement.textContent = `${type} notification: ${message}`;
      document.body.appendChild(announcement);
      
      // Remove after announcement
      setTimeout(() => {
        if (document.body.contains(announcement)) {
          document.body.removeChild(announcement);
        }
      }, 1000);
      
      setAnnounced(true);
    }
  }, [isVisible, announced, message, type]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => {
        setIsVisible(false);
        onClose && onClose();
      }, 300); // Match exit animation duration
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <FaCheck className="toast-icon" />;
      case 'error':
        return <FaTimes className="toast-icon" />;
      case 'warning':
        return <FaExclamationTriangle className="toast-icon" />;
      case 'info':
        return <FaInfoCircle className="toast-icon" />;
      default:
        return <FaCheck className="toast-icon" />;
    }
  };

  if (!isVisible) return null;

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose && onClose();
    }, 300);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      handleClose();
    }
  };

  return (
    <div 
      className={`toast toast-${type} ${isExiting ? 'toast-exit' : 'toast-enter'}`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      aria-describedby={`toast-message-${type}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="toast-content">
        <div className="toast-icon-wrapper" aria-hidden="true">
          {getIcon()}
        </div>
        <span 
          id={`toast-message-${type}`}
          className="toast-message"
          role="status"
        >
          {message}
        </span>
      </div>
      <button
        className="toast-close"
        onClick={handleClose}
        aria-label={`Close ${type} notification: ${message}`}
        title="Close notification (Press Escape)"
        type="button"
      >
        <FaTimes aria-hidden="true" />
        <span className="sr-only">Close</span>
      </button>
    </div>
  );
}

// Toast Container Component
export function ToastContainer({ toasts, removeToast }) {
  return (
    <div 
      className="toast-container"
      aria-label="Notifications"
      role="region"
      aria-live="polite"
      aria-relevant="additions removals"
    >
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

// Hook for managing toasts
export function useToast() {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success', duration = 3000) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, type, duration };
    setToasts(prev => [...prev, toast]);
    return id;
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const showSuccess = (message, duration) => addToast(message, 'success', duration);
  const showError = (message, duration) => addToast(message, 'error', duration);
  const showWarning = (message, duration) => addToast(message, 'warning', duration);
  const showInfo = (message, duration) => addToast(message, 'info', duration);

  return {
    toasts,
    addToast,
    removeToast,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };
}
