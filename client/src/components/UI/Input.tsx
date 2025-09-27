import React, { forwardRef, InputHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

// Types
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string;
    error?: string;
    helperText?: string;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    fullWidth?: boolean;
    required?: boolean;
}

// Input component with accessibility features
const Input = forwardRef<HTMLInputElement, InputProps>(
    (
        {
            label,
            error,
            helperText,
            leftIcon,
            rightIcon,
            fullWidth = false,
            required = false,
            className,
            id,
            ...props
        },
        ref
    ) => {
        const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
        const errorId = error ? `${inputId}-error` : undefined;
        const helperId = helperText ? `${inputId}-helper` : undefined;
        const describedBy = [errorId, helperId].filter(Boolean).join(' ');

        const baseClasses = [
            'block',
            'w-full',
            'px-3',
            'py-2',
            'text-base',
            'border',
            'rounded-lg',
            'transition-colors',
            'duration-200',
            'focus:outline-none',
            'focus:ring-2',
            'focus:ring-offset-2',
            'focus:ring-offset-white',
            'focus:ring-blue-500',
            'disabled:opacity-50',
            'disabled:cursor-not-allowed',
            'disabled:bg-gray-50',
        ];

        const stateClasses = error
            ? [
                'border-red-300',
                'text-red-900',
                'placeholder-red-300',
                'focus:border-red-500',
                'focus:ring-red-500',
            ]
            : [
                'border-gray-300',
                'text-gray-900',
                'placeholder-gray-400',
                'focus:border-blue-500',
                'focus:ring-blue-500',
            ];

        const inputClasses = clsx(
            baseClasses,
            stateClasses,
            leftIcon && 'pl-10',
            rightIcon && 'pr-10',
            fullWidth && 'w-full',
            className
        );

        return (
            <div className={clsx('space-y-1', fullWidth && 'w-full')}>
                <label
                    htmlFor={inputId}
                    className="block text-sm font-medium text-gray-700"
                >
                    {label}
                    {required && (
                        <span className="text-red-500 ml-1" aria-label="required">
                            *
                        </span>
                    )}
                </label>

                <div className="relative">
                    {leftIcon && (
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-gray-400" aria-hidden="true">
                                {leftIcon}
                            </span>
                        </div>
                    )}

                    <input
                        ref={ref}
                        id={inputId}
                        className={inputClasses}
                        aria-invalid={error ? 'true' : 'false'}
                        aria-describedby={describedBy || undefined}
                        required={required}
                        {...props}
                    />

                    {rightIcon && (
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <span className="text-gray-400" aria-hidden="true">
                                {rightIcon}
                            </span>
                        </div>
                    )}
                </div>

                {error && (
                    <p id={errorId} className="text-sm text-red-600" role="alert">
                        {error}
                    </p>
                )}

                {helperText && !error && (
                    <p id={helperId} className="text-sm text-gray-500">
                        {helperText}
                    </p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';

export default Input;
