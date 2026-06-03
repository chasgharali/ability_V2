/**
 * Accessibility fixes for Syncfusion MultiSelect editable comboboxes.
 *
 * Syncfusion renders a hidden original <input> (which receives aria-labelledby /
 * aria-describedby props) and a separate VISIBLE combobox input
 * (`input.e-dropdownbase[role="combobox"]`) that the screen reader actually
 * interacts with. That visible input only gets aria-label="multiselect" and an
 * aria-describedby pointing at the internal chip collection, so the real label
 * and our multi-select instructions are never announced. It also labels the
 * popup listbox with a generic "list".
 *
 * These handlers reapply the correct ARIA directly on the visible combobox and
 * listbox after Syncfusion has finished its own setup.
 */
export function getSyncfusionMultiSelectA11yHandlers({
  inputId,
  labelId,
  instructionsId,
  listboxLabel,
} = {}) {
  const getCombobox = () => {
    if (!inputId) return null;
    const original = document.getElementById(inputId);
    const wrapper = original ? original.closest('.e-multiselect') : null;
    if (!wrapper) return null;
    return wrapper.querySelector('input.e-dropdownbase, input[role="combobox"]');
  };

  const fixCombobox = () => {
    const combobox = getCombobox();
    if (!combobox) return;

    // Syncfusion defaults the accessible name to "multiselect"; drop it so the
    // visible field label (via aria-labelledby) provides the name instead.
    combobox.removeAttribute('aria-label');

    if (labelId) {
      combobox.setAttribute('aria-labelledby', labelId);
    }

    // Syncfusion points aria-describedby at the chip collection (announces the
    // current selection). Keep that and prepend our multi-select instructions.
    const describedByIds = (combobox.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter(Boolean);

    if (instructionsId && !describedByIds.includes(instructionsId)) {
      describedByIds.unshift(instructionsId);
    }

    if (describedByIds.length) {
      combobox.setAttribute('aria-describedby', describedByIds.join(' '));
    }
  };

  const fixListbox = (popupElement) => {
    if (!listboxLabel) return;
    const root = popupElement || document;
    const listbox = root.querySelector('[role="listbox"]');
    if (listbox) {
      listbox.setAttribute('aria-label', listboxLabel);
    }
  };

  return {
    created: () => {
      // Defer so the fix runs after Syncfusion finishes wiring its own ARIA.
      setTimeout(fixCombobox, 0);
    },
    focus: () => {
      fixCombobox();
    },
    open: (args) => {
      fixCombobox();
      fixListbox(args && args.popup && args.popup.element);
    },
  };
}
