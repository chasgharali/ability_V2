/**
 * Syncfusion MultiSelect sets aria-label="list" on the popup listbox and may add
 * aria-label on the combobox input, which conflicts with aria-labelledby and hides
 * multi-select instructions from screen readers.
 */
export function getSyncfusionMultiSelectA11yHandlers({ instructionsId, listboxLabel } = {}) {
  const applyInputA11y = (element) => {
    if (!element) return;

    const input = element.querySelector('.e-searcher input, input[role="combobox"]');
    if (!input) return;

    input.removeAttribute('aria-label');

    if (instructionsId) {
      const describedByIds = (input.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter(Boolean);

      if (!describedByIds.includes(instructionsId)) {
        describedByIds.push(instructionsId);
        input.setAttribute('aria-describedby', describedByIds.join(' '));
      }
    }
  };

  const applyListboxA11y = (popupElement) => {
    if (!popupElement || !listboxLabel) return;

    const listbox = popupElement.querySelector('[role="listbox"]') || popupElement;
    if (listbox) {
      listbox.setAttribute('aria-label', listboxLabel);
    }
  };

  return {
    created: (args) => {
      applyInputA11y(args?.element);
    },
    open: (args) => {
      applyInputA11y(args?.element);
      applyListboxA11y(args?.popup?.element);
    },
  };
}
