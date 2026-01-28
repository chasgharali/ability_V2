const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Event = require('../models/Event');
const BoothQueue = require('../models/BoothQueue');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Label mappings for human-readable output
const EXPERIENCE_LEVEL_MAP = {
    'entry_level': 'Entry Level',
    'experienced_non-manager': 'Experienced (non-Manager)',
    'manager_supervisor_executive': 'Manager / Supervisor of Staff Executive',
    'senior_executive': 'Senior Executive (CEO, CIO, CFO, etc.)'
};

const EDUCATION_LEVEL_MAP = {
    'some_high_school': 'Some High School',
    'ged': 'General Educational Development (GED)',
    'high_school': 'High School',
    'certification': 'Certification',
    'vocational': 'Vocational',
    'some_college': 'Some College',
    'associates_degree': "Associate's Degree",
    'bachelors_degree': "Bachelor's Degree",
    'some_post-graduate': 'Some Post-Graduate',
    'masters_degree': "Master's Degree",
    'doctorate': 'Doctorate',
    'post-doctorate': 'Post-Doctorate',
    'international': 'International'
};

const JOB_CATEGORY_MAP = {
    'accounting_finance': 'Accounting / Finance',
    'administrative_office_support': 'Administrative / Office Support / Clerical / Data Entry',
    'administrative_services_hr': 'Administrative Services / Human Resources',
    'art_design_animation': 'Art & Design / Animation',
    'business_development': 'Business Development',
    'childcare_eldercare': 'Childcare / Eldercare',
    'communications_pr_sm': 'Communications / Public Relations / Social Media',
    'compliance_regulatory_affairs': 'Compliance / Regulatory Affairs',
    'construction_labor': 'Construction / Labor',
    'culinary_food_service': 'Culinary / Food Service',
    'customer_service_hospitality': 'Customer Service / Hospitality',
    'editorial_writing_editing': 'Editorial / Writing / Editing',
    'education_training': 'Education / Training',
    'engineering': 'Engineering',
    'executive_management': 'Executive / Management',
    'facilities_grounds': 'Facilities / Grounds / Maintenance / Custodial',
    'health_policy': 'Health Econ, Policy & Reimbursement',
    'healthcare_medical': 'Healthcare / Medical / Clinical',
    'information_technology': 'Information Technology / Cyber Security / Data & Analytics',
    'legal': 'Legal',
    'logistics_supply_ship': 'Logistics / Supply Chain / Inventory / Shipping',
    'manufacturing': 'Manufacturing',
    'marketing_advertising': 'Marketing / Advertising',
    'media': 'Media / Broadcast / Streaming / Digital & Interactive Media',
    'professional_services': 'Professional Services (Consulting, Architect, Advisor, etc.)',
    'quality_assurance_testing': 'Quality Assurance / Testing',
    'research_science': 'Research / Science',
    'retail_warehouse': 'Retail / Warehouse',
    'safety_security_law_enforcement': 'Safety / Security / Law Enforcement',
    'sales': 'Sales',
    'skilled_trade': 'Skilled Trade / Electrical / Plumbing / Technician',
    'social_services': 'Social Services / Non-profit / Community Organizing',
    'sourcing_procurement_purchasing': 'Sourcing / Procurement / Purchasing',
    'studio_operations_production': 'Studio Operations / Production',
    'transportation_driver': 'Transportation / Driver',
    'none_entry_level': 'None / Entry Level',
    'other': 'Other'
};

const EMPLOYMENT_TYPE_MAP = {
    'full-time': 'Full-Time',
    'part-time': 'Part-Time',
    'contract': 'Contract',
    'temporary': 'Temporary',
    'temporary-to-hire': 'Temporary-to-Hire',
    'internship': 'Internship',
    'volunteer': 'Volunteer'
};

const SECURITY_CLEARANCE_MAP = {
    'none': 'None',
    'active_confidential': 'Active - Confidential',
    'active_secret': 'Active - Secret',
    'active_top_secret': 'Active - Top Secret',
    'active_top_secret_sci': 'Active TS/SCI',
    'active_sci_sap': 'Active - SCI / SAP',
    'inactive_confidential': 'Inactive - Confidential',
    'inactive_secret': 'Inactive - Secret',
    'inactive_top_secret': 'Inactive - Top Secret',
    'inactive_sci_sap': 'Inactive - SCI/SAP',
    'inactive_top_secret_sci': 'Inactive TS/SCI'
};

const LANGUAGE_MAP = {
    'english': 'English',
    'asl_sign_language': 'ASL/Sign Language',
    'albanian': 'Albanian',
    'akrikaans': 'Afrikaans',
    'arabic': 'Arabic',
    'armenian': 'Armenian',
    'assamese': 'Assamese',
    'bengali': 'Bengali',
    'bulgarian': 'Bulgarian',
    'cambodian': 'Cambodian',
    'catalan': 'Catalan',
    'chinese-cantonese': 'Chinese-Cantonese',
    'chinese-chinots': 'Chinese-Chinots',
    'chinese-mandarin': 'Chinese-Mandarin',
    'chinese-taiwanese': 'Chinese-Taiwanese',
    'croatian': 'Croatian',
    'czech': 'Czech',
    'danish': 'Danish',
    'dutch': 'Dutch',
    'estonian': 'Estonian',
    'euskera': 'Euskera',
    'farsi': 'Farsi',
    'finnish': 'Finnish',
    'french': 'French',
    'german': 'German',
    'greek': 'Greek',
    'gujarati': 'Gujarati',
    'hebrew': 'Hebrew',
    'hindi': 'Hindi',
    'hungarian': 'Hungarian',
    'icelandic': 'Icelandic',
    'indonesian': 'Indonesian',
    'italian': 'Italian',
    'japanese': 'Japanese',
    'kannada': 'Kannada',
    'kashmiri': 'Kashmiri',
    'korean': 'Korean',
    'latvian': 'Latvian',
    'lithuanian': 'Lithuanian',
    'macedonian': 'Macedonian',
    'malayalam': 'Malayalam',
    'norwegian': 'Norwegian',
    'oriya': 'Oriya',
    'pashto': 'Pashto',
    'polish': 'Polish',
    'portuguese': 'Portuguese',
    'punjabi': 'Punjabi',
    'romanian': 'Romanian',
    'russian': 'Russian',
    'sanskrit': 'Sanskrit',
    'serbian': 'Serbian',
    'sindhi': 'Sindhi',
    'spanish': 'Spanish',
    'swedish': 'Swedish',
    'tagalog': 'Tagalog',
    'tamil': 'Tamil',
    'telugu': 'Telugu',
    'turkish': 'Turkish',
    'ukrainian': 'Ukrainian',
    'urdu': 'Urdu',
    'uzbek': 'Uzbek',
    'vasco': 'Vasco',
    'vietnamese': 'Vietnamese'
};

const VETERAN_STATUS_MAP = {
    'none': 'None',
    'active_duty': 'Active Duty',
    'reserve': 'Reserve',
    'national_guard': 'National Guard',
    'inactive_reserve': 'Inactive Reserve',
    'inactive_national_guard': 'Inactive National Guard',
    'retired_military': 'US Retired Military Veteran',
    'us_veteran': 'US Veteran'
};

// Helper functions
const getLabel = (map, value) => {
    if (!value) return null;
    return map[value] || value;
};

/**
 * Resolve job seeker IDs for event filter.
 * - eventId: job seekers who registered for the event (metadata.registeredEvents)
 * Returns null when no filter is applied (full report).
 */
async function getJobSeekerIdsForEvent(eventId) {
    const e = (v) => (v && String(v).trim()) || '';
    const ev = e(eventId);

    if (ev) {
        const conditions = [{ 'metadata.registeredEvents': { $elemMatch: { slug: eventId } } }];
        if (mongoose.Types.ObjectId.isValid(eventId)) {
            const oid = new mongoose.Types.ObjectId(eventId);
            conditions.unshift(
                { 'metadata.registeredEvents': { $elemMatch: { id: oid } } },
                { 'metadata.registeredEvents': { $elemMatch: { id: eventId } } },
                { 'metadata.registeredEvents': { $elemMatch: { id: oid.toString() } } }
            );
        }
        const users = await User.find({ role: 'JobSeeker', $or: conditions }).select('_id').lean();
        const ids = users.map((u) => u._id);
        return ids.length ? ids : [];
    }

    return null;
}

/**
 * GET /api/jobseeker-qualifications/report
 * Get job seeker qualifications report with counts and percentages
 */
router.get('/report', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const { eventId } = req.query;

        // Build base query - only get JobSeekers
        let query = { role: 'JobSeeker' };

        // Filter by event if provided
        const ids = await getJobSeekerIdsForEvent(eventId);
        if (ids !== null) {
            query._id = { $in: ids };
        }

        // Get all matching users with profile data
        const users = await User.find(query)
            .select('name email metadata.profile usesScreenMagnifier usesScreenReader needsASL needsCaptions needsOther')
            .lean();

        const totalUsers = users.length;

        // Helper function to calculate stats for a field
        const calculateStats = (fieldPath, labelMap, isArray = false) => {
            const counts = {};
            let totalResponses = 0;

            users.forEach(user => {
                const profile = user.metadata?.profile;
                let value;

                // Handle accessibility fields which are directly on user
                if (fieldPath.startsWith('accessibility.')) {
                    const accessField = fieldPath.replace('accessibility.', '');
                    value = user[accessField] ? 'Yes' : null;
                } else {
                    value = profile ? profile[fieldPath] : null;
                }

                if (isArray && Array.isArray(value)) {
                    value.forEach(v => {
                        if (v && String(v).trim()) {
                            const label = getLabel(labelMap, v) || v;
                            counts[label] = (counts[label] || 0) + 1;
                            totalResponses++;
                        }
                    });
                } else if (value && String(value).trim()) {
                    const label = getLabel(labelMap, value) || value;
                    counts[label] = (counts[label] || 0) + 1;
                    totalResponses++;
                }
            });

            // Sort by count (descending)
            const sorted = Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => ({
                    name,
                    count,
                    percentage: totalUsers > 0 ? ((count / totalUsers) * 100).toFixed(2) : '0.00'
                }));

            return {
                data: sorted,
                totalResponses,
                totalUsers
            };
        };

        // Calculate accessibility stats separately
        const calculateAccessibilityStats = () => {
            const accessibilityFields = [
                { field: 'usesScreenMagnifier', label: 'Screen Magnifier' },
                { field: 'usesScreenReader', label: 'Screen Reader' },
                { field: 'needsASL', label: 'ASL Interpreter' },
                { field: 'needsCaptions', label: 'Captions' },
                { field: 'needsOther', label: 'Other Accommodations' }
            ];

            const data = [];
            let totalResponses = 0;

            accessibilityFields.forEach(({ field, label }) => {
                const count = users.filter(u => u[field] === true).length;
                if (count > 0) {
                    data.push({
                        name: label,
                        count,
                        percentage: totalUsers > 0 ? ((count / totalUsers) * 100).toFixed(2) : '0.00'
                    });
                    totalResponses += count;
                }
            });

            // Sort by count descending
            data.sort((a, b) => b.count - a.count);

            return {
                data,
                totalResponses,
                totalUsers
            };
        };

        // Build report sections
        const report = {
            totalJobSeekers: totalUsers,
            sections: {
                educationLevel: {
                    title: 'Highest Education Level',
                    ...calculateStats('educationLevel', EDUCATION_LEVEL_MAP)
                },
                primaryExperience: {
                    title: 'Primary Job Functions',
                    ...calculateStats('primaryExperience', JOB_CATEGORY_MAP, true)
                },
                employmentTypes: {
                    title: 'Employment Types',
                    ...calculateStats('employmentTypes', EMPLOYMENT_TYPE_MAP, true)
                },
                workLevel: {
                    title: 'Experience Level',
                    ...calculateStats('workLevel', EXPERIENCE_LEVEL_MAP)
                },
                clearance: {
                    title: 'Security Clearance',
                    ...calculateStats('clearance', SECURITY_CLEARANCE_MAP)
                },
                languages: {
                    title: 'Languages',
                    ...calculateStats('languages', LANGUAGE_MAP, true)
                },
                veteranStatus: {
                    title: 'Veteran/Military Status',
                    ...calculateStats('veteranStatus', VETERAN_STATUS_MAP)
                },
                accessibilityNeeds: {
                    title: 'Accessibility Needs',
                    ...calculateAccessibilityStats()
                }
            }
        };

        res.json(report);

    } catch (error) {
        logger.error('Get job seeker qualifications report error:', error);
        res.status(500).json({
            error: 'Failed to retrieve report',
            message: error.message || 'An error occurred while retrieving the report'
        });
    }
});

/**
 * GET /api/jobseeker-qualifications/events
 * Get list of events for filtering
 */
router.get('/events', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        // Get all events that are published, active, or completed (not draft or cancelled)
        const events = await Event.find({ 
            status: { $in: ['published', 'active', 'completed'] }
        })
            .select('_id name slug start end status')
            .sort({ start: -1 })
            .lean();

        res.json({ events });
    } catch (error) {
        logger.error('Get events for qualifications report error:', error);
        res.status(500).json({
            error: 'Failed to retrieve events',
            message: error.message
        });
    }
});

/**
 * GET /api/jobseeker-qualifications/export/csv
 * Export job seeker qualifications report as CSV
 */
router.get('/export/csv', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const { eventId } = req.query;

        // Build base query - only get JobSeekers
        let query = { role: 'JobSeeker' };

        // Filter by event if provided
        const ids = await getJobSeekerIdsForEvent(eventId);
        if (ids !== null) {
            query._id = { $in: ids };
        }

        // Get event name for filename if filtering
        let eventName = 'Full';
        if (eventId) {
            const event = await Event.findById(eventId).select('name').lean();
            if (event) {
                eventName = event.name.replace(/[^a-zA-Z0-9]/g, '_');
            }
        }

        // Get all matching users with profile data
        const users = await User.find(query)
            .select('name email metadata.profile usesScreenMagnifier usesScreenReader needsASL needsCaptions needsOther')
            .lean();

        const totalUsers = users.length;

        // Helper function to escape CSV fields
        const escapeCSV = (value) => {
            if (value === null || value === undefined || value === '') {
                return '';
            }
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        };

        // Helper function to calculate stats for a field
        const calculateStats = (fieldPath, labelMap, isArray = false) => {
            const counts = {};

            users.forEach(user => {
                const profile = user.metadata?.profile;
                let value = profile ? profile[fieldPath] : null;

                if (isArray && Array.isArray(value)) {
                    value.forEach(v => {
                        if (v && String(v).trim()) {
                            const label = getLabel(labelMap, v) || v;
                            counts[label] = (counts[label] || 0) + 1;
                        }
                    });
                } else if (value && String(value).trim()) {
                    const label = getLabel(labelMap, value) || value;
                    counts[label] = (counts[label] || 0) + 1;
                }
            });

            return Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => ({
                    name,
                    count,
                    percentage: totalUsers > 0 ? ((count / totalUsers) * 100).toFixed(2) : '0.00'
                }));
        };

        // Calculate accessibility stats
        const calculateAccessibilityStats = () => {
            const accessibilityFields = [
                { field: 'usesScreenMagnifier', label: 'Screen Magnifier' },
                { field: 'usesScreenReader', label: 'Screen Reader' },
                { field: 'needsASL', label: 'ASL Interpreter' },
                { field: 'needsCaptions', label: 'Captions' },
                { field: 'needsOther', label: 'Other Accommodations' }
            ];

            return accessibilityFields
                .map(({ field, label }) => {
                    const count = users.filter(u => u[field] === true).length;
                    return {
                        name: label,
                        count,
                        percentage: totalUsers > 0 ? ((count / totalUsers) * 100).toFixed(2) : '0.00'
                    };
                })
                .filter(item => item.count > 0)
                .sort((a, b) => b.count - a.count);
        };

        // Define sections
        const sections = [
            { title: 'Highest Education Level', data: calculateStats('educationLevel', EDUCATION_LEVEL_MAP) },
            { title: 'Primary Job Functions', data: calculateStats('primaryExperience', JOB_CATEGORY_MAP, true) },
            { title: 'Employment Types', data: calculateStats('employmentTypes', EMPLOYMENT_TYPE_MAP, true) },
            { title: 'Experience Level', data: calculateStats('workLevel', EXPERIENCE_LEVEL_MAP) },
            { title: 'Security Clearance', data: calculateStats('clearance', SECURITY_CLEARANCE_MAP) },
            { title: 'Languages', data: calculateStats('languages', LANGUAGE_MAP, true) },
            { title: 'Veteran/Military Status', data: calculateStats('veteranStatus', VETERAN_STATUS_MAP) },
            { title: 'Accessibility Needs', data: calculateAccessibilityStats() }
        ];

        // Build CSV content
        const csvLines = [];
        csvLines.push(`Job Seeker Qualifications Report`);
        csvLines.push(`Total Job Seekers: ${totalUsers}`);
        csvLines.push('');

        sections.forEach((section, idx) => {
            if (idx > 0) csvLines.push(''); // Empty line between sections
            csvLines.push(`Distribution of '${section.title}'`);
            csvLines.push(`${section.title},Count,Percentage`);

            let sectionTotal = 0;
            section.data.forEach(item => {
                csvLines.push(`${escapeCSV(item.name)},${item.count},${item.percentage}%`);
                sectionTotal += item.count;
            });

            if (section.data.length > 0) {
                csvLines.push(`Total Responses,${sectionTotal},`);
            } else {
                csvLines.push('No data available,,');
            }
        });

        // Build CSV content
        const csvContent = csvLines.join('\r\n');

        // Add BOM for Excel compatibility
        const BOM = '\uFEFF';
        const finalContent = BOM + csvContent;

        // Set response headers
        res.setHeader('Content-Type', 'text/csv;charset=utf-8;');
        res.setHeader('Content-Disposition', `attachment; filename="jobseeker-qualifications-${eventName}-report.csv"`);

        // Send response
        res.end(finalContent, 'utf8');

    } catch (error) {
        logger.error('Export job seeker qualifications report error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to export report',
                message: error.message || 'An error occurred while exporting the report'
            });
        }
    }
});

module.exports = router;
