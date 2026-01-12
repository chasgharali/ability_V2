// Helper functions for bulk delete functionality across grid components

/**
 * Handle row selection in Syncfusion grid
 * @param {Object} gridRef - Reference to the grid component
 * @param {Function} setSelectedItems - State setter for selected items
 */
export const handleRowSelected = (gridRef, setSelectedItems) => {
  if (gridRef.current) {
    const selectedRecords = gridRef.current.getSelectedRecords();
    const selectedIds = selectedRecords.map(record => record.id || record._id);
    setSelectedItems(selectedIds);
  }
};

/**
 * Select all rows in the grid
 * @param {Object} gridRef - Reference to the grid component
 */
export const handleSelectAll = (gridRef) => {
  if (gridRef.current) {
    gridRef.current.selectRows(Array.from({ length: gridRef.current.currentViewData.length }, (_, i) => i));
  }
};

/**
 * Deselect all rows in the grid
 * @param {Object} gridRef - Reference to the grid component
 */
export const handleDeselectAll = (gridRef) => {
  if (gridRef.current) {
    gridRef.current.clearSelection();
  }
};
