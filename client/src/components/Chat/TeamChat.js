import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { io } from 'socket.io-client';
import * as chatAPI from '../../services/chat';
import { ChatUIComponent } from '@syncfusion/ej2-react-interactive-chat';
import './Chat.css';

// Play notification sound - double beep
const playNotificationSound = () => {
    try {
        console.log('🔔 Playing notification sound');
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // First beep
        const oscillator1 = audioContext.createOscillator();
        const gainNode1 = audioContext.createGain();
        
        oscillator1.connect(gainNode1);
        gainNode1.connect(audioContext.destination);
        
        oscillator1.frequency.value = 600;
        oscillator1.type = 'sine';
        
        gainNode1.gain.setValueAtTime(0.4, audioContext.currentTime);
        gainNode1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        
        oscillator1.start(audioContext.currentTime);
        oscillator1.stop(audioContext.currentTime + 0.15);
        
        // Second beep (slightly higher pitch)
        const oscillator2 = audioContext.createOscillator();
        const gainNode2 = audioContext.createGain();
        
        oscillator2.connect(gainNode2);
        gainNode2.connect(audioContext.destination);
        
        oscillator2.frequency.value = 800;
        oscillator2.type = 'sine';
        
        gainNode2.gain.setValueAtTime(0.4, audioContext.currentTime + 0.2);
        gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);
        
        oscillator2.start(audioContext.currentTime + 0.2);
        oscillator2.stop(audioContext.currentTime + 0.35);
    } catch (error) {
        console.error('Failed to play notification sound:', error);
    }
};

const TeamChat = () => {
    const { user } = useAuth();
    const [chats, setChats] = useState([]);
    const [selectedChat, setSelectedChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [participants, setParticipants] = useState([]);
    const [showNewChat, setShowNewChat] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [typingUsers, setTypingUsers] = useState(new Map());
    const typingTimeoutRef = useRef(new Map());
    const typingIndicatorTimeoutRef = useRef(null);
    const lastMessageLengthRef = useRef(0);
    
    const socketRef = useRef(null);
    const chatRef = useRef(null);

    // Initialize socket connection
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;

        socketRef.current = io(process.env.REACT_APP_API_URL || 'http://localhost:5001', {
            auth: { token: `Bearer ${token}` },
            transports: ['websocket', 'polling']
        });

        socketRef.current.on('connect', () => {
            console.log('Chat socket connected');
        });

        socketRef.current.on('new-message', (data) => {
            console.log('📩 New message received:', data);
            
            if (data.chatId === selectedChat?._id) {
                const newMsg = convertToSyncfusionMessage(data.message);
                setMessages(prev => [...prev, newMsg]);
            } else if (data.message.sender._id !== user._id) {
                // Play notification sound for messages in other chats (but not own messages)
                console.log('🔔 Message from other user in different chat - playing sound');
                playNotificationSound();
            }
            
            // Update chat list
            setChats(prevChats => prevChats.map(chat => 
                chat._id === data.chatId 
                    ? { ...chat, lastMessage: data.message }
                    : chat
            ));
        });

        socketRef.current.on('user-online', (data) => {
            console.log('User online:', data);
            setOnlineUsers(prev => {
                const newSet = new Set(prev);
                newSet.add(data.userId);
                return newSet;
            });
        });

        socketRef.current.on('user-offline', (data) => {
            console.log('User offline:', data);
            setOnlineUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(data.userId);
                return newSet;
            });
        });

        socketRef.current.on('user-typing', (data) => {
            if (data.chatId === selectedChat?._id) {
                setTypingUsers(prev => {
                    const newMap = new Map(prev);
                    if (data.isTyping) {
                        newMap.set(data.userId, data.userName);
                        
                        // Clear any existing timeout for this user
                        if (typingTimeoutRef.current.has(data.userId)) {
                            clearTimeout(typingTimeoutRef.current.get(data.userId));
                        }
                        
                        // Set timeout to remove typing indicator after 3 seconds
                        const timeout = setTimeout(() => {
                            setTypingUsers(prev => {
                                const newMap = new Map(prev);
                                newMap.delete(data.userId);
                                return newMap;
                            });
                            typingTimeoutRef.current.delete(data.userId);
                        }, 3000);
                        
                        typingTimeoutRef.current.set(data.userId, timeout);
                    } else {
                        newMap.delete(data.userId);
                        if (typingTimeoutRef.current.has(data.userId)) {
                            clearTimeout(typingTimeoutRef.current.get(data.userId));
                            typingTimeoutRef.current.delete(data.userId);
                        }
                    }
                    return newMap;
                });
            }
        });

        return () => {
            // Clear all typing timeouts
            typingTimeoutRef.current.forEach(timeout => clearTimeout(timeout));
            typingTimeoutRef.current.clear();
            
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [selectedChat?._id]);

    useEffect(() => {
        loadChats();
        loadParticipants();
    }, []);

    // Typing detection via keyboard events
    useEffect(() => {
        const handleKeyPress = (e) => {
            if (selectedChat && document.activeElement?.closest('.e-chat-ui')) {
                // User is typing in the chat input
                handleTyping(true);
                
                // Clear existing timeout
                if (typingIndicatorTimeoutRef.current) {
                    clearTimeout(typingIndicatorTimeoutRef.current);
                }
                
                // Set new timeout to stop typing indicator
                typingIndicatorTimeoutRef.current = setTimeout(() => {
                    handleTyping(false);
                }, 1000);
            }
        };

        document.addEventListener('keydown', handleKeyPress);
        
        return () => {
            document.removeEventListener('keydown', handleKeyPress);
            if (typingIndicatorTimeoutRef.current) {
                clearTimeout(typingIndicatorTimeoutRef.current);
            }
        };
    }, [selectedChat]);

    const convertToSyncfusionMessage = (msg) => ({
        text: msg.content,
        author: {
            id: msg.sender._id,
            user: msg.sender.name,
            avatarUrl: msg.sender.avatarUrl || ''
        },
        timeStamp: new Date(msg.createdAt)
    });

    const loadChats = async () => {
        try {
            setLoading(true);
            const data = await chatAPI.getChats();
            setChats(data);
        } catch (error) {
            console.error('Error loading chats:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadParticipants = async () => {
        try {
            const data = await chatAPI.getParticipants();
            setParticipants(data);
        } catch (error) {
            console.error('Error loading participants:', error);
        }
    };

    const handleTyping = useCallback((isTyping) => {
        if (selectedChat && socketRef.current) {
            socketRef.current.emit('typing', {
                chatId: selectedChat._id,
                isTyping
            });
        }
    }, [selectedChat]);

    const loadMessages = useCallback(async (chatId) => {
        try {
            const data = await chatAPI.getMessages(chatId);
            const syncfusionMessages = data.map(convertToSyncfusionMessage);
            setMessages(syncfusionMessages);
            
            if (socketRef.current) {
                socketRef.current.emit('mark-read', { chatId });
                socketRef.current.emit('join-chat', { chatId });
            }
            
            setChats(prevChats => prevChats.map(chat => 
                chat._id === chatId ? { ...chat, unreadCount: 0 } : chat
            ));
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }, []);

    const handleSelectChat = (chat) => {
        setSelectedChat(chat);
        setShowNewChat(false);
        loadMessages(chat._id);
    };

    const handleSendMessage = (args) => {
        const messageText = args?.message?.text || args?.text || '';
        
        if (!selectedChat || !messageText.trim()) return;

        const content = messageText.trim();

        try {
            if (socketRef.current) {
                // Stop typing indicator
                socketRef.current.emit('typing', {
                    chatId: selectedChat._id,
                    isTyping: false
                });
                
                socketRef.current.emit('send-message', {
                    chatId: selectedChat._id,
                    content,
                    type: 'text'
                });
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    };

    const handleStartNewChat = async (participant) => {
        try {
            const chat = await chatAPI.createDirectChat(participant._id);
            setChats(prev => [chat, ...prev]);
            setSelectedChat(chat);
            setShowNewChat(false);
            loadMessages(chat._id);
        } catch (error) {
            console.error('Error creating chat:', error);
        }
    };

    const getChatTitle = (chat) => {
        if (chat.type === 'direct') {
            const otherParticipant = chat.participants.find(
                p => p.user._id !== user._id
            );
            return otherParticipant?.user?.name || 'Unknown';
        }
        return chat.name;
    };

    const getChatRole = (chat) => {
        if (chat.type === 'direct') {
            const otherParticipant = chat.participants.find(
                p => p.user._id !== user._id
            );
            return otherParticipant?.user?.role || '';
        }
        return '';
    };

    const getChatAvatar = (chat) => {
        if (chat.type === 'direct') {
            const otherParticipant = chat.participants.find(
                p => p.user._id !== user._id
            );
            return otherParticipant?.user?.avatarUrl || null;
        }
        return chat.booth?.logoUrl || null;
    };

    const getOtherParticipantId = (chat) => {
        if (chat.type === 'direct') {
            const otherParticipant = chat.participants.find(
                p => p.user._id !== user._id
            );
            return otherParticipant?.user?._id;
        }
        return null;
    };

    const filteredChats = chats.filter(chat => 
        getChatTitle(chat).toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Filter participants: exclude current user and users already in chat list
    const existingChatUserIds = new Set(
        chats
            .filter(chat => chat.type === 'direct')
            .map(chat => getOtherParticipantId(chat))
            .filter(Boolean)
    );

    const filteredParticipants = participants.filter(p =>
        p._id !== user._id && // Exclude current user
        !existingChatUserIds.has(p._id) && // Exclude users already in chat list
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const currentUser = {
        id: user._id,
        user: user.name,
        avatarUrl: user.avatarUrl || ''
    };

    if (loading) {
        return (
            <div className="team-chat-container">
                <div className="team-chat-loading">Loading chats...</div>
            </div>
        );
    }

    return (
        <div className="team-chat-container">
            {/* Sidebar - Chat List */}
            <div className="team-chat-sidebar">
                <div className="team-chat-sidebar-header">
                    <h2>Chats</h2>
                    <button 
                        className="team-chat-new-btn"
                        onClick={() => setShowNewChat(!showNewChat)}
                        aria-label="Start new chat"
                    >
                        {showNewChat ? '✕' : '+'}
                    </button>
                </div>

                <div className="team-chat-search">
                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        aria-label="Search chats"
                    />
                </div>

                <div className="team-chat-list">
                    {showNewChat ? (
                        <>
                            <div className="team-chat-list-header">New Chat</div>
                            {filteredParticipants.length === 0 ? (
                                <div className="team-chat-empty-state">
                                    No available users to chat with.
                                </div>
                            ) : (
                                filteredParticipants.map(participant => {
                                    const isOnline = onlineUsers.has(participant._id);
                                    return (
                                        <div
                                            key={participant._id}
                                            className="team-chat-list-item"
                                            onClick={() => handleStartNewChat(participant)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    handleStartNewChat(participant);
                                                }
                                            }}
                                            role="button"
                                            tabIndex={0}
                                        >
                                            <div className="team-chat-avatar">
                                                {participant.avatarUrl ? (
                                                    <img src={participant.avatarUrl} alt="" />
                                                ) : (
                                                    <div className="team-chat-avatar-placeholder">
                                                        {participant.name.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <span className={`team-chat-status-indicator ${isOnline ? 'online' : 'offline'}`} />
                                            </div>
                                            <div className="team-chat-info">
                                                <div className="team-chat-name">
                                                    {participant.name} ({participant.role})
                                                </div>
                                                <div className={`team-chat-status ${isOnline ? 'online' : 'offline'}`}>
                                                    {isOnline ? 'Online' : 'Offline'}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </>
                    ) : (
                        <>
                            {filteredChats.length === 0 ? (
                                <div className="team-chat-empty-state">
                                    No chats yet. Click + to start a new conversation.
                                </div>
                            ) : (
                                filteredChats.map(chat => {
                                    const otherUserId = getOtherParticipantId(chat);
                                    const isOnline = otherUserId && onlineUsers.has(otherUserId);
                                    const role = getChatRole(chat);
                                    
                                    return (
                                        <div
                                            key={chat._id}
                                            className={`team-chat-list-item ${selectedChat?._id === chat._id ? 'active' : ''}`}
                                            onClick={() => handleSelectChat(chat)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    handleSelectChat(chat);
                                                }
                                            }}
                                            role="button"
                                            tabIndex={0}
                                        >
                                            <div className="team-chat-avatar">
                                                {getChatAvatar(chat) ? (
                                                    <img src={getChatAvatar(chat)} alt="" />
                                                ) : (
                                                    <div className="team-chat-avatar-placeholder">
                                                        {getChatTitle(chat).charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                {chat.type === 'direct' && (
                                                    <span className={`team-chat-status-indicator ${isOnline ? 'online' : 'offline'}`} />
                                                )}
                                            </div>
                                            <div className="team-chat-info">
                                                <div className="team-chat-header-row">
                                                    <div className="team-chat-name">
                                                        {getChatTitle(chat)} {role && `(${role})`}
                                                    </div>
                                                    {chat.unreadCount > 0 && (
                                                        <span className="team-chat-unread-badge">{chat.unreadCount}</span>
                                                    )}
                                                </div>
                                                {chat.type === 'direct' && (
                                                    <div className={`team-chat-status ${isOnline ? 'online' : 'offline'}`}>
                                                        {isOnline ? 'Online' : 'Offline'}
                                                    </div>
                                                )}
                                                {chat.lastMessage && (
                                                    <div className="team-chat-last-message">
                                                        {chat.lastMessage.content}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Main Chat Area with Syncfusion */}
            <div className="team-chat-main">
                {selectedChat ? (
                    <div className="syncfusion-chat-wrapper">
                        <div className="team-chat-header">
                            <div className="team-chat-header-info">
                                <div className="team-chat-avatar">
                                    {getChatAvatar(selectedChat) ? (
                                        <img src={getChatAvatar(selectedChat)} alt="" />
                                    ) : (
                                        <div className="team-chat-avatar-placeholder">
                                            {getChatTitle(selectedChat).charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <div className="team-chat-title">
                                        {getChatTitle(selectedChat)} {getChatRole(selectedChat) && `(${getChatRole(selectedChat)})`}
                                    </div>
                                    <div className="team-chat-subtitle">
                                        {selectedChat.type === 'direct' ? (
                                            (() => {
                                                const otherUserId = getOtherParticipantId(selectedChat);
                                                const isOnline = otherUserId && onlineUsers.has(otherUserId);
                                                
                                                // Check if user is typing
                                                if (typingUsers.size > 0) {
                                                    const typingNames = Array.from(typingUsers.values());
                                                    return `${typingNames.join(', ')} ${typingNames.length === 1 ? 'is' : 'are'} typing...`;
                                                }
                                                
                                                return isOnline ? 'Online' : 'Offline';
                                            })()
                                        ) : 'Group Chat'}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {typingUsers.size > 0 && (
                            <div className="team-chat-typing-indicator">
                                <span className="typing-dot"></span>
                                <span className="typing-dot"></span>
                                <span className="typing-dot"></span>
                            </div>
                        )}
                        <ChatUIComponent
                            ref={chatRef}
                            user={currentUser}
                            messages={messages}
                            messageSend={handleSendMessage}
                            placeholder="Type your message..."
                            showHeader={false}
                            showFooter={true}
                            typingUsers={Array.from(typingUsers.values())}
                        />
                    </div>
                ) : (
                    <div className="team-chat-no-selection">
                        <h3>Select a chat to start messaging</h3>
                        <p>Choose a conversation from the sidebar or start a new one</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeamChat;
