import { validateContentLength } from './videoContentProcessor';

/**
 * Validate event form data
 * @param {object} eventData - The event data to validate
 * @returns {object} - { isValid, errors }
 */
export function validateEventData(eventData) {
    const errors = {};
    let isValid = true;

    // Validate name
    if (!eventData.name || eventData.name.trim().length < 2) {
        errors.name = 'Event name must be at least 2 characters';
        isValid = false;
    } else if (eventData.name.length > 200) {
        errors.name = 'Event name cannot exceed 200 characters';
        isValid = false;
    }

    // Validate description with video compression
    if (eventData.description) {
        const validation = validateContentLength(eventData.description, 1000);
        if (!validation.isValid) {
            errors.description = `Description cannot exceed ${validation.limit} characters (currently ${validation.compressedCount} after video compression)`;
            isValid = false;
        }
    }

    // Validate dates
    if (!eventData.start) {
        errors.start = 'Start date is required';
        isValid = false;
    }

    if (!eventData.end) {
        errors.end = 'End date is required';
        isValid = false;
    }

    if (eventData.start && eventData.end) {
        const startDate = new Date(eventData.start);
        const endDate = new Date(eventData.end);
        
        if (endDate <= startDate) {
            errors.end = 'End date must be after start date';
            isValid = false;
        }
    }

    // Validate limits
    if (eventData.limits) {
        if (eventData.limits.maxBooths !== undefined && eventData.limits.maxBooths < 0) {
            errors.maxBooths = 'Max booths must be non-negative';
            isValid = false;
        }
        
        if (eventData.limits.maxRecruitersPerEvent !== undefined && eventData.limits.maxRecruitersPerEvent < 0) {
            errors.maxRecruitersPerEvent = 'Max recruiters per event must be non-negative';
            isValid = false;
        }
    }

    // Validate logo URL
    if (eventData.logoUrl && !isValidUrl(eventData.logoUrl)) {
        errors.logoUrl = 'Logo URL must be a valid URL';
        isValid = false;
    }

    // Validate link URL
    if (eventData.link && !isValidUrl(eventData.link)) {
        errors.link = 'Event link must be a valid URL';
        isValid = false;
    }

    return { isValid, errors };
}

/**
 * Simple URL validation
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid URL
 */
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get validation message for description field
 * @param {string} description - The description content
 * @returns {string|null} - Validation message or null if valid
 */
export function getDescriptionValidationMessage(description) {
    if (!description) return null;
    
    const validation = validateContentLength(description, 1000);
    if (!validation.isValid) {
        return `Description cannot exceed ${validation.limit} characters (currently ${validation.compressedCount} after video compression)`;
    }
    
    return null;
}