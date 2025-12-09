import React, { useState, useRef } from 'react';
import './FormComponents.css';

// Custom Input Component
export const Input = ({
    label,
    type = 'text',
    value,
    onChange,
    placeholder,
    required = false,
    error,
    disabled = false,
    id,
    name,
    'aria-describedby': ariaDescribedby,
    className = '',
    ...props
}) => {
    const inputId = id || `input-${name || Math.random().toString(36).substr(2, 9)}`;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
        <div className={`form-field ${className}`}>
            {label && (
                <label htmlFor={inputId} className="form-label">
                    {label}
                    {required && <span className="form-required" aria-label="required">*</span>}
                </label>
            )}
            <input
                id={inputId}
                type={type}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                name={name}
                className={`form-input ${error ? 'form-input-error' : ''}`}
                aria-invalid={error ? 'true' : 'false'}
                aria-describedby={errorId || ariaDescribedby}
                {...props}
            />
            {error && (
                <div id={errorId} className="form-error" role="alert">
                    {error}
                </div>
            )}
        </div>
    );
};

// Custom Select Component
export const Select = ({
    label,
    value,
    onChange,
    options = [],
    placeholder = 'Select an option',
    required = false,
    error,
    disabled = false,
    id,
    name,
    className = '',
    ...props
}) => {
    const selectId = id || `select-${name || Math.random().toString(36).substr(2, 9)}`;
    const errorId = error ? `${selectId}-error` : undefined;

    return (
        <div className={`form-field ${className}`}>
            {label && (
                <label htmlFor={selectId} className="form-label">
                    {label}
                    {required && <span className="form-required" aria-label="required">*</span>}
                </label>
            )}
            <select
                id={selectId}
                value={value}
                onChange={onChange}
                required={required}
                disabled={disabled}
                name={name}
                className={`form-select ${error ? 'form-select-error' : ''}`}
                aria-invalid={error ? 'true' : 'false'}
                aria-describedby={errorId}
                {...props}
            >
                <option value="">{placeholder}</option>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            {error && (
                <div id={errorId} className="form-error" role="alert">
                    {error}
                </div>
            )}
        </div>
    );
};

// Custom MultiSelect Component
export const MultiSelect = ({
    label,
    value = [],
    onChange,
    options = [],
    placeholder = 'Select options',
    required = false,
    error,
    disabled = false,
    id,
    name,
    className = '',
    ...props
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const selectId = id || `multiselect-${name || Math.random().toString(36).substr(2, 9)}`;
    const errorId = error ? `${selectId}-error` : undefined;
    const dropdownId = `${selectId}-dropdown`;
    const searchId = `${selectId}-search`;
    const containerRef = useRef(null);

    // Filter options based on search term
    const filteredOptions = options.filter(option =>
        (option.label || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Handle option toggle
    const handleOptionToggle = (optionValue) => {
        const opt = options.find(o => o.value === optionValue);
        if (opt && opt.disabled) return; // do not allow toggling disabled options
        const newValue = value.includes(optionValue)
            ? value.filter(v => v !== optionValue)
            : [...value, optionValue];
        onChange({ target: { value: newValue, name } });
    };

    // Handle select all
    const handleSelectAll = () => {
        // Only consider non-disabled, filtered options
        const selectable = filteredOptions.filter(opt => !opt.disabled).map(opt => opt.value);
        const allSelected = selectable.length > 0 && selectable.every(val => value.includes(val));

        if (allSelected) {
            // Deselect all selectable filtered options
            const newValue = value.filter(val => !selectable.includes(val));
            onChange({ target: { value: newValue, name } });
        } else {
            // Select all selectable filtered options
            const newValue = [...new Set([...value, ...selectable])];
            onChange({ target: { value: newValue, name } });
        }
    };

    // Handle click outside
    React.useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={`form-field form-multiselect ${className}`} ref={containerRef}>
            {label && (
                <label htmlFor={selectId} className="form-label">
                    {label}
                    {required && <span className="form-required" aria-label="required">*</span>}
                </label>
            )}

            <div className="form-multiselect-container">
                <button
                    type="button"
                    id={selectId}
                    className={`form-multiselect-trigger ${error ? 'form-multiselect-error' : ''}`}
                    onClick={() => setIsOpen(!isOpen)}
                    disabled={disabled}
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    aria-describedby={errorId}
                    {...props}
                >
                    <div className="form-multiselect-content">
                        {value.length === 0 ? (
                            <span className="form-multiselect-placeholder">{placeholder}</span>
                        ) : (
                            <div className="form-multiselect-values">
                                {value.map(val => {
                                    const option = options.find(opt => opt.value === val);
                                    return (
                                        <span key={val} className="form-multiselect-chip">
                                            {option?.label || val}
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                className="form-multiselect-chip-remove"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOptionToggle(val);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleOptionToggle(val);
                                                    }
                                                }}
                                                aria-label={`Remove ${option?.label || val}`}
                                            >
                                                ×
                                            </span>
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <span className="form-multiselect-arrow" aria-hidden="true">
                        {isOpen ? '▲' : '▼'}
                    </span>
                </button>

                {isOpen && (
                    <div
                        id={dropdownId}
                        className="form-multiselect-dropdown"
                        role="listbox"
                        aria-multiselectable="true"
                    >
                        <div className="form-multiselect-search">
                            <input
                                id={searchId}
                                type="text"
                                placeholder="Search options..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="form-multiselect-search-input"
                                aria-label="Search options"
                            />
                        </div>

                        <div className="form-multiselect-options">
                            {filteredOptions.length > 0 && (
                                <button
                                    type="button"
                                    className="form-multiselect-option form-multiselect-select-all"
                                    onClick={handleSelectAll}
                                >
                                    {filteredOptions.filter(opt => !opt.disabled).every(opt => value.includes(opt.value)) && filteredOptions.filter(opt => !opt.disabled).length > 0 ? 'Deselect All' : 'Select All'}
                                </button>
                            )}

                            {filteredOptions.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={`form-multiselect-option ${value.includes(option.value) ? 'form-multiselect-option-selected' : ''} ${option.disabled ? 'form-multiselect-option-disabled' : ''}`}
                                    onClick={() => handleOptionToggle(option.value)}
                                    role="option"
                                    aria-selected={value.includes(option.value)}
                                    aria-disabled={option.disabled ? 'true' : 'false'}
                                    disabled={option.disabled}
                                    title={option.disabled ? 'Limit reached' : undefined}
                                >
                                    <span className="form-multiselect-checkbox" aria-hidden="true">
                                        {value.includes(option.value) ? '✓' : ''}
                                    </span>
                                    {option.label}
                                </button>
                            ))}

                            {filteredOptions.length === 0 && (
                                <div className="form-multiselect-empty">No options found</div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div id={errorId} className="form-error" role="alert">
                    {error}
                </div>
            )}
        </div>
    );
};

// Custom DatePicker Component
export const DatePicker = ({
    label,
    value,
    onChange,
    placeholder = 'Select date',
    required = false,
    error,
    disabled = false,
    id,
    name,
    className = '',
    ...props
}) => {
    const inputId = id || `datepicker-${name || Math.random().toString(36).substr(2, 9)}`;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
        <div className={`form-field ${className}`}>
            {label && (
                <label htmlFor={inputId} className="form-label">
                    {label}
                    {required && <span className="form-required" aria-label="required">*</span>}
                </label>
            )}
            <div className="form-datepicker-container">
                <input
                    id={inputId}
                    type="date"
                    value={value}
                    onChange={onChange}
                    required={required}
                    disabled={disabled}
                    name={name}
                    className={`form-datepicker ${error ? 'form-datepicker-error' : ''}`}
                    aria-invalid={error ? 'true' : 'false'}
                    aria-describedby={errorId}
                    {...props}
                />
                <span className="form-datepicker-icon" aria-hidden="true">📅</span>
            </div>
            {error && (
                <div id={errorId} className="form-error" role="alert">
                    {error}
                </div>
            )}
        </div>
    );
};

// Custom DateTimePicker Component
export const DateTimePicker = ({
    label,
    value,
    onChange,
    placeholder = 'Select date and time',
    required = false,
    error,
    disabled = false,
    id,
    name,
    className = '',
    ...props
}) => {
    const inputId = id || `datetimepicker-${name || Math.random().toString(36).substr(2, 9)}`;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
        <div className={`form-field ${className}`}>
            {label && (
                <label htmlFor={inputId} className="form-label">
                    {label}
                    {required && <span className="form-required" aria-label="required">*</span>}
                </label>
            )}
            <div className="form-datetimepicker-container">
                <input
                    id={inputId}
                    type="datetime-local"
                    value={value}
                    onChange={onChange}
                    required={required}
                    disabled={disabled}
                    name={name}
                    className={`form-datetimepicker ${error ? 'form-datetimepicker-error' : ''}`}
                    aria-invalid={error ? 'true' : 'false'}
                    aria-describedby={errorId}
                    {...props}
                />
                <span className="form-datetimepicker-icon" aria-hidden="true">🕒</span>
            </div>
            {error && (
                <div id={errorId} className="form-error" role="alert">
                    {error}
                </div>
            )}
        </div>
    );
};

// Custom Checkbox Component
export const Checkbox = ({
    label,
    checked,
    onChange,
    disabled = false,
    id,
    name,
    className = '',
    ...props
}) => {
    const checkboxId = id || `checkbox-${name || Math.random().toString(36).substr(2, 9)}`;

    return (
        <div className={`form-field form-checkbox-field ${className}`}>
            <div className="form-checkbox-container">
                <input
                    id={checkboxId}
                    type="checkbox"
                    checked={checked}
                    onChange={onChange}
                    disabled={disabled}
                    name={name}
                    className="form-checkbox"
                    {...props}
                />
                {label && (
                    <label htmlFor={checkboxId} className="form-checkbox-label">
                        {label}
                    </label>
                )}
            </div>
        </div>
    );
};

// Custom TextArea Component
export const TextArea = ({
    label,
    value,
    onChange,
    placeholder,
    required = false,
    error,
    disabled = false,
    rows = 4,
    id,
    name,
    className = '',
    ...props
}) => {
    const textareaId = id || `textarea-${name || Math.random().toString(36).substr(2, 9)}`;
    const errorId = error ? `${textareaId}-error` : undefined;

    return (
        <div className={`form-field ${className}`}>
            {label && (
                <label htmlFor={textareaId} className="form-label">
                    {label}
                    {required && <span className="form-required" aria-label="required">*</span>}
                </label>
            )}
            <textarea
                id={textareaId}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                name={name}
                rows={rows}
                className={`form-textarea ${error ? 'form-textarea-error' : ''}`}
                aria-invalid={error ? 'true' : 'false'}
                aria-describedby={errorId}
                {...props}
            />
            {error && (
                <div id={errorId} className="form-error" role="alert">
                    {error}
                </div>
            )}
        </div>
    );
};
