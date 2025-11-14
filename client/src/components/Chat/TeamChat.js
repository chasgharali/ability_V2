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

const TeamChat = ({ onUnreadCountChange, isPanelOpen }) => {
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
    const [notification, setNotification] = useState(null);
    const typingTimeoutRef = useRef(new Map());
    const typingIndicatorTimeoutRef = useRef(null);
    const notificationTimeoutRef = useRef(null);

    const socketRef = useRef(null);
    const chatRef = useRef(null);
    const selectedChatRef = useRef(null);
    const joinedChatsRef = useRef(new Set());
    const [socketConnected, setSocketConnected] = useState(false);

    // Define handleTyping before effects that use it
    const handleTyping = useCallback((isTyping) => {
        if (selectedChat && socketRef.current) {
            socketRef.current.emit('typing', {
                chatId: selectedChat._id,
                isTyping
            });
        }
    }, [selectedChat]);

    // Initialize socket connection
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token || !user) {
            console.log('⚠️ Skipping socket connection - no token or user');
            return;
        }

        // Don't create socket if it already exists
        if (socketRef.current?.connected) {
            console.log('✅ Socket already connected');
            return;
        }

        console.log('🔌 Initializing socket connection...');

        // Capture ref value for cleanup
        const typingTimeouts = typingTimeoutRef.current;

        socketRef.current = io(process.env.REACT_APP_API_URL || 'http://localhost:5001', {
            auth: { token: `Bearer ${token}` },
            transports: ['websocket', 'polling']
        });

        socketRef.current.on('connect', () => {
            console.log('✅ Chat socket connected successfully');
            setSocketConnected(true);
            joinedChatsRef.current.clear();

            // Request list of currently online users
            socketRef.current.emit('request-online-users');
        });

        socketRef.current.on('disconnect', () => {
            console.log('⚠️ Chat socket disconnected');
            setSocketConnected(false);
        });

        socketRef.current.on('new-message', (data) => {
            console.log('📩 New message received:', data);

            // Verify user exists
            if (!user || !user._id) {
                console.warn('User not loaded, skipping message processing');
                return;
            }

            // Use ref for current chat to avoid stale closure
            const currentChatId = selectedChatRef.current?._id;
            const isCurrentChat = data.chatId === currentChatId;
            const isOwnMessage = data.message.sender._id === user._id;

            console.log('📌 Current chat ID:', currentChatId);
            console.log('📌 Message chat ID:', data.chatId);
            console.log('📌 isCurrentChat:', isCurrentChat);
            console.log('📌 isOwnMessage:', isOwnMessage);

            if (isCurrentChat) {
                console.log('✅ Adding message to current chat view');
                // Add message to current chat view
                const newMsg = convertToSyncfusionMessage(data.message);
                setMessages(prev => {
                    console.log('📝 Previous messages count:', prev.length);
                    const newMessages = [...prev, newMsg];
                    console.log('📝 New messages count:', newMessages.length);
                    return newMessages;
                });

                // Mark as read if it's the current chat
                if (socketRef.current) {
                    socketRef.current.emit('mark-read', { chatId: data.chatId });
                }
            }

            // Play notification sound for messages in OTHER chats from OTHER users
            if (!isCurrentChat && !isOwnMessage) {
                console.log('🔔 Playing notification sound - other chat, other user');
                playNotificationSound();

                // Show notification toast
                const senderName = data.message.sender.name;
                setNotification({
                    sender: senderName,
                    message: data.message.content
                });

                // Auto-hide notification after 4 seconds
                if (notificationTimeoutRef.current) {
                    clearTimeout(notificationTimeoutRef.current);
                }
                notificationTimeoutRef.current = setTimeout(() => {
                    setNotification(null);
                }, 4000);
            } else if (!isCurrentChat && isOwnMessage) {
                console.log('ℹ️ Own message in different chat - no sound');
            }

            // Update chat list with unread count
            setChats(prevChats => prevChats.map(chat => {
                if (chat._id === data.chatId) {
                    return {
                        ...chat,
                        lastMessage: data.message,
                        // Only increment unread if: not current chat AND not own message
                        unreadCount: isCurrentChat ? 0 : (isOwnMessage ? (chat.unreadCount || 0) : (chat.unreadCount || 0) + 1)
                    };
                }
                return chat;
            }));
        });


        // Receive initial online users list
        socketRef.current.on('online-users-list', (data) => {
            console.log('👥 Received online users list:', data.userIds);
            setOnlineUsers(new Set(data.userIds));
        });

        socketRef.current.on('user-online', (data) => {
            console.log('🟢 User online:', data.userId, data.userName);
            setOnlineUsers(prev => {
                const newSet = new Set(prev);
                newSet.add(data.userId);
                console.log('👥 Updated online users:', newSet.size);
                return newSet;
            });
        });

        socketRef.current.on('user-offline', (data) => {
            console.log('⚫ User offline:', data.userId, data.userName);
            setOnlineUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(data.userId);
                console.log('👥 Updated online users:', newSet.size);
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
            typingTimeouts.forEach(timeout => clearTimeout(timeout));
            typingTimeouts.clear();

            // Don't disconnect socket in cleanup - keep it alive
            console.log('🧹 Cleaning up socket effect (but keeping connection alive)');
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    useEffect(() => {
        loadChats();
        loadParticipants();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Cleanup socket on component unmount
    useEffect(() => {
        return () => {
            console.log('🔌 Component unmounting - disconnecting socket');
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, []);

    // Join all chat rooms when chats are loaded and socket is connected
    useEffect(() => {
        if (!socketConnected || !socketRef.current || chats.length === 0) {
            return;
        }

        chats.forEach(chat => {
            if (!joinedChatsRef.current.has(chat._id)) {
                socketRef.current.emit('join-chat', { chatId: chat._id });
                joinedChatsRef.current.add(chat._id);
            }
        });
    }, [chats, socketConnected]);

    // Reset joined chat tracking when chat list clears (e.g., logout)
    useEffect(() => {
        if (chats.length === 0) {
            joinedChatsRef.current.clear();
        }
    }, [chats.length]);

    // Monitor messages changes
    useEffect(() => {
        console.log('💬 Messages state updated:', messages.length, 'messages');
        if (messages.length > 0) {
            console.log('💬 Latest message:', messages[messages.length - 1]);
        }
    }, [messages]);

    // Monitor online users changes
    useEffect(() => {
        console.log('👥 Online users state updated:', onlineUsers.size, 'users online');
        console.log('👥 Online user IDs:', Array.from(onlineUsers));
    }, [onlineUsers]);

    // Clear selected chat when panel closes
    useEffect(() => {
        if (isPanelOpen === false) {
            console.log('🔇 Chat panel closed - clearing selected chat ref for sound alerts');
            selectedChatRef.current = null;
            // On mobile, also clear selected chat to show list when reopening
            if (window.innerWidth <= 768) {
                setSelectedChat(null);
            }
        } else if (isPanelOpen === true && selectedChat) {
            console.log('🔊 Chat panel opened - restoring selected chat ref:', selectedChat._id);
            selectedChatRef.current = selectedChat;
        }
    }, [isPanelOpen, selectedChat]);

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
    }, [selectedChat, handleTyping]);

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
            // Initialize unread counts if not present
            const chatsWithUnreadCount = data.map(chat => ({
                ...chat,
                unreadCount: chat.unreadCount || 0
            }));
            setChats(chatsWithUnreadCount);
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

    const loadMessages = useCallback(async (chatId) => {
        try {
            const data = await chatAPI.getMessages(chatId);
            const syncfusionMessages = data.map(convertToSyncfusionMessage);
            setMessages(syncfusionMessages);

            if (socketRef.current) {
                socketRef.current.emit('mark-read', { chatId });
                // No need to join here - already joined all chats on mount
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
        selectedChatRef.current = chat;
        setShowNewChat(false);
        loadMessages(chat._id);
    };

    const handleBackToList = () => {
        setSelectedChat(null);
        selectedChatRef.current = null;
    };

    const handleSendMessage = (args) => {
        const messageText = args?.message?.text || args?.text || '';

        console.log('📤 Sending message:', messageText);
        console.log('📤 Selected chat:', selectedChat?._id);

        if (!selectedChat || !messageText.trim()) {
            console.warn('⚠️ Cannot send message - no chat selected or empty message');
            return;
        }

        const content = messageText.trim();

        try {
            if (socketRef.current) {
                console.log('📤 Emitting send-message via socket');
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
                console.log('✅ Message sent to server');
            } else {
                console.error('❌ Socket not connected');
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    };

    const handleStartNewChat = async (participant) => {
        try {
            const chat = await chatAPI.createDirectChat(participant._id);
            setChats(prev => {
                const filtered = prev.filter(existingChat => existingChat._id !== chat._id);
                return [chat, ...filtered];
            });
            setSelectedChat(chat);
            setShowNewChat(false);

            // Join the new chat room immediately
            if (socketRef.current) {
                socketRef.current.emit('join-chat', { chatId: chat._id });
            }

            selectedChatRef.current = chat;
            loadMessages(chat._id);
        } catch (error) {
            console.error('Error creating chat:', error);
        }
    };

    const getChatTitle = (chat) => {
        if (chat.type === 'direct') {
            const otherParticipant = chat.participants.find(
                p => p.user._id !== user?._id
            );
            return otherParticipant?.user?.name || 'Unknown';
        }
        return chat.name;
    };

    const getChatRole = (chat) => {
        if (chat.type === 'direct') {
            const otherParticipant = chat.participants.find(
                p => p.user._id !== user?._id
            );
            return otherParticipant?.user?.role || '';
        }
        return '';
    };

    const getChatAvatar = (chat) => {
        if (chat.type === 'direct') {
            const otherParticipant = chat.participants.find(
                p => p.user._id !== user?._id
            );
            return otherParticipant?.user?.avatarUrl || null;
        }
        return chat.booth?.logoUrl || null;
    };

    const getOtherParticipantId = (chat) => {
        if (chat.type === 'direct') {
            const otherParticipant = chat.participants.find(
                p => p.user._id !== user?._id
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
        p._id !== user?._id && // Exclude current user
        !existingChatUserIds.has(p._id) && // Exclude users already in chat list
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const currentUser = user ? {
        id: user._id,
        user: user.name,
        avatarUrl: user.avatarUrl || ''
    } : null;

    // Calculate total unread count
    const totalUnreadCount = chats.reduce((total, chat) => total + (chat.unreadCount || 0), 0);

    // Notify parent of unread count changes
    useEffect(() => {
        console.log('📊 Total unread count:', totalUnreadCount);
        if (onUnreadCountChange) {
            onUnreadCountChange(totalUnreadCount);
        }
    }, [totalUnreadCount, onUnreadCountChange]);

    if (loading || !user) {
        return (
            <div className="team-chat-container">
                <div className="team-chat-loading">
                    {loading ? 'Loading chats...' : 'Loading user...'}
                </div>
            </div>
        );
    }

    return (
        <div className={`team-chat-container ${selectedChat ? 'chat-open' : ''}`} data-unread-count={totalUnreadCount}>
            {/* Notification Toast */}
            {notification && (
                <div
                    className="team-chat-notification-toast"
                    onClick={() => setNotification(null)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
                            e.preventDefault();
                            setNotification(null);
                        }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label="Close notification"
                >
                    <div className="notification-icon">💬</div>
                    <div className="notification-content">
                        <div className="notification-title">{notification.sender}</div>
                        <div className="notification-message">{notification.message}</div>
                    </div>
                    <button
                        className="notification-close"
                        onClick={(e) => {
                            e.stopPropagation();
                            setNotification(null);
                        }}
                        aria-label="Close notification"
                    >
                        ×
                    </button>
                </div>
            )}

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
                            <button
                                className="team-chat-mobile-back"
                                onClick={handleBackToList}
                                aria-label="Back to chat list"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M19 12H5M12 19l-7-7 7-7" />
                                </svg>
                            </button>
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
                            key={selectedChat._id}
                            ref={chatRef}
                            user={currentUser}
                            messages={messages}
                            messageSend={handleSendMessage}
                            placeholder="Type your message..."
                            showHeader={false}
                            showFooter={true}
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
