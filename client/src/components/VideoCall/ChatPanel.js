import React, { useState, useRef, useEffect } from 'react';
import { FiSend, FiX, FiMessageCircle } from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';
import './ChatPanel.css';

const ChatPanel = ({ messages = [], onSendMessage, onClose }) => {
  const { user } = useAuth();
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Focus input when panel opens
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      await onSendMessage(newMessage.trim());
      setNewMessage('');
      setIsTyping(false);
      
      // Announce message sent for screen readers
      const announcement = document.getElementById('chat-announcements');
      if (announcement) {
        announcement.textContent = 'Message sent';
        setTimeout(() => {
          announcement.textContent = '';
        }, 1000);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Announce error for screen readers
      const announcement = document.getElementById('chat-announcements');
      if (announcement) {
        announcement.textContent = 'Failed to send message. Please try again.';
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);
    setIsTyping(e.target.value.length > 0);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'recruiter':
        return '#007bff';
      case 'jobseeker':
        return '#28a745';
      case 'interpreter':
        return '#ffc107';
      default:
        return '#6c757d';
    }
  };

  const isOwnMessage = (message) => {
    return message.sender?.id === user?.id;
  };

  return (
    <div 
      className="incall-chat-panel" 
      ref={panelRef}
      role="complementary" 
      aria-label="Chat panel"
      aria-live="polite"
    >
      {/* Screen reader announcements */}
      <div id="chat-announcements" className="sr-only" aria-live="assertive"></div>
      
      {/* Header */}
      <div className="incall-chat-header" role="banner">
        <div className="incall-chat-title">
          <FiMessageCircle size={20} aria-hidden="true" />
          <h2>Chat</h2>
          <span className="incall-chat-message-count" aria-label={`${messages.length} messages`}>
            ({messages.length})
          </span>
        </div>
        <button 
          className="incall-chat-close-button"
          onClick={onClose}
          aria-label="Close chat panel"
          title="Close chat"
        >
          <FiX size={20} aria-hidden="true" />
        </button>
      </div>

      {/* Messages */}
      <div 
        className="incall-chat-messages" 
        role="log" 
        aria-label="Chat messages"
        aria-live="polite"
        tabIndex={0}
      >
        {messages.length === 0 ? (
          <div className="incall-chat-no-messages" role="status">
            <FiMessageCircle size={48} aria-hidden="true" />
            <p>No messages yet</p>
            <p className="incall-chat-subtitle">Start the conversation!</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`incall-chat-message ${isOwnMessage(message) ? 'incall-chat-own' : 'incall-chat-other'} ${message.messageType === 'system' ? 'incall-chat-system' : ''}`}
              role="article"
              aria-label={`Message from ${isOwnMessage(message) ? 'you' : message.sender?.name || 'unknown'}`}
            >
              {message.messageType === 'system' ? (
                <div className="incall-chat-system-message">
                  <span className="incall-chat-system-text">{message.message}</span>
                  <span className="incall-chat-message-time">{formatTime(message.timestamp)}</span>
                </div>
              ) : (
                <>
                  {!isOwnMessage(message) && (
                    <div className="incall-chat-message-sender">
                      <span 
                        className="incall-chat-sender-name"
                        style={{ color: getRoleColor(message.senderRole || message.sender?.role) }}
                      >
                        {message.sender?.name || 'Unknown'}
                      </span>
                      <span className="incall-chat-sender-role">
                        ({message.senderRole || message.sender?.role || 'User'})
                      </span>
                    </div>
                  )}
                  <div className="incall-chat-message-content">
                    <div className="incall-chat-message-bubble">
                      <p>{message.message}</p>
                    </div>
                    <span className="incall-chat-message-time">
                      {formatTime(message.timestamp)}
                    </span>
                  </div>
                </>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      {isTyping && (
        <div className="incall-chat-typing-indicator">
          <span>You are typing...</span>
        </div>
      )}

      {/* Input */}
      <form 
        className="incall-chat-input-form" 
        onSubmit={handleSendMessage}
        aria-label="Send message form"
      >
        <div className="incall-chat-input-container">
          <label htmlFor="message-input" className="sr-only">
            Type your message
          </label>
          <textarea
            id="message-input"
            ref={inputRef}
            value={newMessage}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="incall-chat-message-input"
            rows={1}
            maxLength={500}
            aria-describedby="character-count input-hint"
            disabled={isSending}
          />
          <button
            type="submit"
            className="incall-chat-send-button"
            disabled={!newMessage.trim() || isSending}
            aria-label={isSending ? "Sending message..." : "Send message"}
            title={isSending ? "Sending..." : "Send message"}
          >
            <FiSend size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="incall-chat-input-footer">
          <span id="character-count" className="incall-chat-character-count" aria-live="polite">
            {newMessage.length}/500
          </span>
          <span id="input-hint" className="incall-chat-input-hint">
            Press Enter to send, Shift+Enter for new line
          </span>
        </div>
      </form>
    </div>
  );
};

export default ChatPanel;
