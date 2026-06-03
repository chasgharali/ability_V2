import { getSyncfusionMultiSelectA11yHandlers } from './syncfusionMultiSelectA11y';

describe('getSyncfusionMultiSelectA11yHandlers', () => {
  const buildMultiSelectElement = () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="e-multiselect">
        <span class="e-searcher">
          <input type="text" aria-label="list" aria-labelledby="field-label" />
        </span>
      </div>
    `;
    return root.firstElementChild;
  };

  test('removes aria-label from combobox input and wires aria-describedby on created', () => {
    const element = buildMultiSelectElement();
    const input = element.querySelector('input');
    const handlers = getSyncfusionMultiSelectA11yHandlers({
      instructionsId: 'field-instructions',
      listboxLabel: 'Field options',
    });

    handlers.created({ element });

    expect(input.getAttribute('aria-label')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBe('field-instructions');
  });

  test('sets an accurate aria-label on the popup listbox when opened', () => {
    const element = buildMultiSelectElement();
    const popup = document.createElement('div');
    popup.innerHTML = '<div role="listbox" aria-label="list"></div>';

    const handlers = getSyncfusionMultiSelectA11yHandlers({
      instructionsId: 'field-instructions',
      listboxLabel: 'Employment Types options',
    });

    handlers.open({
      element,
      popup: { element: popup },
    });

    const listbox = popup.querySelector('[role="listbox"]');
    expect(listbox.getAttribute('aria-label')).toBe('Employment Types options');
  });
});
