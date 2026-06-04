import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
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
  const { user } = useAuth();
  const { getMessage } = useRoleMessages();
  const targetRole = role || user?.role || null;
  const message = (screen && getMessage(screen, messageKey, targetRole)) || '';

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
