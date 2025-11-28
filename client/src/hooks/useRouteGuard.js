import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Custom hook to ensure data fetching only happens when component is on the active route
 * Prevents multiple components from fetching data simultaneously
 */
export const useRouteGuard = (routePath, callback, dependencies = []) => {
  const location = useLocation();
  const isActiveRef = useRef(false);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    const isActive = location.pathname === routePath;
    isActiveRef.current = isActive;

    // Only fetch if this is the active route and we haven't fetched yet for this route
    if (isActive && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      if (typeof callback === 'function') {
        callback();
      }
    }

    // Reset fetch flag when route changes away
    if (!isActive) {
      hasFetchedRef.current = false;
    }
  }, [location.pathname, routePath, callback, ...dependencies]);

  return isActiveRef.current;
};

export default useRouteGuard;




