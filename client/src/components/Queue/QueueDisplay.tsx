import React, { useEffect, useState } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { useAccessibilityAnnouncer } from '../Accessibility/AccessibilityAnnouncer';
import Button from '../UI/Button';

// Types
interface QueueStatus {
    queueId: string;
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
}

interface UserPosition {
    tokenNumber: number;
    position: number;
    status: string;
    joinedAt: string;
    estimatedWaitTime: number;
}

interface QueueDisplayProps {
    queueId: string;
    userPosition: UserPosition | null;
    onJoinQueue: () => void;
    onLeaveQueue: () => void;
    isInQueue: boolean;
    boothName: string;
    eventName: string;
}

const QueueDisplay: React.FC<QueueDisplayProps> = ({
    queueId,
    userPosition,
    onJoinQueue,
    onLeaveQueue,
    isInQueue,
    boothName,
    eventName,
}) => {
    const { joinQueueRoom, leaveQueueRoom, onQueueUpdate, off } = useSocket();
    const { announce } = useAccessibilityAnnouncer();
    const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Join queue room for real-time updates
    useEffect(() => {
        if (queueId) {
            joinQueueRoom(queueId);
        }

        return () => {
            if (queueId) {
                leaveQueueRoom(queueId);
            }
        };
    }, [queueId, joinQueueRoom, leaveQueueRoom]);

    // Listen for queue updates
    useEffect(() => {
        const handleQueueUpdate = (update: { queueId: string; status: QueueStatus; timestamp: string }) => {
            if (update.queueId === queueId) {
                setQueueStatus(update.status);

                // Announce important updates to screen readers
                if (update.status.currentServing !== queueStatus?.currentServing) {
                    announce(`Now serving token number ${update.status.currentServing}`, 'assertive');
                }

                if (userPosition && update.status.currentServing === userPosition.tokenNumber) {
                    announce('You are now being served!', 'assertive');
                }
            }
        };

        onQueueUpdate(handleQueueUpdate);

        return () => {
            off('queue-update', handleQueueUpdate);
        };
    }, [queueId, queueStatus, userPosition, onQueueUpdate, off, announce]);

    const handleJoinQueue = async () => {
        setIsLoading(true);
        try {
            await onJoinQueue();
            announce('Successfully joined the queue', 'polite');
        } catch (error) {
            announce('Failed to join queue', 'assertive');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLeaveQueue = async () => {
        setIsLoading(true);
        try {
            await onLeaveQueue();
            announce('Left the queue', 'polite');
        } catch (error) {
            announce('Failed to leave queue', 'assertive');
        } finally {
            setIsLoading(false);
        }
    };

    const formatWaitTime = (minutes: number): string => {
        if (minutes < 60) {
            return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        if (remainingMinutes === 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''}`;
        }
        return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
    };

    const formatTime = (dateString: string): string => {
        return new Date(dateString).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="queue-display bg-white rounded-lg shadow-lg p-6 space-y-6">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {boothName}
                </h2>
                <p className="text-gray-600">{eventName}</p>
            </div>

            {/* Current Status */}
            <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-center">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        Current Status
                    </h3>
                    <div className="text-3xl font-bold text-blue-600 mb-1" aria-live="polite">
                        {queueStatus?.currentServing || 0}
                    </div>
                    <p className="text-sm text-gray-600">Now Serving</p>
                </div>
            </div>

            {/* User Position */}
            {userPosition && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-blue-900 mb-2">
                        Your Position
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                            <div className="text-2xl font-bold text-blue-600">
                                {userPosition.tokenNumber}
                            </div>
                            <p className="text-sm text-blue-700">Your Token</p>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-blue-600">
                                {userPosition.position}
                            </div>
                            <p className="text-sm text-blue-700">Position in Queue</p>
                        </div>
                    </div>
                    <div className="mt-3 text-center">
                        <p className="text-sm text-blue-700">
                            Estimated wait: {formatWaitTime(userPosition.estimatedWaitTime)}
                        </p>
                        <p className="text-xs text-blue-600">
                            Joined at {formatTime(userPosition.joinedAt)}
                        </p>
                    </div>
                </div>
            )}

            {/* Queue Statistics */}
            {queueStatus && (
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-gray-900">
                            {queueStatus.currentLength}
                        </div>
                        <p className="text-sm text-gray-600">People Waiting</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-gray-900">
                            {formatWaitTime(queueStatus.estimatedWaitTime)}
                        </div>
                        <p className="text-sm text-gray-600">Est. Wait Time</p>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
                {!isInQueue ? (
                    <Button
                        onClick={handleJoinQueue}
                        loading={isLoading}
                        fullWidth
                        size="large"
                        className="bg-green-600 hover:bg-green-700 focus:ring-green-500"
                    >
                        Join Queue
                    </Button>
                ) : (
                    <Button
                        onClick={handleLeaveQueue}
                        loading={isLoading}
                        fullWidth
                        size="large"
                        variant="danger"
                    >
                        Leave Queue
                    </Button>
                )}
            </div>

            {/* Queue Status */}
            {queueStatus && (
                <div className="text-center">
                    <p className="text-sm text-gray-600">
                        Queue Status: <span className="font-medium capitalize">{queueStatus.status}</span>
                    </p>
                </div>
            )}

            {/* Accessibility Information */}
            <div className="sr-only" aria-live="polite" aria-atomic="true">
                {queueStatus && (
                    <div>
                        Currently serving token {queueStatus.currentServing}.
                        {userPosition && (
                            <>
                                Your token is {userPosition.tokenNumber} and you are position {userPosition.position} in the queue.
                                Estimated wait time is {formatWaitTime(userPosition.estimatedWaitTime)}.
                            </>
                        )}
                        {queueStatus.currentLength} people are waiting in the queue.
                    </div>
                )}
            </div>
        </div>
    );
};

export default QueueDisplay;
