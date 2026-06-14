import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import roleMessagesAPI from '../services/roleMessages';

const RoleMessagesContext = createContext(null);
const ELEVATED_ROLES = new Set(['SuperAdmin', 'Admin', 'GlobalSupport', 'AdminEvent']);
const SCREEN_ROLE_MAP = {
  'my-account': 'JobSeeker',
  'delete-account': 'JobSeeker',
  'edit-profile': 'JobSeeker',
  'view-profile': 'JobSeeker',
  'upcoming-events': 'JobSeeker',
  'event-registration': 'JobSeeker',
  'registered-events': 'JobSeeker',
  'registered-event-detail': 'JobSeeker',
  survey: 'JobSeeker',
  'resume-builder': 'JobSeeker',
  dashboard: 'Recruiter',
  'meeting-queue': 'Recruiter',
  'meeting-records': 'Recruiter',
  'jobseeker-interests': 'Recruiter',
  'interpreter-dashboard': 'Interpreter',
  troubleshooting: 'Interpreter',
  instructions: 'Interpreter'
};

const normalizeMessages = (payload) => {
  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload)) {
    const messagesMap = {};
    payload.forEach((msg) => {
      if (!msg.screen) return;
      if (!messagesMap[msg.screen]) {
        messagesMap[msg.screen] = {};
      }
      messagesMap[msg.screen][msg.messageKey || 'default'] = msg.content;
    });
    return messagesMap;
  }

  return {};
};

export function RoleMessagesProvider({ children }) {
  const { user } = useAuth();
  const [messagesByRole, setMessagesByRole] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const resolveTargetRole = useCallback((screen, explicitRole) => {
    if (explicitRole) return explicitRole;
    // Prefer the viewer's own role so each role sees its own configured
    // instruction. Fall back to the legacy screen→role map (used for elevated
    // users previewing pages they don't own).
    if (user?.role && messagesByRole[user.role]?.[screen]) return user.role;
    if (SCREEN_ROLE_MAP[screen]) return SCREEN_ROLE_MAP[screen];
    return user?.role || null;
  }, [user?.role, messagesByRole]);

  // Fetch role messages for current user role (and audience roles for elevated users).
  const fetchMessages = useCallback(async () => {
    if (!user?.role) {
      setMessagesByRole({});
      return;
    }

    try {
      setLoading(true);
      setError(null);
      // Always include the viewer's own role so role-specific banners resolve,
      // plus the audience roles elevated users may preview.
      const audienceRoles = ELEVATED_ROLES.has(user.role)
        ? ['JobSeeker', 'Recruiter', 'Interpreter']
        : [];
      const rolesToFetch = Array.from(new Set([...audienceRoles, user.role]));
      const responses = await Promise.all(rolesToFetch.map((role) => roleMessagesAPI.getMessagesByRole(role)));
      const nextMessagesByRole = {};

      rolesToFetch.forEach((role, index) => {
        const response = responses[index];
        nextMessagesByRole[role] = response?.success ? normalizeMessages(response.messages) : {};
      });

      setMessagesByRole(nextMessagesByRole);
    } catch (err) {
      console.error('Error fetching role messages:', err);
      setError(err);
      setMessagesByRole({});
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  // Fetch messages when user role changes
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Get a specific message by screen and messageKey, with optional role override.
  const getMessage = useCallback((screen, messageKey, role = null) => {
    const targetRole = resolveTargetRole(screen, role);
    if (!targetRole) return null;
    const screenMessages = messagesByRole[targetRole]?.[screen];
    if (!screenMessages || typeof screenMessages !== 'object') {
      return null;
    }

    if (messageKey && screenMessages[messageKey]) {
      return screenMessages[messageKey];
    }

    if (screenMessages.default) {
      return screenMessages.default;
    }

    const firstMessage = Object.values(screenMessages)[0];
    return firstMessage || null;
  }, [messagesByRole, resolveTargetRole]);

  // Refresh messages (useful after admin updates)
  const refreshMessages = useCallback(() => {
    fetchMessages();
  }, [fetchMessages]);

  const value = {
    messages: messagesByRole[user?.role] || {},
    messagesByRole,
    loading,
    error,
    getMessage,
    refreshMessages
  };

  return (
    <RoleMessagesContext.Provider value={value}>
      {children}
    </RoleMessagesContext.Provider>
  );
}

export function useRoleMessages() {
  const context = useContext(RoleMessagesContext);
  if (!context) {
    throw new Error('useRoleMessages must be used within a RoleMessagesProvider');
  }
  return context;
}

