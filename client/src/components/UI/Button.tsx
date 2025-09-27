import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

// Types
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'small' | 'medium' | 'large';
    fullWidth?: boolean;
    loading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    children: React.ReactNode;
}

// Button component with accessibility features
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            variant = 'primary',
            size = 'medium',
            fullWidth = false,
            loading = false,
            leftIcon,
            rightIcon,
            children,
            className,
            disabled,
            ...props
        },
        ref
    ) => {
        const baseClasses = [
            'inline-flex',
            'items-center',
            'justify-center',
            'font-semibold',
            'border',
            'border-transparent',
            'rounded-lg',
            'transition-all',
            'duration-200',
            'focus:outline-none',
            'focus:ring-2',
            'focus:ring-offset-2',
            'focus:ring-offset-white',
            'focus:ring-blue-500',
            'disabled:opacity-50',
            'disabled:cursor-not-allowed',
            'disabled:pointer-events-none',
        ];

        const variantClasses = {
            primary: [
                'bg-black',
                'text-white',
                'hover:bg-gray-800',
                'active:bg-gray-900',
                'focus:ring-black',
            ],
            secondary: [
                'bg-white',
                'text-black',
                'border-gray-300',
                'hover:bg-gray-50',
                'active:bg-gray-100',
                'focus:ring-gray-500',
            ],
            danger: [
                'bg-red-600',
                'text-white',
                'hover:bg-red-700',
                'active:bg-red-800',
                'focus:ring-red-500',
            ],
            ghost: [
                'bg-transparent',
                'text-black',
                'hover:bg-gray-100',
                'active:bg-gray-200',
                'focus:ring-gray-500',
            ],
        };

        const sizeClasses = {
            small: ['px-3', 'py-2', 'text-sm', 'min-h-[2.5rem]'],
            medium: ['px-4', 'py-2', 'text-base', 'min-h-[3rem]'],
            large: ['px-6', 'py-3', 'text-lg', 'min-h-[3.5rem]'],
        };

        const classes = clsx(
            baseClasses,
            variantClasses[variant],
            sizeClasses[size],
            fullWidth && 'w-full',
            className
        );

        return (
            <button
                ref={ref}
                className={classes}
                disabled={disabled || loading}
                aria-disabled={disabled || loading}
                {...props}
            >
                {loading && (
                    <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                )}
                {!loading && leftIcon && (
                    <span className="mr-2" aria-hidden="true">
                        {leftIcon}
                    </span>
                )}
                <span>{children}</span>
                {!loading && rightIcon && (
                    <span className="ml-2" aria-hidden="true">
                        {rightIcon}
                    </span>
                )}
            </button>
        );
    }
);

Button.displayName = 'Button';

export default Button;
