const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const Resume = require('../models/Resume');
const openaiResumeService = require('../services/openaiResumeService');
const logger = require('../utils/logger');

/**
 * GET /api/resumes
 * List all resumes for the current user
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const resumes = await Resume.find({ userId: req.user._id })
      .sort({ isDefault: -1, updatedAt: -1 })
      .lean();
    res.json({ resumes });
  } catch (error) {
    logger.error('List resumes error:', error);
    res.status(500).json({ error: 'Failed to retrieve resumes' });
  }
});

/**
 * POST /api/resumes
 * Create a new resume (blank or pre-populated from profile)
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, content, fromProfile } = req.body;
    const user = req.user;

    let initialContent = content || {};

    if (fromProfile) {
      const profile = user.metadata?.profile || {};
      initialContent = {
        name: user.name || '',
        email: user.email || '',
        phone: user.phoneNumber || '',
        location: [user.city, user.state, user.country].filter(Boolean).join(', '),
        linkedIn: user.linkedInUrl || '',
        website: '',
        summary: profile.headline || '',
        skills: profile.keywords
          ? profile.keywords.split(/[,\n]+/).map(s => s.trim()).filter(Boolean)
          : [],
        languages: profile.languages || [],
        experience: [],
        education: [],
        certifications: [],
        awards: [],
        customSections: [],
        ...initialContent
      };
    }

    const resumeCount = await Resume.countDocuments({ userId: user._id });
    const resume = await Resume.create({
      userId: user._id,
      organizationId: user.organizationId || null,
      title: title || `My Resume ${resumeCount + 1}`,
      content: initialContent,
      isDefault: resumeCount === 0
    });

    res.status(201).json({ resume });
  } catch (error) {
    logger.error('Create resume error:', error);
    res.status(500).json({ error: 'Failed to create resume' });
  }
});

/**
 * GET /api/resumes/admin/:id
 * Get any resume by ID — admin/recruiter access (no ownership check)
 */
router.get('/admin/:id', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Support', 'GlobalSupport']), async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id).lean();
    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    res.json({ resume });
  } catch (error) {
    logger.error('Admin get resume error:', error);
    res.status(500).json({ error: 'Failed to retrieve resume' });
  }
});

/**
 * GET /api/resumes/:id
 * Get a specific resume (must belong to current user)
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    res.json({ resume });
  } catch (error) {
    logger.error('Get resume error:', error);
    res.status(500).json({ error: 'Failed to retrieve resume' });
  }
});

/**
 * PUT /api/resumes/:id
 * Update a resume
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { title, content } = req.body;
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user._id });
    if (!resume) return res.status(404).json({ error: 'Resume not found' });

    if (title !== undefined) resume.title = title;
    if (content !== undefined) resume.content = content;
    await resume.save();

    res.json({ resume });
  } catch (error) {
    logger.error('Update resume error:', error);
    res.status(500).json({ error: 'Failed to update resume' });
  }
});

/**
 * DELETE /api/resumes/:id
 * Delete a resume
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const resume = await Resume.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!resume) return res.status(404).json({ error: 'Resume not found' });

    // If deleted resume was default, promote the next one
    if (resume.isDefault) {
      const next = await Resume.findOne({ userId: req.user._id }).sort({ updatedAt: -1 });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }

    res.json({ message: 'Resume deleted' });
  } catch (error) {
    logger.error('Delete resume error:', error);
    res.status(500).json({ error: 'Failed to delete resume' });
  }
});

/**
 * POST /api/resumes/:id/set-default
 * Mark a resume as the default
 */
router.post('/:id/set-default', authenticateToken, async (req, res) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user._id });
    if (!resume) return res.status(404).json({ error: 'Resume not found' });

    await Resume.updateMany({ userId: req.user._id }, { isDefault: false });
    resume.isDefault = true;
    await resume.save();

    res.json({ message: 'Default resume updated', resume });
  } catch (error) {
    logger.error('Set default resume error:', error);
    res.status(500).json({ error: 'Failed to set default resume' });
  }
});

/**
 * POST /api/resumes/:id/generate
 * AI: generate/fill resume sections from the user's profile
 */
router.post('/:id/generate', authenticateToken, async (req, res) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user._id });
    if (!resume) return res.status(404).json({ error: 'Resume not found' });

    const user = req.user;
    const profile = user.metadata?.profile || {};

    const generated = await openaiResumeService.generateFromProfile({
      name: user.name,
      email: user.email,
      phone: user.phoneNumber,
      city: user.city,
      state: user.state,
      country: user.country,
      linkedIn: user.linkedInUrl,
      headline: profile.headline,
      keywords: profile.keywords,
      primaryExperience: profile.primaryExperience,
      employmentTypes: profile.employmentTypes,
      workLevel: profile.workLevel,
      educationLevel: profile.educationLevel,
      languages: profile.languages
    });

    // Merge AI output into existing content (preserve manually entered data)
    const current = resume.content?.toObject ? resume.content.toObject() : (resume.content || {});
    resume.content = {
      ...current,
      summary: generated.summary || current.summary || '',
      skills: generated.skills?.length ? generated.skills : (current.skills || []),
      experience: generated.experience?.length ? generated.experience : (current.experience || []),
      education: generated.education?.length ? generated.education : (current.education || [])
    };
    resume.lastAiGenerated = new Date();
    await resume.save();

    res.json({ resume, generated });
  } catch (error) {
    logger.error('Generate resume error:', error);
    if (error.message?.includes('API key')) {
      return res.status(503).json({ error: 'AI service not available. Check OPENAI_API_KEY.' });
    }
    res.status(500).json({ error: 'Failed to generate resume content' });
  }
});

/**
 * POST /api/resumes/:id/suggest
 * AI: suggest improved content for a specific section
 * Body: { section: 'summary'|'experience_bullets'|'skills'|'custom', currentContent, context }
 */
router.post('/:id/suggest', authenticateToken, async (req, res) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, userId: req.user._id });
    if (!resume) return res.status(404).json({ error: 'Resume not found' });

    const { section, currentContent, context } = req.body;
    if (!section) return res.status(400).json({ error: 'section is required' });

    const suggestion = await openaiResumeService.suggestContent(section, currentContent, context || '');
    res.json({ suggestion });
  } catch (error) {
    logger.error('Suggest resume content error:', error);
    if (error.message?.includes('API key')) {
      return res.status(503).json({ error: 'AI service not available. Check OPENAI_API_KEY.' });
    }
    res.status(500).json({ error: 'Failed to get content suggestion' });
  }
});

module.exports = router;
