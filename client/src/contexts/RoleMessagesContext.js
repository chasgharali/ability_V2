import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import roleMessagesAPI from '../services/roleMessages';

const RoleMessagesContext = createContext(null);

export function RoleMessagesProvider({ children }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch all role messages for the current user's role
  const fetchMessages = useCallback(async () => {
    if (!user?.role) {
      setMessages({});
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await roleMessagesAPI.getMessagesByRole(user.role);
      if (response.success && response.messages) {
        // The server's getMessages returns a nested object: { screen: { messageKey: content } }
        // So response.messages is already in the correct format
        if (typeof response.messages === 'object' && !Array.isArray(response.messages)) {
          // Already in nested object format: { screen: { messageKey: content } }
          setMessages(response.messages);
        } else if (Array.isArray(response.messages)) {
          // If it's an array, convert to nested object structure
          const messagesMap = {};
          response.messages.forEach(msg => {
            if (msg.screen && msg.messageKey) {
              if (!messagesMap[msg.screen]) {
                messagesMap[msg.screen] = {};
              }
              messagesMap[msg.screen][msg.messageKey] = msg.content;
            }
          });
          setMessages(messagesMap);
        } else {
          setMessages({});
        }
      } else {
        setMessages({});
      }
    } catch (err) {
      console.error('Error fetching role messages:', err);
      setError(err);
      setMessages({});
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  // Fetch messages when user role changes
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Get a specific message by screen and messageKey
  const getMessage = useCallback((screen, messageKey) => {
    return messages[screen]?.[messageKey] || null;
  }, [messages]);

  // Refresh messages (useful after admin updates)
  const refreshMessages = useCallback(() => {
    fetchMessages();
  }, [fetchMessages]);

  const value = {
    messages,
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

