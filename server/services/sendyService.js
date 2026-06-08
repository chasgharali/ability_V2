/**
 * Sendy Service - Email list subscription integration
 *
 * Wraps Sendy's HTTP POST API for subscribing/unsubscribing users
 * and fetching available mailing lists for admin event connection.
 */

const axios = require('axios');
const logger = require('../utils/logger');

class SendyService {
    constructor() {
        this.baseUrl = (process.env.SENDY_URL || '').replace(/\/$/, '');
        this.apiKey = process.env.SENDY_API_KEY || '';
        this.brandId = process.env.SENDY_BRAND_ID || '';
        this.listJobSeekers = process.env.SENDY_LIST_JOB_SEEKERS || '';
        this.listAnnouncements = process.env.SENDY_LIST_ANNOUNCEMENTS || '';

        if (!this.baseUrl || !this.apiKey) {
            logger.warn('Sendy not configured - set SENDY_URL and SENDY_API_KEY in .env to enable list subscriptions');
        } else {
            logger.info('Sendy service initialized');
        }
    }

    isAvailable() {
        return !!(this.baseUrl && this.apiKey);
    }

    /**
     * Subscribe a user to a Sendy list.
     * @param {string} listId - Encrypted Sendy list ID
     * @param {{ email: string, name?: string }} subscriber
     * @returns {Promise<boolean>}
     */
    async subscribe(listId, { email, name }) {
        if (!this.isAvailable() || !listId || !email) {
            return false;
        }

        try {
            const params = new URLSearchParams({
                api_key: this.apiKey,
                email: String(email).trim(),
                list: listId,
                boolean: 'true',
                silent: 'true'
            });
            if (name) {
                params.append('name', String(name).trim());
            }

            const response = await axios.post(
                `${this.baseUrl}/subscribe`,
                params.toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 15000,
                    transformResponse: [(data) => data]
                }
            );

            const body = String(response.data || '').trim();
            const success = body === '1' || body === 'true' || body.toLowerCase().includes('already subscribed');

            if (success) {
                logger.info(`Sendy: subscribed ${email} to list ${listId}`);
            } else {
                logger.warn(`Sendy subscribe returned unexpected response for ${email}: ${body}`);
            }

            return success;
        } catch (error) {
            logger.error(`Sendy subscribe failed for ${email} on list ${listId}:`, error.message);
            return false;
        }
    }

    /**
     * Unsubscribe a user from a Sendy list.
     * @param {string} listId
     * @param {string} email
     * @returns {Promise<boolean>}
     */
    async unsubscribe(listId, email) {
        if (!this.isAvailable() || !listId || !email) {
            return false;
        }

        try {
            const params = new URLSearchParams({
                api_key: this.apiKey,
                email: String(email).trim(),
                list: listId,
                boolean: 'true'
            });

            const response = await axios.post(
                `${this.baseUrl}/unsubscribe`,
                params.toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 15000,
                    transformResponse: [(data) => data]
                }
            );

            const body = String(response.data || '').trim();
            const success = body === '1' || body === 'true';

            if (success) {
                logger.info(`Sendy: unsubscribed ${email} from list ${listId}`);
            } else {
                logger.warn(`Sendy unsubscribe returned unexpected response for ${email}: ${body}`);
            }

            return success;
        } catch (error) {
            logger.error(`Sendy unsubscribe failed for ${email} on list ${listId}:`, error.message);
            return false;
        }
    }

    /**
     * Subscribe a new JobSeeker to global lists.
     * @param {{ email: string, name?: string, subscribeAnnouncements?: boolean }} data
     */
    async subscribeJobSeeker({ email, name, subscribeAnnouncements }) {
        if (!this.isAvailable()) return;

        if (this.listJobSeekers) {
            await this.subscribe(this.listJobSeekers, { email, name });
        }

        if (subscribeAnnouncements && this.listAnnouncements) {
            await this.subscribe(this.listAnnouncements, { email, name });
        }
    }

    /**
     * Sync announcements subscription preference for a JobSeeker.
     * @param {{ email: string, name?: string, subscribeAnnouncements: boolean }} data
     */
    async syncAnnouncementsPreference({ email, name, subscribeAnnouncements }) {
        if (!this.isAvailable() || !this.listAnnouncements) return;

        if (subscribeAnnouncements) {
            await this.subscribe(this.listAnnouncements, { email, name });
        } else {
            await this.unsubscribe(this.listAnnouncements, email);
        }
    }

    /**
     * Fetch all lists for the configured brand.
     * @returns {Promise<Array<{ id: string, name: string }>>}
     */
    async getLists() {
        if (!this.isAvailable()) {
            return [];
        }

        if (!this.brandId) {
            logger.warn('SENDY_BRAND_ID not configured - cannot fetch Sendy lists');
            return [];
        }

        try {
            const params = new URLSearchParams({
                api_key: this.apiKey,
                brand_id: this.brandId,
                include_hidden: 'no'
            });

            const response = await axios.post(
                `${this.baseUrl}/api/lists/get-lists.php`,
                params.toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 15000
                }
            );

            const data = response.data;
            if (!data) return [];

            // Sendy may return an array or an object keyed by list id
            if (Array.isArray(data)) {
                return data
                    .map((item) => ({
                        id: item.id || item.list_id || item.ID || '',
                        name: item.name || item.list_name || item.Name || 'Unnamed list'
                    }))
                    .filter((item) => item.id);
            }

            if (typeof data === 'object') {
                return Object.entries(data).map(([id, name]) => ({
                    id: String(id),
                    name: typeof name === 'string' ? name : (name?.name || 'Unnamed list')
                }));
            }

            return [];
        } catch (error) {
            logger.error('Sendy getLists failed:', error.message);
            return [];
        }
    }
}

module.exports = new SendyService();
