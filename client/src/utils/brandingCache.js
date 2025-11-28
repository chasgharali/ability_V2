// Simple module-level cache for branding logo to prevent fetching on every page
let cachedLogo = null;
let fetchPromise = null;

export const getBrandingLogo = async () => {
  // Return cached value immediately if available
  if (cachedLogo !== null) {
    return cachedLogo;
  }

  // If a fetch is already in progress, return that promise
  if (fetchPromise) {
    return fetchPromise;
  }

  // Start new fetch and cache it
  fetchPromise = (async () => {
    try {
      const settingsAPI = (await import('../services/settings')).default;
      const response = await settingsAPI.getSetting('branding_logo');
      if (response.success && response.value) {
        cachedLogo = response.value;
        return response.value;
      }
      cachedLogo = '';
      return '';
    } catch (error) {
      console.log('No branding logo set');
      cachedLogo = '';
      return '';
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
};

export const clearBrandingLogoCache = () => {
  cachedLogo = null;
  fetchPromise = null;
};



