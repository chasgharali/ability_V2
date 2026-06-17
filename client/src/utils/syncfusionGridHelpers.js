const POPUP_SELECTOR = '.e-grid-popup, .e-ccdlg, .e-columnmenu';
const FILTER_UI_ID_PREFIX = /^(strui|multiselectstrui|numberui|dateui|bool-ui)-/;
const FILTER_MENU_ID_SUFFIX = /-flmenu$/;

export const SYNC_GRID_FILTER_SETTINGS = {
  type: 'Menu',
  showFilterBarStatus: true,
  immediateModeDelay: 0,
  showFilterBarOperator: true,
  enableCaseSensitivity: false,
};

export const SYNC_GRID_CHECKBOX_COLUMN_PROPS = {
  type: 'checkbox',
  width: '50',
  freeze: 'Left',
  allowSorting: false,
  allowFiltering: false,
  showInColumnChooser: false,
};

function isProtectedSyncfusionFieldId(id) {
  return FILTER_UI_ID_PREFIX.test(id) || FILTER_MENU_ID_SUFFIX.test(id);
}

function resolveGridElement(gridRef) {
  if (!gridRef) return null;
  if (gridRef.current?.element) return gridRef.current.element;
  if (gridRef.element) return gridRef.element;
  return null;
}

/**
 * Adds stable name attributes to grid form fields for a11y audits.
 * Never strips Syncfusion filter-popup IDs — those are required for ej2_instances lookups.
 */
export function normalizeSyncfusionGridFormFields(gridRef, namePrefix = 'grid-field') {
  const gridEl = resolveGridElement(gridRef);
  const scopes = [gridEl, ...document.querySelectorAll(POPUP_SELECTOR)].filter(Boolean);
  const seen = new Set();

  scopes.forEach((scope) => {
    if (scope.classList?.contains('e-filter-popup')) {
      return;
    }

    scope.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.id) {
        if (isProtectedSyncfusionFieldId(el.id)) {
          return;
        }
        if (seen.has(el.id)) {
          el.id = `${el.id}-dedup-${Math.random().toString(36).slice(2, 7)}`;
        } else {
          seen.add(el.id);
        }
      }
      if (!el.id && !el.getAttribute('name')) {
        el.setAttribute('name', `${namePrefix}-${Math.random().toString(36).slice(2, 9)}`);
      }
    });
  });
}

export function observeSyncfusionGridPopups(normalizeFn) {
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((m) =>
      Array.from(m.addedNodes).some(
        (n) => n.nodeType === 1 &&
          (n.matches?.(`${POPUP_SELECTOR}, .e-filter-popup`) ||
            n.querySelector?.(`${POPUP_SELECTOR}, .e-filter-popup`))
      )
    );
    if (relevant) {
      requestAnimationFrame(normalizeFn);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

export function labelsToFilterText(values, separator = ', ') {
  if (!values) return '';
  if (Array.isArray(values)) {
    return values.filter(Boolean).join(separator);
  }
  return String(values);
}
