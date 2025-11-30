import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getSocketUrl } from '../utils/apiConfig';

const SocketContext = createContext();

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState(null);
    const { user } = useAuth();
    const socketRef = useRef(null);

    useEffect(() => {
        // Only connect if user is authenticated
        const token = sessionStorage.getItem('token');
        
        if (!token || !user) {
            // Clean up any existing socket connection
            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
                setSocket(null);
                setConnected(false);
            }
            return;
        }

        // Initialize socket connection with auth token in handshake
        const socketUrl = getSocketUrl();
        // Determine if we're connecting to localhost (development)
        const isLocalhost = socketUrl.includes('localhost') || socketUrl.includes('127.0.0.1');
        
        const newSocket = io(socketUrl, {
            transports: ['websocket', 'polling'],
            timeout: 20000,
            forceNew: true,
            withCredentials: true,
            // In development, explicitly use non-secure WebSocket
            secure: !isLocalhost,
            // Reject unauthorized SSL certificates in production only
            rejectUnauthorized: !isLocalhost,
            // Send raw token; server will also handle optional 'Bearer ' prefix defensively
            auth: { token }
        });

        // Connection event handlers
        newSocket.on('connect', () => {
            console.log('Socket connected:', newSocket.id);
            setConnected(true);
            setError(null);
        });

        newSocket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            setConnected(false);
        });

        newSocket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            setError('Connection failed');
            setConnected(false);
        });

        newSocket.on('error', (error) => {
            console.error('Socket error:', error);
            setError(error.message || 'Socket error');
        });

        socketRef.current = newSocket;
        setSocket(newSocket);

        // Cleanup on unmount
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }
        };
        // Recreate socket whenever auth state changes (login/logout)
    }, [user]);

    // Queue-related socket methods
    const joinQueue = (boothId, eventId) => {
        if (socket && connected) {
            socket.emit('join-queue', { boothId, eventId });
        }
    };

    const leaveQueue = (queueId, reason) => {
        if (socket && connected) {
            socket.emit('leave-queue', { queueId, reason });
        }
    };

    const subscribeToQueueUpdates = (queueId, callback) => {
        if (socket && connected) {
            socket.on(`queue-update-${queueId}`, callback);
        }
    };

    const unsubscribeFromQueueUpdates = (queueId, callback) => {
        if (socket && connected) {
            socket.off(`queue-update-${queueId}`, callback);
        }
    };

    // Call-related socket methods
    const joinCall = (roomId, userRole) => {
        if (socket && connected) {
            socket.emit('join-call', { roomId, userRole });
        }
    };

    const leaveCall = (roomId) => {
        if (socket && connected) {
            socket.emit('leave-call', { roomId });
        }
    };

    const requestInterpreter = (meetingId, interpreterType) => {
        if (socket && connected) {
            socket.emit('request-interpreter', { meetingId, interpreterType });
        }
    };

    const acceptInterpreterRequest = (meetingId) => {
        if (socket && connected) {
            socket.emit('accept-interpreter-request', { meetingId });
        }
    };

    // Chat-related socket methods
    const sendMessage = (roomId, message, type = 'text') => {
        if (socket && connected) {
            socket.emit('send-message', { roomId, message, type });
        }
    };

    const subscribeToMessages = (roomId, callback) => {
        if (socket && connected) {
            socket.on(`messages-${roomId}`, callback);
        }
    };

    const unsubscribeFromMessages = (roomId, callback) => {
        if (socket && connected) {
            socket.off(`messages-${roomId}`, callback);
        }
    };

    const value = {
        socket,
        connected,
        error,
        joinQueue,
        leaveQueue,
        subscribeToQueueUpdates,
        unsubscribeFromQueueUpdates,
        joinCall,
        leaveCall,
        requestInterpreter,
        acceptInterpreterRequest,
        sendMessage,
        subscribeToMessages,
        unsubscribeFromMessages
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
};
