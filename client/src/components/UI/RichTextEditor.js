import React, { useState, useRef, useEffect } from 'react';
import './RichTextEditor.css';

const RichTextEditor = ({
    value = '',
    onChange,
    placeholder = 'Enter text...',
    disabled = false,
    id,
    name,
    className = '',
    'aria-label': ariaLabel = 'Rich text editor',
    ...props
}) => {
    const editorId = id || `rte-${name || Math.random().toString(36).substr(2, 9)}`;
    const editorRef = useRef(null);
    const [isFocused, setIsFocused] = useState(false);

    // Initialize editor content
    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value;
        }
    }, [value]);

    // Handle content change
    const handleInput = () => {
        const content = editorRef.current.innerHTML;
        onChange?.({ target: { value: content, name } });
    };

    // Handle focus
    const handleFocus = () => {
        setIsFocused(true);
    };

    const handleBlur = () => {
        setIsFocused(false);
    };

    // Toolbar actions
    const execCommand = (command, value = null) => {
        document.execCommand(command, false, value);
        editorRef.current.focus();
        handleInput();
    };

    // Check if command is active
    const isCommandActive = (command) => {
        return document.queryCommandState(command);
    };

    // Toolbar buttons
    const toolbarButtons = [
        {
            command: 'bold',
            label: 'Bold',
            icon: 'B',
            shortcut: 'Ctrl+B'
        },
        {
            command: 'italic',
            label: 'Italic',
            icon: 'I',
            shortcut: 'Ctrl+I'
        },
        {
            command: 'underline',
            label: 'Underline',
            icon: 'U',
            shortcut: 'Ctrl+U'
        },
        {
            command: 'strikeThrough',
            label: 'Strikethrough',
            icon: 'S',
            shortcut: 'Ctrl+Shift+S'
        },
        { type: 'separator' },
        {
            command: 'insertUnorderedList',
            label: 'Bullet List',
            icon: '•',
            shortcut: 'Ctrl+Shift+8'
        },
        {
            command: 'insertOrderedList',
            label: 'Numbered List',
            icon: '1.',
            shortcut: 'Ctrl+Shift+7'
        },
        { type: 'separator' },
        {
            command: 'justifyLeft',
            label: 'Align Left',
            icon: '⬅',
            shortcut: 'Ctrl+Shift+L'
        },
        {
            command: 'justifyCenter',
            label: 'Align Center',
            icon: '↔',
            shortcut: 'Ctrl+Shift+E'
        },
        {
            command: 'justifyRight',
            label: 'Align Right',
            icon: '➡',
            shortcut: 'Ctrl+Shift+R'
        },
        { type: 'separator' },
        {
            command: 'removeFormat',
            label: 'Clear Formatting',
            icon: '⌫',
            shortcut: 'Ctrl+Space'
        }
    ];

    return (
        <div className={`rich-text-editor ${className} ${isFocused ? 'rich-text-editor-focused' : ''}`}>
            {/* Toolbar */}
            <div className="rich-text-toolbar" role="toolbar" aria-label="Text formatting">
                {toolbarButtons.map((button, index) => {
                    if (button.type === 'separator') {
                        return <div key={index} className="rich-text-separator" aria-hidden="true" />;
                    }

                    const isActive = isCommandActive(button.command);

                    return (
                        <button
                            key={button.command}
                            type="button"
                            className={`rich-text-button ${isActive ? 'rich-text-button-active' : ''}`}
                            onClick={() => execCommand(button.command)}
                            disabled={disabled}
                            aria-label={`${button.label} (${button.shortcut})`}
                            title={`${button.label} (${button.shortcut})`}
                        >
                            <span className="rich-text-button-icon" aria-hidden="true">
                                {button.icon}
                            </span>
                            <span className="sr-only">{button.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Editor */}
            <div className="rich-text-editor-container">
                <div
                    ref={editorRef}
                    id={editorId}
                    className={`rich-text-content ${disabled ? 'rich-text-content-disabled' : ''}`}
                    contentEditable={!disabled}
                    onInput={handleInput}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    aria-label={ariaLabel}
                    role="textbox"
                    aria-multiline="true"
                    tabIndex={0}
                    data-placeholder={placeholder}
                    suppressContentEditableWarning={true}
                    {...props}
                />
            </div>

            {/* Character count */}
            <div className="rich-text-footer">
                <div className="rich-text-stats">
                    <span className="rich-text-char-count">
                        {editorRef.current?.textContent?.length || 0} characters
                    </span>
                </div>
            </div>
        </div>
    );
};

export default RichTextEditor;
