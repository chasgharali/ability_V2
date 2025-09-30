import React from 'react';

// Accessible, reusable Close Button
// Props:
// - ariaLabel: string (defaults to 'Close')
// - onClick: function
// - className: additional classes
// - title: tooltip text
// - size: 'sm' | 'md' (defaults to 'md')
// - ref forwarding supported to manage focus
const CloseButton = React.forwardRef(function CloseButton(
  { ariaLabel = 'Close', onClick, className = '', title, size = 'md', ...props },
  ref
) {
  const sizeClass = size === 'sm' ? 'close-button-sm' : 'close-button-md';
  return (
    <button
      type="button"
      ref={ref}
      onClick={onClick}
      className={`close-button ${sizeClass} ${className}`}
      aria-label={ariaLabel}
      title={title || ariaLabel}
      {...props}
    >
      <span aria-hidden="true" className="close-icon"/>
    </button>
  );
});

export default CloseButton;
