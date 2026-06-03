import { getSyncfusionMultiSelectA11yHandlers } from './syncfusionMultiSelectA11y';

describe('getSyncfusionMultiSelectA11yHandlers', () => {
  const mountMultiSelect = (inputId) => {
    const root = document.createElement('div');
    // Mirrors Syncfusion's rendered structure: a hidden original input that
    // keeps our id, plus the visible combobox input the screen reader uses.
    root.innerHTML = `
      <div class="e-multiselect e-input-group">
        <div class="e-searcher">
          <input
            class="e-dropdownbase"
            role="combobox"
            aria-label="multiselect"
            aria-describedby="chip_collection"
          />
          <input id="${inputId}" type="text" style="display:none" />
        </div>
      </div>
    `;
    document.body.appendChild(root);
    return root;
  };

  afterEach(() => {
    document.body.innerHTML = '';
    jest.useRealTimers();
  });

  test('removes generic aria-label and labels the visible combobox on focus', () => {
    mountMultiSelect('field');
    const handlers = getSyncfusionMultiSelectA11yHandlers({
      inputId: 'field',
      labelId: 'field-label',
      instructionsId: 'field-instructions',
      listboxLabel: 'Field options',
    });

    handlers.focus();

    const combobox = document.querySelector('input.e-dropdownbase');
    expect(combobox.getAttribute('aria-label')).toBeNull();
    expect(combobox.getAttribute('aria-labelledby')).toBe('field-label');
  });

  test('prepends the instruction id while keeping the chip collection description', () => {
    mountMultiSelect('field');
    const handlers = getSyncfusionMultiSelectA11yHandlers({
      inputId: 'field',
      labelId: 'field-label',
      instructionsId: 'field-instructions',
      listboxLabel: 'Field options',
    });

    handlers.focus();

    const combobox = document.querySelector('input.e-dropdownbase');
    expect(combobox.getAttribute('aria-describedby')).toBe('field-instructions chip_collection');
  });

  test('runs the combobox fix asynchronously on created', () => {
    jest.useFakeTimers();
    mountMultiSelect('field');
    const handlers = getSyncfusionMultiSelectA11yHandlers({
      inputId: 'field',
      labelId: 'field-label',
      instructionsId: 'field-instructions',
      listboxLabel: 'Field options',
    });

    handlers.created();
    jest.runAllTimers();

    const combobox = document.querySelector('input.e-dropdownbase');
    expect(combobox.getAttribute('aria-labelledby')).toBe('field-label');
  });

  test('sets an accurate aria-label on the popup listbox when opened', () => {
    mountMultiSelect('field');
    const popup = document.createElement('div');
    popup.innerHTML = '<ul role="listbox" aria-label="list"></ul>';

    const handlers = getSyncfusionMultiSelectA11yHandlers({
      inputId: 'field',
      labelId: 'field-label',
      instructionsId: 'field-instructions',
      listboxLabel: 'Employment Types options',
    });

    handlers.open({ popup: { element: popup } });

    const listbox = popup.querySelector('[role="listbox"]');
    expect(listbox.getAttribute('aria-label')).toBe('Employment Types options');
  });
});
