import { useEffect } from 'react';

/**
 * useModalAriaHidden
 *
 * WCAG 1.3.1 / 2.4.3 — When a modal is open, the background content must be
 * aria-hidden="true" so screen readers cannot navigate outside the modal.
 *
 * Usage:
 *   useModalAriaHidden(isOpen);
 *
 * @param {boolean} isOpen - true when the modal/dialog is visible
 */
const useModalAriaHidden = (isOpen) => {
    useEffect(() => {
        const appRoot = document.getElementById('app-root');
        if (!appRoot) return;

        if (isOpen) {
            appRoot.setAttribute('aria-hidden', 'true');
        } else {
            appRoot.removeAttribute('aria-hidden');
        }

        return () => {
            appRoot.removeAttribute('aria-hidden');
        };
    }, [isOpen]);
};

export default useModalAriaHidden;
