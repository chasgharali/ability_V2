import React from 'react';
import { useRoleMessages } from '../../contexts/RoleMessagesContext';

/**
 * Renders the page instruction banner for the current user's role on a given screen.
 * Resolves the message against the viewer's role so each role (Admin, Support,
 * GlobalSupport, GlobalInterpreter, etc.) sees its own configured instruction.
 * Renders nothing when no instruction is configured for that role + screen.
 */
export default function PageInstructionBanner({
  screen,
  messageKey = 'info-banner',
  role = null,
  className = '',
  style = {}
}) {
  const { getMessage } = useRoleMessages();
  const message = (screen && getMessage(screen, messageKey, role)) || '';

  if (!message) return null;

  return (
    <div
      className={`info-banner ${className}`.trim()}
      style={{ marginBottom: '1.5rem', ...style }}
    >
      <span>{message}</span>
    </div>
  );
}
