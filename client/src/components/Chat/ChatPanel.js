import React, { useState } from 'react';
import Chat from './Chat';
import './ChatPanel.css';

/**
 * Collapsible Chat Panel for Recruiter/Interpreter views
 */
export default function ChatPanel() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            {/* Chat Toggle Button */}
            <button 
                className={`team-chat-panel-toggle ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                aria-label={isOpen ? 'Close chat panel' : 'Open chat panel'}
                aria-expanded={isOpen}
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>Team Chat</span>
            </button>

            {/* Collapsible Panel */}
            <div className={`team-chat-panel ${isOpen ? 'open' : ''}`}>
                <div className="team-chat-panel-header">
                    <h3>Team Chat</h3>
                    <button 
                        className="team-chat-panel-close"
                        onClick={() => setIsOpen(false)}
                        aria-label="Close chat panel"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div className="team-chat-panel-content">
                    <Chat />
                </div>
            </div>

            {/* Overlay for mobile */}
            {isOpen && (
                <div 
                    className="team-chat-panel-overlay"
                    onClick={() => setIsOpen(false)}
                    aria-hidden="true"
                />
            )}
        </>
    );
}
