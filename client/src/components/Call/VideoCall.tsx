import React, { useEffect, useRef, useState, useCallback } from 'react';
import { connect, Room, LocalVideoTrack, LocalAudioTrack, RemoteParticipant } from '@twilio/video';
import { useSocket } from '../../contexts/SocketContext';
import { useAccessibilityAnnouncer } from '../Accessibility/AccessibilityAnnouncer';
import Button from '../UI/Button';

// Types
interface VideoCallProps {
    meetingId: string;
    twilioRoomId: string;
    accessToken: string;
    userRole: 'recruiter' | 'jobseeker' | 'interpreter';
    onCallEnd: () => void;
    onInterpreterRequest: (reason?: string, language?: string) => void;
}

interface CallParticipant {
    userId: string;
    user: {
        _id: string;
        name: string;
        email: string;
        role: string;
    };
    role: string;
}

const VideoCall: React.FC<VideoCallProps> = ({
    meetingId,
    twilioRoomId,
    accessToken,
    userRole,
    onCallEnd,
    onInterpreterRequest,
}) => {
    const { joinCallRoom, leaveCallRoom, sendCallMessage, onCallParticipants, onCallMessage, onParticipantJoined, onParticipantLeft, off } = useSocket();
    const { announce } = useAccessibilityAnnouncer();

    const [room, setRoom] = useState<Room | null>(null);
    const [participants, setParticipants] = useState<CallParticipant[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});
    const localTracksRef = useRef<{ video?: LocalVideoTrack; audio?: LocalAudioTrack }>({});

    // Connect to Twilio room
    const connectToRoom = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const room = await connect(accessToken, {
                name: twilioRoomId,
                audio: true,
                video: { width: 1280, height: 720 },
            });

            setRoom(room);
            setIsConnected(true);
            announce('Connected to video call', 'polite');

            // Handle local tracks
            room.localParticipant.videoTracks.forEach(publication => {
                if (publication.track) {
                    localTracksRef.current.video = publication.track;
                    if (localVideoRef.current) {
                        publication.track.attach(localVideoRef.current);
                    }
                }
            });

            room.localParticipant.audioTracks.forEach(publication => {
                if (publication.track) {
                    localTracksRef.current.audio = publication.track;
                }
            });

            // Handle remote participants
            room.participants.forEach(participant => {
                handleParticipantConnected(participant);
            });

            // Event listeners
            room.on('participantConnected', handleParticipantConnected);
            room.on('participantDisconnected', handleParticipantDisconnected);
            room.on('disconnected', handleRoomDisconnected);

        } catch (error: any) {
            console.error('Failed to connect to room:', error);
            setError(error.message || 'Failed to connect to video call');
            announce('Failed to connect to video call', 'assertive');
        } finally {
            setIsLoading(false);
        }
    }, [accessToken, twilioRoomId, announce]);

    // Handle participant connected
    const handleParticipantConnected = useCallback((participant: RemoteParticipant) => {
        console.log('Participant connected:', participant.identity);
        announce(`${participant.identity} joined the call`, 'polite');

        // Handle participant's tracks
        participant.tracks.forEach(publication => {
            if (publication.track) {
                handleTrackSubscribed(publication.track, participant);
            }
        });

        participant.on('trackSubscribed', (track) => {
            handleTrackSubscribed(track, participant);
        });

        participant.on('trackUnsubscribed', (track) => {
            handleTrackUnsubscribed(track, participant);
        });
    }, [announce]);

    // Handle participant disconnected
    const handleParticipantDisconnected = useCallback((participant: RemoteParticipant) => {
        console.log('Participant disconnected:', participant.identity);
        announce(`${participant.identity} left the call`, 'polite');

        // Remove video element
        const videoElement = remoteVideoRefs.current[participant.identity];
        if (videoElement) {
            videoElement.remove();
            delete remoteVideoRefs.current[participant.identity];
        }
    }, [announce]);

    // Handle track subscribed
    const handleTrackSubscribed = useCallback((track: any, participant: RemoteParticipant) => {
        if (track.kind === 'video') {
            const videoElement = document.createElement('video');
            videoElement.setAttribute('id', `remote-video-${participant.identity}`);
            videoElement.setAttribute('autoplay', 'true');
            videoElement.setAttribute('playsInline', 'true');
            videoElement.setAttribute('aria-label', `Video from ${participant.identity}`);

            const container = document.getElementById('remote-videos');
            if (container) {
                container.appendChild(videoElement);
                remoteVideoRefs.current[participant.identity] = videoElement;
                track.attach(videoElement);
            }
        }
    }, []);

    // Handle track unsubscribed
    const handleTrackUnsubscribed = useCallback((track: any, participant: RemoteParticipant) => {
        track.detach();
        const videoElement = remoteVideoRefs.current[participant.identity];
        if (videoElement) {
            videoElement.remove();
            delete remoteVideoRefs.current[participant.identity];
        }
    }, []);

    // Handle room disconnected
    const handleRoomDisconnected = useCallback((room: Room) => {
        console.log('Room disconnected');
        announce('Call ended', 'polite');
        setIsConnected(false);
        setRoom(null);
        onCallEnd();
    }, [announce, onCallEnd]);

    // Toggle mute
    const toggleMute = useCallback(() => {
        if (localTracksRef.current.audio) {
            if (isMuted) {
                localTracksRef.current.audio.enable();
                setIsMuted(false);
                announce('Microphone unmuted', 'polite');
            } else {
                localTracksRef.current.audio.disable();
                setIsMuted(true);
                announce('Microphone muted', 'polite');
            }
        }
    }, [isMuted, announce]);

    // Toggle video
    const toggleVideo = useCallback(() => {
        if (localTracksRef.current.video) {
            if (isVideoEnabled) {
                localTracksRef.current.video.disable();
                setIsVideoEnabled(false);
                announce('Camera turned off', 'polite');
            } else {
                localTracksRef.current.video.enable();
                setIsVideoEnabled(true);
                announce('Camera turned on', 'polite');
            }
        }
    }, [isVideoEnabled, announce]);

    // End call
    const endCall = useCallback(async () => {
        if (room) {
            room.disconnect();
        }
    }, [room]);

    // Request interpreter
    const handleInterpreterRequest = useCallback(() => {
        onInterpreterRequest('Interpreter assistance needed', 'English');
    }, [onInterpreterRequest]);

    // Initialize call
    useEffect(() => {
        connectToRoom();

        // Join socket room for chat and other features
        joinCallRoom(meetingId, twilioRoomId);

        return () => {
            if (room) {
                room.disconnect();
            }
            leaveCallRoom(meetingId);
        };
    }, [connectToRoom, joinCallRoom, leaveCallRoom, meetingId, twilioRoomId]);

    // Listen for socket events
    useEffect(() => {
        const handleCallParticipants = (participants: CallParticipant[]) => {
            setParticipants(participants);
        };

        const handleParticipantJoined = (participant: CallParticipant) => {
            setParticipants(prev => [...prev, participant]);
            announce(`${participant.user.name} joined the call`, 'polite');
        };

        const handleParticipantLeft = (participant: CallParticipant) => {
            setParticipants(prev => prev.filter(p => p.userId !== participant.userId));
            announce(`${participant.user.name} left the call`, 'polite');
        };

        onCallParticipants(handleCallParticipants);
        onParticipantJoined(handleParticipantJoined);
        onParticipantLeft(handleParticipantLeft);

        return () => {
            off('call-participants', handleCallParticipants);
            off('participant-joined', handleParticipantJoined);
            off('participant-left', handleParticipantLeft);
        };
    }, [onCallParticipants, onParticipantJoined, onParticipantLeft, off, announce]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Connecting to call...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                <h3 className="text-lg font-semibold text-red-800 mb-2">Connection Error</h3>
                <p className="text-red-600 mb-4">{error}</p>
                <Button onClick={connectToRoom} variant="primary">
                    Try Again
                </Button>
            </div>
        );
    }

    return (
        <div className="video-call bg-gray-900 text-white rounded-lg overflow-hidden">
            {/* Video Grid */}
            <div className="relative h-96 bg-gray-800">
                {/* Remote Videos */}
                <div id="remote-videos" className="absolute inset-0 grid grid-cols-2 gap-2 p-2">
                    {/* Remote videos will be dynamically added here */}
                </div>

                {/* Local Video */}
                <div className="absolute bottom-4 right-4 w-32 h-24 bg-gray-700 rounded-lg overflow-hidden">
                    <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                        aria-label="Your video"
                    />
                    {!isVideoEnabled && (
                        <div className="absolute inset-0 bg-gray-600 flex items-center justify-center">
                            <span className="text-sm">Camera Off</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Call Controls */}
            <div className="bg-gray-800 p-4">
                <div className="flex items-center justify-center space-x-4">
                    {/* Mute Button */}
                    <Button
                        onClick={toggleMute}
                        variant={isMuted ? 'danger' : 'secondary'}
                        size="small"
                        aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                    >
                        {isMuted ? (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.793L5.5 14.5H3a1 1 0 01-1-1V6.5a1 1 0 011-1h2.5l2.883-2.293a1 1 0 011.617.793zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.793L5.5 14.5H3a1 1 0 01-1-1V6.5a1 1 0 011-1h2.5l2.883-2.293a1 1 0 011.617.793z" clipRule="evenodd" />
                            </svg>
                        )}
                    </Button>

                    {/* Video Button */}
                    <Button
                        onClick={toggleVideo}
                        variant={isVideoEnabled ? 'secondary' : 'danger'}
                        size="small"
                        aria-label={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
                    >
                        {isVideoEnabled ? (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                                <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                            </svg>
                        )}
                    </Button>

                    {/* Interpreter Request Button (for recruiters) */}
                    {userRole === 'recruiter' && (
                        <Button
                            onClick={handleInterpreterRequest}
                            variant="secondary"
                            size="small"
                            aria-label="Request interpreter"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
                            </svg>
                        </Button>
                    )}

                    {/* End Call Button */}
                    <Button
                        onClick={endCall}
                        variant="danger"
                        size="small"
                        aria-label="End call"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" clipRule="evenodd" />
                        </svg>
                    </Button>
                </div>
            </div>

            {/* Participants List */}
            <div className="bg-gray-700 p-4">
                <h3 className="text-sm font-semibold mb-2">Participants ({participants.length})</h3>
                <div className="space-y-1">
                    {participants.map(participant => (
                        <div key={participant.userId} className="text-sm">
                            <span className="font-medium">{participant.user.name}</span>
                            <span className="text-gray-400 ml-2">({participant.role})</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default VideoCall;
