import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { io } from 'socket.io-client';
import * as chatAPI from '../../services/chat';
import { ChatUIComponent, MessageSendEventArgs } from '@syncfusion/ej2-react-interactive-chat';
import { getSocketUrl } from '../../utils/apiConfig';
import './Chat.css';

const Chat = () => {
    const { user } = useAuth();
    const [chats, setChats] = useState([]);
    const [selectedChat, setSelectedChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [participants, setParticipants] = useState([]);
    const [showNewChat, setShowNewChat] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [typingUsers, setTypingUsers] = useState(new Set());
    const [onlineUsers, setOnlineUsers] = useState(new Set());

    const socketRef = useRef(null);
    const chatRef = useRef(null);

    // Initialize socket connection
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;

        const socketUrl = getSocketUrl();
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
            console.log('Chat socket connected');
        });

        socketRef.current.on('new-message', (data) => {
            if (data.chatId === selectedChat?._id) {
                const newMsg = convertToSyncfusionMessage(data.message);
                setMessages(prev => [...prev, newMsg]);
            }
            // Update chat list
            setChats(prevChats => prevChats.map(chat =>
                chat._id === data.chatId
                    ? { ...chat, lastMessage: data.message }
                    : chat
            ));
        });

        socketRef.current.on('user-online', (data) => {
            setOnlineUsers(prev => new Set(prev).add(data.userId));
        });

        socketRef.current.on('user-offline', (data) => {
            setOnlineUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(data.userId);
                return newSet;
            });
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [selectedChat?._id]);

    useEffect(() => {
        loadChats();
        loadParticipants();
    }, []);

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
        // Syncfusion passes message text in args.message.text property
        const messageText = args?.message?.text || args?.text || '';

        if (!selectedChat || !messageText.trim()) return;

        const content = messageText.trim();

        try {
            if (socketRef.current) {
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

    const getChatAvatar = (chat) => {
        if (chat.type === 'direct') {
            const otherParticipant = chat.participants.find(
                p => p.user._id !== user._id
            );
            return otherParticipant?.user?.avatarUrl || null;
        }
        return chat.booth?.logoUrl || null;
    };

    const filteredChats = chats.filter(chat =>
        getChatTitle(chat).toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredParticipants = participants.filter(p =>
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
                            {filteredParticipants.map(participant => (
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
                                        <span className={`team-chat-status-indicator ${onlineUsers.has(participant._id) ? 'online' : 'offline'}`} />
                                    </div>
                                    <div className="team-chat-info">
                                        <div className="team-chat-name">{participant.name}</div>
                                        <div className="team-chat-role">{participant.role}</div>
                                    </div>
                                </div>
                            ))}
                        </>
                    ) : (
                        <>
                            {filteredChats.length === 0 ? (
                                <div className="team-chat-empty-state">
                                    No chats yet. Click + to start a new conversation.
                                </div>
                            ) : (
                                filteredChats.map(chat => (
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
                                            {chat.type === 'direct' && (() => {
                                                const otherParticipant = chat.participants.find(p => p.user._id !== user._id);
                                                return otherParticipant && (
                                                    <span className={`team-chat-status-indicator ${onlineUsers.has(otherParticipant.user._id) ? 'online' : 'offline'}`} />
                                                );
                                            })()}
                                        </div>
                                        <div className="team-chat-info">
                                            <div className="team-chat-header-row">
                                                <div className="team-chat-name">{getChatTitle(chat)}</div>
                                                {chat.unreadCount > 0 && (
                                                    <span className="team-chat-unread-badge">{chat.unreadCount}</span>
                                                )}
                                            </div>
                                            {chat.lastMessage && (
                                                <div className="team-chat-last-message">
                                                    {chat.lastMessage.content}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
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
                                    <div className="team-chat-title">{getChatTitle(selectedChat)}</div>
                                    <div className="team-chat-subtitle">
                                        {selectedChat.type === 'direct' ? 'Direct Message' : 'Group Chat'}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <ChatUIComponent
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

export default Chat;
