import React, { useState, useRef, useEffect } from 'react';
import { FiSend, FiX, FiMessageCircle } from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';
import './ChatPanel.css';

const ChatPanel = ({ messages = [], onSendMessage, onClose }) => {
  const { user } = useAuth();
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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
    
    if (!newMessage.trim()) return;

    try {
      await onSendMessage(newMessage.trim());
      setNewMessage('');
      setIsTyping(false);
    } catch (error) {
      console.error('Error sending message:', error);
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
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-title">
          <FiMessageCircle size={20} />
          <span>Chat</span>
          <span className="message-count">({messages.length})</span>
        </div>
        <button 
          className="close-button"
          onClick={onClose}
          aria-label="Close chat"
        >
          <FiX size={20} />
        </button>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="no-messages">
            <FiMessageCircle size={48} />
            <p>No messages yet</p>
            <p className="subtitle">Start the conversation!</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`message ${isOwnMessage(message) ? 'own' : 'other'} ${message.messageType || 'text'}`}
            >
              {message.messageType === 'system' ? (
                <div className="system-message">
                  <span className="system-text">{message.message}</span>
                  <span className="message-time">{formatTime(message.timestamp)}</span>
                </div>
              ) : (
                <>
                  {!isOwnMessage(message) && (
                    <div className="message-sender">
                      <span 
                        className="sender-name"
                        style={{ color: getRoleColor(message.senderRole || message.sender?.role) }}
                      >
                        {message.sender?.name || 'Unknown'}
                      </span>
                      <span className="sender-role">
                        ({message.senderRole || message.sender?.role || 'User'})
                      </span>
                    </div>
                  )}
                  <div className="message-content">
                    <div className="message-bubble">
                      <p>{message.message}</p>
                    </div>
                    <span className="message-time">
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
        <div className="typing-indicator">
          <span>You are typing...</span>
        </div>
      )}

      {/* Input */}
      <form className="chat-input-form" onSubmit={handleSendMessage}>
        <div className="input-container">
          <textarea
            ref={inputRef}
            value={newMessage}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="message-input"
            rows={1}
            maxLength={500}
          />
          <button
            type="submit"
            className="send-button"
            disabled={!newMessage.trim()}
            aria-label="Send message"
          >
            <FiSend size={18} />
          </button>
        </div>
        <div className="input-footer">
          <span className="character-count">
            {newMessage.length}/500
          </span>
          <span className="input-hint">
            Press Enter to send, Shift+Enter for new line
          </span>
        </div>
      </form>
    </div>
  );
};

export default ChatPanel;
