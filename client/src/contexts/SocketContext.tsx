import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

// Types
interface QueueUpdate {
    queueId: string;
    status: {
        currentServing: number;
        nextToken: number;
        currentLength: number;
        estimatedWaitTime: number;
        status: string;
        servingEntry?: {
            tokenNumber: number;
            userId: string;
            servedAt: string;
        };
        waitingEntries: Array<{
            tokenNumber: number;
            userId: string;
            joinedAt: string;
            estimatedWaitTime: number;
        }>;
    };
    timestamp: string;
}

interface CallParticipant {
    userId: string;
    user: {
        _id: string;
        name: string;
        email: string;
        role: string;
        avatarUrl?: string;
    };
    role: string;
}

interface CallMessage {
    userId: string;
    user: {
        _id: string;
        name: string;
        email: string;
        role: string;
    };
    message: string;
    messageType: 'text' | 'file' | 'system';
    timestamp: string;
    attachment?: {
        type: string;
        filename: string;
        s3Url: string;
        mimeType: string;
        size: number;
    };
}

interface InterpreterRequest {
    meetingId: string;
    reason?: string;
    language?: string;
    requestedBy: {
        _id: string;
        name: string;
        email: string;
        role: string;
    };
    boothId: string;
    eventId: string;
}

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
    joinQueueRoom: (queueId: string) => void;
    leaveQueueRoom: (queueId: string) => void;
    joinCallRoom: (meetingId: string, twilioRoomId: string) => void;
    leaveCallRoom: (meetingId: string) => void;
    sendCallMessage: (meetingId: string, message: string, messageType?: 'text' | 'file' | 'system') => void;
    requestInterpreter: (meetingId: string, reason?: string, language?: string) => void;
    acceptInterpreterRequest: (meetingId: string) => void;
    onQueueUpdate: (callback: (update: QueueUpdate) => void) => void;
    onCallParticipants: (callback: (participants: CallParticipant[]) => void) => void;
    onCallMessage: (callback: (message: CallMessage) => void) => void;
    onInterpreterRequest: (callback: (request: InterpreterRequest) => void) => void;
    onParticipantJoined: (callback: (participant: CallParticipant) => void) => void;
    onParticipantLeft: (callback: (participant: CallParticipant) => void) => void;
    off: (event: string, callback?: (...args: any[]) => void) => void;
}

// Create context
const SocketContext = createContext<SocketContextType | undefined>(undefined);

// Provider component
interface SocketProviderProps {
    children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const { user, token } = useAuth();

    // Initialize socket connection
    useEffect(() => {
        if (user && token) {
            const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:5000', {
                auth: {
                    token: token,
                },
                transports: ['websocket', 'polling'],
            });

            // Connection event handlers
            newSocket.on('connect', () => {
                console.log('Socket connected');
                setIsConnected(true);
            });

            newSocket.on('disconnect', (reason) => {
                console.log('Socket disconnected:', reason);
                setIsConnected(false);
            });

            newSocket.on('connect_error', (error) => {
                console.error('Socket connection error:', error);
                setIsConnected(false);
                toast.error('Connection error. Please refresh the page.');
            });

            // Error handling
            newSocket.on('error', (error) => {
                console.error('Socket error:', error);
                toast.error(error.message || 'An error occurred');
            });

            setSocket(newSocket);

            return () => {
                newSocket.close();
                setSocket(null);
                setIsConnected(false);
            };
        } else {
            // Clean up socket if user logs out
            if (socket) {
                socket.close();
                setSocket(null);
                setIsConnected(false);
            }
        }
    }, [user, token]);

    // Queue room management
    const joinQueueRoom = (queueId: string) => {
        if (socket) {
            socket.emit('join-queue-room', { queueId });
        }
    };

    const leaveQueueRoom = (queueId: string) => {
        if (socket) {
            socket.emit('leave-queue-room', { queueId });
        }
    };

    // Call room management
    const joinCallRoom = (meetingId: string, twilioRoomId: string) => {
        if (socket) {
            socket.emit('join-call-room', { meetingId, twilioRoomId });
        }
    };

    const leaveCallRoom = (meetingId: string) => {
        if (socket) {
            socket.emit('leave-call-room', { meetingId });
        }
    };

    // Call messaging
    const sendCallMessage = (meetingId: string, message: string, messageType: 'text' | 'file' | 'system' = 'text') => {
        if (socket) {
            socket.emit('call-message', { meetingId, message, messageType });
        }
    };

    // Interpreter requests
    const requestInterpreter = (meetingId: string, reason?: string, language?: string) => {
        if (socket) {
            socket.emit('request-interpreter', { meetingId, reason, language });
        }
    };

    const acceptInterpreterRequest = (meetingId: string) => {
        if (socket) {
            socket.emit('accept-interpreter-request', { meetingId });
        }
    };

    // Event listeners
    const onQueueUpdate = (callback: (update: QueueUpdate) => void) => {
        if (socket) {
            socket.on('queue-update', callback);
        }
    };

    const onCallParticipants = (callback: (participants: CallParticipant[]) => void) => {
        if (socket) {
            socket.on('call-participants', callback);
        }
    };

    const onCallMessage = (callback: (message: CallMessage) => void) => {
        if (socket) {
            socket.on('call-message', callback);
        }
    };

    const onInterpreterRequest = (callback: (request: InterpreterRequest) => void) => {
        if (socket) {
            socket.on('interpreter-request', callback);
        }
    };

    const onParticipantJoined = (callback: (participant: CallParticipant) => void) => {
        if (socket) {
            socket.on('participant-joined', callback);
        }
    };

    const onParticipantLeft = (callback: (participant: CallParticipant) => void) => {
        if (socket) {
            socket.on('participant-left', callback);
        }
    };

    const off = (event: string, callback?: (...args: any[]) => void) => {
        if (socket) {
            if (callback) {
                socket.off(event, callback);
            } else {
                socket.off(event);
            }
        }
    };

    const value: SocketContextType = {
        socket,
        isConnected,
        joinQueueRoom,
        leaveQueueRoom,
        joinCallRoom,
        leaveCallRoom,
        sendCallMessage,
        requestInterpreter,
        acceptInterpreterRequest,
        onQueueUpdate,
        onCallParticipants,
        onCallMessage,
        onInterpreterRequest,
        onParticipantJoined,
        onParticipantLeft,
        off,
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
};

// Hook to use socket context
export const useSocket = (): SocketContextType => {
    const context = useContext(SocketContext);
    if (context === undefined) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
};

export default SocketContext;
