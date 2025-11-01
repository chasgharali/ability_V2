import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Custom hook to get recruiter's booth and event information for header logos
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
            if (!user || user.role !== 'Recruiter') {
                console.log('useRecruiterBooth: Not a recruiter or no user', { user: user?.role });
                setBoothInfo({
                    booth: null,
                    event: null,
                    loading: false,
                    error: null
                });
                return;
            }

            try {
                console.log('useRecruiterBooth: Fetching booth for recruiter', user._id);
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
                console.log('useRecruiterBooth: All booths:', data.booths);
                
                // Find the first booth where this user is an administrator
                const userBooth = data.booths?.find(booth => 
                    booth.administrators?.includes(user._id)
                );

                console.log('useRecruiterBooth: Found user booth:', userBooth);

                if (userBooth) {
                    // Get the full booth details including event
                    const boothResponse = await fetch(`/api/booths/${userBooth._id}`, {
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                        }
                    });

                    if (boothResponse.ok) {
                        const boothData = await boothResponse.json();
                        console.log('useRecruiterBooth: Booth details:', boothData);
                        console.log('useRecruiterBooth: Event logo:', boothData.event?.logoUrl);
                        console.log('useRecruiterBooth: Booth logo:', boothData.booth?.logoUrl);
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
                    // No booth found for this recruiter - try to get any booth as fallback
                    console.log('useRecruiterBooth: No booth found for this recruiter, trying fallback');
                    
                    // Dynamic fallback: check if user has assignedBooth field
                    let fallbackBooth = null;
                    
                    // 1. First try to use user's assignedBooth field if it exists
                    if (user.assignedBooth) {
                        fallbackBooth = data.booths?.find(booth => booth._id === user.assignedBooth);
                        console.log('useRecruiterBooth: Found booth via user.assignedBooth:', fallbackBooth?.name);
                    }
                    
                    // 2. If no assignedBooth or booth not found, use first available booth with logo
                    if (!fallbackBooth) {
                        fallbackBooth = data.booths?.find(booth => booth.logoUrl) || data.booths?.[0];
                        console.log('useRecruiterBooth: Using first available booth:', fallbackBooth?.name);
                    }
                    
                    console.log('useRecruiterBooth: Available booths:', data.booths?.map(b => ({ 
                    name: b.name, 
                    logoUrl: b.logoUrl, 
                    administrators: b.administrators,
                    _id: b._id 
                })));
                console.log('useRecruiterBooth: Current user ID:', user._id);
                    
                    if (fallbackBooth) {
                        console.log('useRecruiterBooth: Using fallback booth:', fallbackBooth.name);
                        // Get the full booth details including event
                        const boothResponse = await fetch(`/api/booths/${fallbackBooth._id}`, {
                            headers: {
                                'Authorization': `Bearer ${localStorage.getItem('token')}`
                            }
                        });

                        if (boothResponse.ok) {
                            const boothData = await boothResponse.json();
                            console.log('useRecruiterBooth: Fallback booth details:', boothData);
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
                                error: 'Failed to fetch fallback booth details'
                            });
                        }
                    } else {
                        // No booth found for this recruiter
                        console.log('useRecruiterBooth: No booths available at all');
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
