import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'audio[controls]',
    'video[controls]',
    '[tabindex]:not([tabindex="-1"])'
].join(', ');

/**
 * useDialogFocus
 *
 * WCAG 2.4.3 (Focus Order) / 4.1.2 (Name, Role, Value):
 * When a modal dialog opens, focus must move into it so keyboard users land on
 * the dialog and screen readers announce its name (via role="dialog" +
 * aria-labelledby on the focused container). Focus is trapped while open and
 * restored to the triggering element when the dialog closes.
 *
 * Usage:
 *   const { dialogRef, onKeyDown } = useDialogFocus(isOpen, onClose);
 *   <div role="dialog" aria-modal="true" aria-labelledby="title-id"
 *        ref={dialogRef} tabIndex={-1} onKeyDown={onKeyDown}>
 *
 * @param {boolean} isOpen  - true when the dialog is visible
 * @param {Function} [onClose] - optional; called when Escape is pressed
 */
export default function useDialogFocus(isOpen, onClose) {
    const dialogRef = useRef(null);
    const previousFocusRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;

        previousFocusRef.current = document.activeElement;

        // Wait for the dialog to render before moving focus so screen readers
        // announce the dialog's accessible name as focus lands on the container.
        const frameId = requestAnimationFrame(() => {
            if (dialogRef.current) {
                dialogRef.current.focus();
            }
        });

        return () => {
            cancelAnimationFrame(frameId);
            const previous = previousFocusRef.current;
            if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
                previous.focus();
            }
            previousFocusRef.current = null;
        };
    }, [isOpen]);

    const onKeyDown = (event) => {
        if (event.key === 'Escape' && typeof onClose === 'function') {
            onClose();
            return;
        }

        if (event.key !== 'Tab' || !dialogRef.current) return;

        const focusable = dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) {
            // Nothing focusable inside; keep focus on the dialog container.
            event.preventDefault();
            dialogRef.current.focus();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
            if (active === first || active === dialogRef.current) {
                event.preventDefault();
                last.focus();
            }
        } else if (active === last) {
            event.preventDefault();
            first.focus();
        }
    };

    return { dialogRef, onKeyDown };
}
