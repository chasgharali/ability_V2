import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { io } from 'socket.io-client';
import * as chatAPI from '../../services/chat';
import { ChatUIComponent } from '@syncfusion/ej2-react-interactive-chat';
import { getSocketUrl } from '../../utils/apiConfig';
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

const TEAM_CHAT_STATUS_OPTIONS = [
    { value: 'online', label: 'Online' },
    { value: 'away', label: 'Away' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'offline', label: 'Offline' }
];

const TEAM_CHAT_STATUS_SETTER_ROLES = new Set(['Support', 'Recruiter', 'Interpreter']);

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
    const [userStatuses, setUserStatuses] = useState(new Map());
    const [myChatStatus, setMyChatStatus] = useState('online');
    const [chatStatusUpdating, setChatStatusUpdating] = useState(false);
    const [typingUsers, setTypingUsers] = useState(new Map());
    const [notification, setNotification] = useState(null);
    const [broadcastMessage, setBroadcastMessage] = useState('');
    const [showBroadcastComposer, setShowBroadcastComposer] = useState(false);
    const [broadcasting, setBroadcasting] = useState(false);
    const typingTimeoutRef = useRef(new Map());
    const typingIndicatorTimeoutRef = useRef(null);
    const notificationTimeoutRef = useRef(null);

    const socketRef = useRef(null);
    const chatsRef = useRef([]);
    const chatRef = useRef(null);
    const selectedChatRef = useRef(null);
    const joinedChatsRef = useRef(new Set());
    const [socketConnected, setSocketConnected] = useState(false);
    const canSetTeamChatStatus = TEAM_CHAT_STATUS_SETTER_ROLES.has(user?.role);

    // Define handleTyping before effects that use it
    const handleTyping = useCallback((isTyping) => {
        if (selectedChat && socketRef.current) {
            socketRef.current.emit('typing', {
                chatId: selectedChat._id,
                isTyping
            });
        }
    }, [selectedChat]);

    // Keep a live ref of chats for use inside socket handlers
    useEffect(() => {
        chatsRef.current = chats;
    }, [chats]);

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

        const socketUrl = getSocketUrl();
        console.log('🔌 Socket URL:', socketUrl);

        // Capture ref value for cleanup
        const typingTimeouts = typingTimeoutRef.current;

        // Determine if we're connecting to localhost (development)
        const isLocalhost = socketUrl.includes('localhost') || socketUrl.includes('127.0.0.1');

        socketRef.current = io(socketUrl, {
            auth: { token: `Bearer ${token}` },
            transports: ['websocket', 'polling'],
            // In development, explicitly use non-secure WebSocket
            secure: !isLocalhost,
            // Reject unauthorized SSL certificates in production only
            rejectUnauthorized: !isLocalhost
        });

        socketRef.current.on('connect', () => {
            console.log('✅ Chat socket connected successfully');
            setSocketConnected(true);
            joinedChatsRef.current.clear();

            // Request list of currently online users
            socketRef.current.emit('request-online-users');
            socketRef.current.emit('get-chat-status');
        });

        socketRef.current.on('disconnect', () => {
            console.log('⚠️ Chat socket disconnected');
            setSocketConnected(false);
            setChatStatusUpdating(false);
        });

        socketRef.current.on('error', () => {
            setChatStatusUpdating(false);
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

            // Update chat list with unread count; if the chat doesn't exist yet, create a minimal entry
            setChats(prevChats => {
                const idx = prevChats.findIndex(chat => chat._id === data.chatId);

                // Existing chat: update lastMessage + unreadCount
                if (idx !== -1) {
                    return prevChats.map(chat => {
                        if (chat._id !== data.chatId) return chat;
                        return {
                            ...chat,
                            lastMessage: data.message,
                            // Only increment unread if: not current chat AND not own message
                            unreadCount: isCurrentChat
                                ? 0
                                : (isOwnMessage ? (chat.unreadCount || 0) : (chat.unreadCount || 0) + 1)
                        };
                    });
                }

                // New chat (not yet in recent list) and message is from someone else:
                // create a minimal direct chat entry so it appears immediately with unread badge.
                if (!isOwnMessage) {
                    console.log('🆕 Creating local chat stub for new incoming chat');
                    const sender = data.message?.sender;
                    const minimalChat = {
                        _id: data.chatId,
                        type: 'direct',
                        participants: sender && user ? [
                            {
                                user: {
                                    _id: user._id,
                                    name: user.name,
                                    avatarUrl: user.avatarUrl || '',
                                    role: user.role,
                                    assignedBooth: user.assignedBooth || null
                                }
                            },
                            {
                                user: {
                                    _id: sender._id,
                                    name: sender.name,
                                    avatarUrl: sender.avatarUrl || '',
                                    role: sender.role,
                                    assignedBooth: sender.assignedBooth || null
                                }
                            }
                        ] : [],
                        lastMessage: data.message,
                        unreadCount: 1
                    };
                    return [minimalChat, ...prevChats];
                }

                // Own message in a brand-new chat that we don't know about yet – let future loads handle it
                return prevChats;
            });
        });

        // Notification for chats when user was offline or not in the room
        socketRef.current.on('chat-notification', (data) => {
            console.log('📨 Chat notification received:', data);

            const currentChatId = selectedChatRef.current?._id;
            const isCurrentChat = data.chatId && data.chatId === currentChatId;
            const isOwnMessage = data.message?.sender?._id && user && data.message.sender._id === user._id;

            // Only play sound when it's from another user AND not for the chat currently open
            if (!isCurrentChat && !isOwnMessage) {
                try {
                    playNotificationSound();
                } catch (e) {
                    console.error('Failed to play notification sound from chat-notification:', e);
                }
            }

            const senderName = data.message?.sender?.name;
            const content = data.message?.content;
            if (senderName && content) {
                setNotification({
                    sender: senderName,
                    message: content
                });

                if (notificationTimeoutRef.current) {
                    clearTimeout(notificationTimeoutRef.current);
                }
                notificationTimeoutRef.current = setTimeout(() => {
                    setNotification(null);
                }, 4000);
            }

            // Mirror unread state: if this chat isn't in the list yet, add a minimal entry with unreadCount
            setChats(prevChats => {
                const idx = prevChats.findIndex(chat => chat._id === data.chatId);
                const sender = data.message?.sender;

                if (idx !== -1) {
                    return prevChats.map(chat => {
                        if (chat._id !== data.chatId) return chat;
                        return {
                            ...chat,
                            lastMessage: data.message,
                            // Avoid double-counting when a new-message already incremented unreadCount;
                            // use the max of existing and server-provided unread value.
                            unreadCount: Math.max(chat.unreadCount || 0, data.unreadCount || 1)
                        };
                    });
                }

                if (data.chat) {
                    const notifiedChat = {
                        ...data.chat,
                        unreadCount: data.unreadCount || 1
                    };
                    return [notifiedChat, ...prevChats];
                }

                if (sender && user) {
                    const minimalChat = {
                        _id: data.chatId,
                        type: 'direct',
                        participants: [
                            {
                                user: {
                                    _id: user._id,
                                    name: user.name,
                                    avatarUrl: user.avatarUrl || '',
                                    role: user.role,
                                    assignedBooth: user.assignedBooth || null
                                }
                            },
                            {
                                user: {
                                    _id: sender._id,
                                    name: sender.name,
                                    avatarUrl: sender.avatarUrl || '',
                                    role: sender.role,
                                    assignedBooth: sender.assignedBooth || null
                                }
                            }
                        ],
                        lastMessage: data.message,
                        unreadCount: data.unreadCount || 1
                    };
                    return [minimalChat, ...prevChats];
                }

                return prevChats;
            });
        });


        // Receive initial online users list
        socketRef.current.on('online-users-list', (data) => {
            console.log('👥 Received online users list:', data.userIds);
            setOnlineUsers(new Set(data.userIds));
            if (data.chatStatuses) {
                setUserStatuses(new Map(Object.entries(data.chatStatuses)));
            }
        });

        socketRef.current.on('user-online', (data) => {
            console.log('🟢 User online:', data.userId, data.userName);
            setOnlineUsers(prev => {
                const newSet = new Set(prev);
                newSet.add(data.userId);
                console.log('👥 Updated online users:', newSet.size);
                return newSet;
            });
            if (data.userId) {
                setUserStatuses(prev => {
                    const newMap = new Map(prev);
                    newMap.set(data.userId, data.chatStatus || 'online');
                    return newMap;
                });
            }
        });

        socketRef.current.on('user-offline', (data) => {
            console.log('⚫ User offline:', data.userId, data.userName);
            setOnlineUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(data.userId);
                console.log('👥 Updated online users:', newSet.size);
                return newSet;
            });
            if (data.userId) {
                setUserStatuses(prev => {
                    const newMap = new Map(prev);
                    newMap.set(data.userId, 'offline');
                    return newMap;
                });
            }
        });

        socketRef.current.on('user-chat-status-changed', (data) => {
            if (!data?.userId) return;
            setUserStatuses(prev => {
                const newMap = new Map(prev);
                newMap.set(data.userId, data.status || 'offline');
                return newMap;
            });
        });

        socketRef.current.on('chat-status', (data) => {
            if (!data?.userId) return;
            setUserStatuses(prev => {
                const newMap = new Map(prev);
                newMap.set(data.userId, data.status || 'online');
                return newMap;
            });
            if (data.userId === user?._id) {
                setMyChatStatus(data.status || 'online');
            }
        });

        socketRef.current.on('chat-status-updated', (data) => {
            if (!data?.userId) return;
            setUserStatuses(prev => {
                const newMap = new Map(prev);
                newMap.set(data.userId, data.status || 'online');
                return newMap;
            });
            if (data.userId === user?._id) {
                setMyChatStatus(data.status || 'online');
                setChatStatusUpdating(false);
            }
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

    // Process author names to display booth name for recruiters when viewed by GlobalSupport
    useEffect(() => {
        if (user?.role !== 'GlobalSupport' || !selectedChat) return;

        // Wait for Syncfusion to render messages
        const timer = setTimeout(() => {
            const messageElements = document.querySelectorAll('.syncfusion-chat-wrapper .e-chat-ui .e-message');
            
            messageElements.forEach((messageEl, index) => {
                // Skip if already processed
                if (messageEl.dataset.boothProcessed === 'true') return;
                
                // Get the message data
                const message = messages[index];
                if (!message || !message.author?.boothName) return;

                // Only process bot messages (messages from others, not current user)
                const isBotMessage = messageEl.classList.contains('e-bot');
                if (!isBotMessage) return;

                // Find the author name element - try multiple selectors
                let authorEl = messageEl.querySelector('.e-message-author') ||
                              messageEl.querySelector('.e-author-name') ||
                              messageEl.querySelector('[class*="author"]') ||
                              messageEl.querySelector('.e-message-header') ||
                              messageEl.querySelector('.e-message-content')?.previousElementSibling;

                // If we can't find a specific author element, try to find text content that matches the name
                if (!authorEl) {
                    const allElements = messageEl.querySelectorAll('*');
                    for (let el of allElements) {
                        if (el.textContent && el.textContent.includes('|||BOOTH:')) {
                            authorEl = el;
                            break;
                        }
                    }
                }

                if (authorEl) {
                    // Check if we already added the booth name
                    if (authorEl.querySelector('.recruiter-booth-name')) {
                        messageEl.dataset.boothProcessed = 'true';
                        return;
                    }

                    // Process text content if it contains the booth separator
                    const textContent = authorEl.textContent || '';
                    if (textContent.includes('|||BOOTH:')) {
                        const parts = textContent.split('|||BOOTH:');
                        if (parts.length === 2) {
                            const namePart = parts[0].trim();
                            const boothPart = parts[1].split('|||')[0].trim();
                            
                            // Clear and rebuild the content
                            authorEl.innerHTML = '';
                            
                            // Add name
                            const nameSpan = document.createElement('span');
                            nameSpan.textContent = namePart;
                            authorEl.appendChild(nameSpan);
                            
                            // Add booth name
                            const boothSpan = document.createElement('div');
                            boothSpan.className = 'recruiter-booth-name';
                            boothSpan.textContent = boothPart;
                            authorEl.appendChild(boothSpan);
                        }
                    } else {
                        // If no separator found, just add the booth name after the existing content
                        const boothSpan = document.createElement('div');
                        boothSpan.className = 'recruiter-booth-name';
                        boothSpan.textContent = message.author.boothName;
                        authorEl.appendChild(boothSpan);
                    }
                    
                    messageEl.dataset.boothProcessed = 'true';
                }
            });
        }, 300);

        return () => clearTimeout(timer);
    }, [messages, selectedChat, user]);

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

    const convertToSyncfusionMessage = (msg) => {
        // For GlobalSupport users viewing recruiters, include booth name in author name
        const shouldShowBooth = user?.role === 'GlobalSupport' && 
                                 msg.sender?.role === 'Recruiter' && 
                                 msg.sender?.assignedBooth;
        
        const boothName = shouldShowBooth && msg.sender.assignedBooth?.name 
            ? msg.sender.assignedBooth.name 
            : null;
        
        // Include booth name in author name with a special separator for CSS targeting
        const authorName = boothName 
            ? `${msg.sender.name}|||BOOTH:${boothName}|||`
            : msg.sender.name;
        
        return {
            text: msg.content,
            author: {
                id: msg.sender._id,
                user: authorName,
                avatarUrl: msg.sender.avatarUrl || '',
                role: msg.sender.role,
                boothName: boothName
            },
            timeStamp: new Date(msg.createdAt)
        };
    };

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
            // Debug: Log participants to check assignedBooth
            if (user?.role === 'GlobalSupport') {
                console.log('📋 Participants loaded:', data.map(p => ({
                    name: p.name,
                    role: p.role,
                    assignedBooth: p.assignedBooth,
                    hasBooth: !!p.assignedBooth
                })));
            }
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

    const handleBroadcastMessage = async () => {
        if (user?.role !== 'GlobalSupport') return;
        const content = broadcastMessage.trim();
        if (!content) return;

        try {
            setBroadcasting(true);
            const response = await chatAPI.broadcastEventMessage(content);
            const broadcastChat = response?.chat;
            if (broadcastChat) {
                setChats(prev => {
                    const filtered = prev.filter(existingChat => existingChat._id !== broadcastChat._id);
                    return [{ ...broadcastChat, unreadCount: 0 }, ...filtered];
                });
                setSelectedChat(broadcastChat);
                selectedChatRef.current = broadcastChat;

                if (socketRef.current) {
                    socketRef.current.emit('join-chat', { chatId: broadcastChat._id });
                    joinedChatsRef.current.add(broadcastChat._id);
                }

                await loadMessages(broadcastChat._id);
            }
            setBroadcastMessage('');
            setShowBroadcastComposer(false);
        } catch (error) {
            console.error('Error broadcasting message:', error);
        } finally {
            setBroadcasting(false);
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

    const getBoothDisplayName = (assignedBooth) => {
        if (!assignedBooth) return '';
        if (typeof assignedBooth === 'string') return assignedBooth;
        return assignedBooth.name || assignedBooth.company || '';
    };

    const getChatBoothName = (chat) => {
        if (chat.type !== 'direct') return '';
        const otherParticipant = chat.participants.find(
            p => p.user._id !== user?._id
        );
        return getBoothDisplayName(otherParticipant?.user?.assignedBooth);
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

    const getEffectiveChatStatus = useCallback((targetUserId) => {
        if (!targetUserId) return 'offline';
        const explicitStatus = userStatuses.get(targetUserId);
        if (explicitStatus) return explicitStatus;
        return onlineUsers.has(targetUserId) ? 'online' : 'offline';
    }, [onlineUsers, userStatuses]);

    const handleSetMyChatStatus = useCallback((newStatus) => {
        if (!socketRef.current || !canSetTeamChatStatus) return;
        setChatStatusUpdating(true);
        socketRef.current.emit('set-chat-status', { status: newStatus });
    }, [canSetTeamChatStatus]);

    // Build a set of valid participant IDs from the backend (already event-filtered)
    const validParticipantIds = new Set(participants.map(p => p._id));

    const filteredChats = chats.filter(chat => {
        // Search filter
        if (!getChatTitle(chat).toLowerCase().includes(searchQuery.toLowerCase())) return false;
        
        // For direct chats, hide chats with GlobalSupport/GlobalInterpreter users not in the valid participants list
        // This ensures existing chats with global roles from different events are hidden
        if (chat.type === 'direct') {
            const otherParticipant = chat.participants.find(p => p.user._id !== user?._id);
            const globalRoles = ['GlobalSupport', 'GlobalInterpreter'];
            if (globalRoles.includes(otherParticipant?.user?.role) || 
                (globalRoles.includes(user?.role) && otherParticipant?.user?.role)) {
                // If current user is a global role or other user is a global role,
                // only show if the other user is in the valid participants list
                if (otherParticipant?.user?._id && !validParticipantIds.has(otherParticipant.user._id)) {
                    return false;
                }
            }
        }
        return true;
    });

    // Filter participants: exclude current user and users already in chat list
    const existingChatUserIds = new Set(
        chats
            .filter(chat => chat.type === 'direct')
            .map(chat => getOtherParticipantId(chat))
            .filter(Boolean)
    );

    // Filter participants: exclude current user and users already in chat list,
    // then sort so online users appear at the top
    const filteredParticipants = participants
        .filter(p => {
            // Exclude current user
            if (p._id === user?._id) return false;
            
            // Exclude users already in chat list
            if (existingChatUserIds.has(p._id)) return false;
            
            // Search filter
            if (!p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            
            // For recruiters: only show users from their company (booth) and support users
            // This applies to both online and offline users - online/offline only affects sorting
            if (user?.role === 'Recruiter' && user?.assignedBooth) {
                const userBoothId = user.assignedBooth._id?.toString() || user.assignedBooth.toString();
                const participantBoothId = p.assignedBooth?._id?.toString() || p.assignedBooth?.toString();
                const isSameCompany = participantBoothId && participantBoothId === userBoothId;
                const isSupport = p.role === 'Support' || p.role === 'GlobalSupport';
                
                // If same company/booth: show Recruiters and Support only (excludes Interpreters)
                if (isSameCompany) {
                    return p.role === 'Recruiter' || p.role === 'Support';
                }
                
                // If different company/booth: show Support users only (Support and GlobalSupport)
                return isSupport;
            }
            
            // For interpreters: only show Support and Interpreter users
            // This applies to both online and offline users - online/offline only affects sorting
            if (user?.role === 'Interpreter') {
                const isSupport = p.role === 'Support' || p.role === 'GlobalSupport';
                const isInterpreter = p.role === 'Interpreter' || p.role === 'GlobalInterpreter';
                return isSupport || isInterpreter;
            }
            
            // For global interpreters: only show GlobalSupport and GlobalInterpreter users (NOT Support)
            // This applies to both online and offline users - online/offline only affects sorting
            if (user?.role === 'GlobalInterpreter') {
                // Explicitly check for GlobalSupport and GlobalInterpreter only, exclude Support
                return p.role === 'GlobalSupport' || p.role === 'GlobalInterpreter';
            }
            
            // For GlobalSupport: show all participants returned by backend (already event-filtered)
            if (user?.role === 'GlobalSupport') {
                // Backend already filters by event - allow all returned participants
                return true;
            }
            
            // For support users: only show Support, Recruiter, and Interpreter from same booth, plus GlobalSupport and GlobalInterpreter
            // This applies to both online and offline users - online/offline only affects sorting
            if (user?.role === 'Support' && user?.assignedBooth) {
                const userBoothId = user.assignedBooth._id?.toString() || user.assignedBooth.toString();
                const participantBoothId = p.assignedBooth?._id?.toString() || p.assignedBooth?.toString();
                const isSameCompany = participantBoothId && participantBoothId === userBoothId;
                const isGlobalSupport = p.role === 'GlobalSupport';
                const isGlobalInterpreter = p.role === 'GlobalInterpreter';
                
                // If same company/booth: show Support, Recruiters, and Interpreters
                if (isSameCompany) {
                    return p.role === 'Support' || p.role === 'Recruiter' || p.role === 'Interpreter';
                }
                
                // If different company/booth: show GlobalSupport and GlobalInterpreter only
                return isGlobalSupport || isGlobalInterpreter;
            }
            
            // For non-recruiters, non-interpreters, and non-support, show all participants (existing behavior)
            return true;
        })
        .sort((a, b) => {
            const aOnline = onlineUsers.has(a._id);
            const bOnline = onlineUsers.has(b._id);
            if (aOnline === bOnline) {
                return a.name.localeCompare(b.name);
            }
            return aOnline ? -1 : 1;
        });

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
                    <div className="team-chat-header-actions">
                        {user?.role === 'GlobalSupport' && (
                            <button
                                className={`team-chat-new-btn team-chat-broadcast-btn ${showBroadcastComposer ? 'active' : ''}`}
                                onClick={() => setShowBroadcastComposer(!showBroadcastComposer)}
                                aria-label="Broadcast message to all event users"
                                title="Broadcast message to all event users"
                            >
                                📣
                            </button>
                        )}
                        <button
                            className="team-chat-new-btn"
                            onClick={() => setShowNewChat(!showNewChat)}
                            aria-label="Start new chat"
                        >
                            {showNewChat ? '✕' : '+'}
                        </button>
                    </div>
                </div>

                <div className="team-chat-search">
                    {user?.role === 'GlobalSupport' && showBroadcastComposer && (
                        <div className="team-chat-broadcast-composer">
                            <label htmlFor="team-chat-broadcast-message">Broadcast to event users</label>
                            <textarea
                                id="team-chat-broadcast-message"
                                value={broadcastMessage}
                                onChange={(e) => setBroadcastMessage(e.target.value)}
                                rows={3}
                                maxLength={5000}
                                placeholder="Type a message to broadcast to everyone in this event..."
                            />
                            <button
                                type="button"
                                className="team-chat-broadcast-send"
                                onClick={handleBroadcastMessage}
                                disabled={broadcasting || !broadcastMessage.trim()}
                            >
                                {broadcasting ? 'Sending...' : 'Send Broadcast'}
                            </button>
                        </div>
                    )}
                    {canSetTeamChatStatus && (
                        <div className="team-chat-status-controls team-chat-status-controls-sidebar">
                            <label htmlFor="team-chat-status-select">Your status</label>
                            <select
                                id="team-chat-status-select"
                                value={myChatStatus}
                                onChange={(e) => handleSetMyChatStatus(e.target.value)}
                                disabled={chatStatusUpdating}
                                aria-label="Set your team chat status"
                            >
                                {TEAM_CHAT_STATUS_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
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
                                    const participantStatus = getEffectiveChatStatus(participant._id);
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
                                                <span className={`team-chat-status-indicator ${participantStatus}`} />
                                            </div>
                                            <div className="team-chat-info">
                                                <div className="team-chat-name">
                                                    {participant.name} ({participant.role})
                                                </div>
                                                {getBoothDisplayName(participant.assignedBooth) && (
                                                    <div className="team-chat-booth-name">
                                                        {getBoothDisplayName(participant.assignedBooth)}
                                                    </div>
                                                )}
                                                <div className={`team-chat-status ${participantStatus}`}>
                                                    {TEAM_CHAT_STATUS_OPTIONS.find(option => option.value === participantStatus)?.label || 'Offline'}
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
                                    const chatStatus = getEffectiveChatStatus(otherUserId);
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
                                                    <span className={`team-chat-status-indicator ${chatStatus}`} />
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
                                                {getChatBoothName(chat) && (
                                                    <div className="team-chat-booth-name">
                                                        {getChatBoothName(chat)}
                                                    </div>
                                                )}
                                                {chat.type === 'direct' && (
                                                    <div className={`team-chat-status ${chatStatus}`}>
                                                        {TEAM_CHAT_STATUS_OPTIONS.find(option => option.value === chatStatus)?.label || 'Offline'}
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
                                                const chatStatus = getEffectiveChatStatus(otherUserId);

                                                // Check if user is typing
                                                if (typingUsers.size > 0) {
                                                    const typingNames = Array.from(typingUsers.values());
                                                    return `${typingNames.join(', ')} ${typingNames.length === 1 ? 'is' : 'are'} typing...`;
                                                }

                                                return TEAM_CHAT_STATUS_OPTIONS.find(option => option.value === chatStatus)?.label || 'Offline';
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
