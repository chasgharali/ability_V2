import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Custom hook to get recruiter/interpreter/support's booth and event information for header logos
 */
export function useRecruiterBooth() {
    const { user } = useAuth();
    const [boothInfo, setBoothInfo] = useState({
        booth: null,
        event: null,
        loading: true,
        error: null
    });

    useEffect(() => {
        async function fetchRecruiterBooth() {
            if (!user || !['Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support'].includes(user.role)) {
                setBoothInfo({
                    booth: null,
                    event: null,
                    loading: false,
                    error: null
                });
                return;
            }

            try {
                setBoothInfo(prev => ({ ...prev, loading: true, error: null }));

                // Get booths where this user is an administrator
                const response = await fetch('/api/booths', {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch booths');
                }

                const data = await response.json();
                
                // Find the first booth where this user is an administrator
                const userBooth = data.booths?.find(booth => 
                    booth.administrators?.includes(user._id)
                );

                if (userBooth) {
                    // Get the full booth details including event
                    const boothResponse = await fetch(`/api/booths/${userBooth._id}`, {
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                        }
                    });

                    if (boothResponse.ok) {
                        const boothData = await boothResponse.json();
                        setBoothInfo({
                            booth: boothData.booth,
                            event: boothData.event,
                            loading: false,
                            error: null
                        });
                    } else {
                        setBoothInfo({
                            booth: null,
                            event: null,
                            loading: false,
                            error: 'Failed to fetch booth details'
                        });
                    }
                } else {
                    // Global Interpreters should never have a booth - they are global
                    if (user.role === 'GlobalInterpreter') {
                        setBoothInfo({
                            booth: null,
                            event: null,
                            loading: false,
                            error: null
                        });
                        return;
                    }
                    
                    // For other roles, only try assignedBooth if it exists (don't fallback to random booth)
                    let fallbackBooth = null;
                    
                    // Only use user's assignedBooth field if it exists (for unassigned recruiters, this will be null)
                    if (user.assignedBooth) {
                        fallbackBooth = data.booths?.find(booth => booth._id === user.assignedBooth);
                    }
                    
                    if (fallbackBooth) {
                        // Get the full booth details including event
                        const boothResponse = await fetch(`/api/booths/${fallbackBooth._id}`, {
                            headers: {
                                'Authorization': `Bearer ${localStorage.getItem('token')}`
                            }
                        });

                        if (boothResponse.ok) {
                            const boothData = await boothResponse.json();
                            setBoothInfo({
                                booth: boothData.booth,
                                event: boothData.event,
                                loading: false,
                                error: null
                            });
                        } else {
                            setBoothInfo({
                                booth: null,
                                event: null,
                                loading: false,
                                error: 'Failed to fetch assigned booth details'
                            });
                        }
                    } else {
                        setBoothInfo({
                            booth: null,
                            event: null,
                            loading: false,
                            error: null
                        });
                    }
                }
            } catch (error) {
                console.error('Error fetching recruiter booth:', error);
                setBoothInfo({
                    booth: null,
                    event: null,
                    loading: false,
                    error: error.message
                });
            }
        }

        fetchRecruiterBooth();
    }, [user]);

    return boothInfo;
}

export default useRecruiterBooth;
