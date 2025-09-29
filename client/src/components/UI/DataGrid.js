import React, { useState, useMemo, useRef, useEffect } from 'react';
import './DataGrid.css';

const DataGrid = ({
    data = [],
    columns = [],
    onRowSelect,
    onRowClick,
    selectable = true,
    searchable = true,
    sortable = true,
    className = '',
    'aria-label': ariaLabel = 'Data table'
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [selectedRows, setSelectedRows] = useState(new Set());
    const [visibleColumns, setVisibleColumns] = useState(
        new Set(columns.map(col => col.key))
    );
    const [showColumnChooser, setShowColumnChooser] = useState(false);
    const columnChooserRef = useRef(null);

    // Filter and sort data
    const processedData = useMemo(() => {
        let filtered = data;

        // Apply search filter
        if (searchTerm && searchable) {
            filtered = data.filter(row =>
                columns.some(col => {
                    const value = row[col.key];
                    return value && value.toString().toLowerCase().includes(searchTerm.toLowerCase());
                })
            );
        }

        // Apply sorting
        if (sortConfig.key && sortable) {
            filtered = [...filtered].sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return filtered;
    }, [data, searchTerm, sortConfig, columns, searchable, sortable]);

    // Handle sorting
    const handleSort = (key) => {
        if (!sortable) return;

        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Handle row selection
    const handleRowSelect = (rowId, isSelected) => {
        const newSelected = new Set(selectedRows);
        if (isSelected) {
            newSelected.add(rowId);
        } else {
            newSelected.delete(rowId);
        }
        setSelectedRows(newSelected);
        onRowSelect?.(Array.from(newSelected));
    };

    // Handle select all
    const handleSelectAll = (isSelected) => {
        if (isSelected) {
            const allIds = new Set(processedData.map(row => row.id));
            setSelectedRows(allIds);
            onRowSelect?.(Array.from(allIds));
        } else {
            setSelectedRows(new Set());
            onRowSelect?.([]);
        }
    };

    // Handle column visibility toggle
    const handleColumnToggle = (columnKey) => {
        const newVisibleColumns = new Set(visibleColumns);
        if (newVisibleColumns.has(columnKey)) {
            newVisibleColumns.delete(columnKey);
        } else {
            newVisibleColumns.add(columnKey);
        }
        setVisibleColumns(newVisibleColumns);
    };

    // Handle select all columns
    const handleSelectAllColumns = () => {
        const allColumnKeys = new Set(columns.map(col => col.key));
        const allSelected = columns.every(col => visibleColumns.has(col.key));

        if (allSelected) {
            setVisibleColumns(new Set());
        } else {
            setVisibleColumns(allColumnKeys);
        }
    };

    // Handle click outside to close column chooser
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (columnChooserRef.current && !columnChooserRef.current.contains(event.target)) {
                setShowColumnChooser(false);
            }
        };

        if (showColumnChooser) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showColumnChooser]);

    // Get visible columns
    const visibleColumnsData = columns.filter(col => visibleColumns.has(col.key));

    return (
        <div className={`data-grid ${className}`} role="region" aria-label={ariaLabel}>
            {/* Toolbar */}
            <div className="data-grid-toolbar" role="toolbar" aria-label="Table controls">
                {searchable && (
                    <div className="data-grid-search">
                        <label htmlFor="data-grid-search-input" className="sr-only">
                            Search table
                        </label>
                        <input
                            id="data-grid-search-input"
                            type="text"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="data-grid-search-input"
                            aria-describedby="search-help"
                        />
                        <span id="search-help" className="sr-only">
                            Search through all columns in the table
                        </span>
                    </div>
                )}

                {/* Column controls hidden for now */}
                {/* <div className="data-grid-controls">
          <button
            type="button"
            className="data-grid-button"
            onClick={() => {
              console.log('Columns button clicked, current state:', showColumnChooser);
              setShowColumnChooser(!showColumnChooser);
            }}
            aria-label="Manage column visibility"
            aria-expanded={showColumnChooser}
            aria-haspopup="dialog"
          >
            Columns
            <span className="data-grid-button-icon" aria-hidden="true">
              {showColumnChooser ? '▲' : '▼'}
            </span>
          </button>
        </div> */}
            </div>

            {/* Column Chooser - Hidden for now */}
            {/* {showColumnChooser && console.log('Rendering column chooser') && (
        <div 
          ref={columnChooserRef}
          className="data-grid-column-chooser" 
          role="dialog" 
          aria-label="Column visibility settings"
          style={{ display: 'block' }}
        >
          <div className="data-grid-column-chooser-header">
            <h3>Choose Columns</h3>
            <button
              type="button"
              className="data-grid-column-chooser-close"
              onClick={() => setShowColumnChooser(false)}
              aria-label="Close column chooser"
            >
              ×
            </button>
          </div>
          <div className="data-grid-column-chooser-content">
            <button
              type="button"
              className="data-grid-column-chooser-select-all"
              onClick={handleSelectAllColumns}
            >
              {columns.every(col => visibleColumns.has(col.key)) ? 'Deselect All' : 'Select All'}
            </button>
            <div className="data-grid-column-chooser-list">
              {columns.map((column) => (
                <label
                  key={column.key}
                  className="data-grid-column-chooser-item"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns.has(column.key)}
                    onChange={() => handleColumnToggle(column.key)}
                    className="data-grid-column-chooser-checkbox"
                  />
                  <span className="data-grid-column-chooser-label">
                    {column.title}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="data-grid-column-chooser-footer">
            <button
              type="button"
              className="data-grid-button data-grid-button-primary"
              onClick={() => setShowColumnChooser(false)}
            >
              OK
            </button>
            <button
              type="button"
              className="data-grid-button"
              onClick={() => setShowColumnChooser(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )} */}

            {/* Table */}
            <div className="data-grid-table-container" role="region" aria-label="Table content">
                <table
                    className="data-grid-table"
                    role="table"
                    aria-label={ariaLabel}
                >
                    <thead>
                        <tr role="row">
                            {selectable && (
                                <th
                                    role="columnheader"
                                    scope="col"
                                    className="data-grid-header data-grid-checkbox-header"
                                    aria-label="Select all rows"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedRows.size === processedData.length && processedData.length > 0}
                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                        aria-label="Select all rows"
                                        className="data-grid-checkbox"
                                    />
                                </th>
                            )}
                            {visibleColumnsData.map((column) => (
                                <th
                                    key={column.key}
                                    role="columnheader"
                                    scope="col"
                                    className={`data-grid-header ${sortable ? 'data-grid-sortable' : ''}`}
                                    onClick={() => sortable && handleSort(column.key)}
                                    tabIndex={sortable ? 0 : -1}
                                    onKeyDown={(e) => {
                                        if (sortable && (e.key === 'Enter' || e.key === ' ')) {
                                            e.preventDefault();
                                            handleSort(column.key);
                                        }
                                    }}
                                    aria-sort={
                                        sortConfig.key === column.key
                                            ? sortConfig.direction === 'asc' ? 'ascending' : 'descending'
                                            : 'none'
                                    }
                                >
                                    <span className="data-grid-header-content">
                                        {column.title}
                                        {sortable && (
                                            <span className="data-grid-sort-indicator" aria-hidden="true">
                                                {sortConfig.key === column.key
                                                    ? sortConfig.direction === 'asc' ? '↑' : '↓'
                                                    : '↕'}
                                            </span>
                                        )}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {processedData.length === 0 ? (
                            <tr role="row">
                                <td
                                    colSpan={visibleColumnsData.length + (selectable ? 1 : 0)}
                                    className="data-grid-empty"
                                    role="cell"
                                >
                                    No data available
                                </td>
                            </tr>
                        ) : (
                            processedData.map((row, index) => (
                                <tr
                                    key={row.id || index}
                                    role="row"
                                    className={`data-grid-row ${selectedRows.has(row.id) ? 'data-grid-row-selected' : ''}`}
                                    onClick={() => onRowClick?.(row)}
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            onRowClick?.(row);
                                        }
                                    }}
                                    aria-selected={selectedRows.has(row.id)}
                                >
                                    {selectable && (
                                        <td role="cell" className="data-grid-cell data-grid-checkbox-cell">
                                            <input
                                                type="checkbox"
                                                checked={selectedRows.has(row.id)}
                                                onChange={(e) => handleRowSelect(row.id, e.target.checked)}
                                                aria-label={`Select row ${index + 1}`}
                                                className="data-grid-checkbox"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </td>
                                    )}
                                    {visibleColumnsData.map((column) => (
                                        <td
                                            key={column.key}
                                            role="cell"
                                            className="data-grid-cell"
                                            data-label={column.title}
                                        >
                                            {column.render ? column.render(row[column.key], row) : row[column.key]}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div className="data-grid-footer" role="region" aria-label="Table information">
                <div className="data-grid-info">
                    Showing {processedData.length} of {data.length} rows
                </div>
            </div>
        </div>
    );
};

export default DataGrid;
