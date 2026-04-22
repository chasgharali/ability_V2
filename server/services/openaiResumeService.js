const OpenAI = require('openai');
const logger = require('../utils/logger');

class OpenAIResumeService {
  constructor() {
    this.available = Boolean(process.env.OPENAI_API_KEY);
    if (this.available) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      logger.info('✅ OpenAI resume service initialized');
    } else {
      logger.warn('⚠️  OpenAI API key not configured — resume AI features disabled');
    }
  }

  async generateFromProfile(profile) {
    if (!this.available) throw new Error('OpenAI API key not configured');

    const systemPrompt = `You are an expert resume writer specializing in creating compelling resumes for job seekers with disabilities and diverse backgrounds.
Generate professional resume content based on the user's profile. Return ONLY valid JSON — no markdown, no code fences, no extra text.`;

    const userPrompt = `Based on this profile, generate a complete professional resume as JSON:

Profile:
- Name: ${profile.name || ''}
- Email: ${profile.email || ''}
- Phone: ${profile.phone || ''}
- Location: ${profile.city ? `${profile.city}, ${profile.state || ''} ${profile.country || ''}`.trim() : ''}
- LinkedIn: ${profile.linkedIn || ''}
- Headline: ${profile.headline || ''}
- Skills/Keywords: ${profile.keywords || ''}
- Primary Experience: ${(profile.primaryExperience || []).join(', ')}
- Employment Types: ${(profile.employmentTypes || []).join(', ')}
- Work Level: ${profile.workLevel || ''}
- Education Level: ${profile.educationLevel || ''}
- Languages: ${(profile.languages || []).join(', ')}

Return exactly this JSON structure:
{
  "summary": "2-3 sentence professional summary tailored to their experience level and field",
  "skills": ["skill1", "skill2", "skill3"],
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "location": "City, State",
      "startDate": "MM/YYYY",
      "endDate": "Present",
      "current": true,
      "bullets": [
        "Strong action-verb bullet with quantified achievement",
        "Another impactful bullet point",
        "Third relevant accomplishment"
      ]
    }
  ],
  "education": [
    {
      "institution": "University/School Name",
      "degree": "Degree Type",
      "field": "Field of Study",
      "graduationDate": "YYYY",
      "gpa": ""
    }
  ]
}`;

    const response = await this.client.chat.completions.create({
      model: process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
      temperature: 0.7
    });

    const text = response.choices[0]?.message?.content || '{}';
    try {
      return JSON.parse(text);
    } catch {
      logger.error('Failed to parse OpenAI generateFromProfile response:', text);
      throw new Error('AI returned invalid JSON');
    }
  }

  async parseResumeFromText(text, userInfo = {}) {
    if (!this.available) throw new Error('OpenAI API key not configured');

    const systemPrompt = `You are an expert resume parser. Extract structured resume data from raw resume text.
Return ONLY valid JSON — no markdown, no code fences, no extra text.`;

    const userPrompt = `Parse this resume text and extract all information into a structured format.

Resume Text:
${text.substring(0, 8000)}

User's known info (use as fallback if not found in resume):
- Name: ${userInfo.name || ''}
- Email: ${userInfo.email || ''}
- Phone: ${userInfo.phone || ''}

Return exactly this JSON structure (use empty strings/arrays for missing fields):
{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "phone number",
  "location": "City, State",
  "linkedIn": "linkedin URL if present",
  "website": "portfolio/website URL if present",
  "summary": "professional summary or objective",
  "skills": ["skill1", "skill2"],
  "languages": ["language1"],
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "location": "City, State",
      "startDate": "MM/YYYY",
      "endDate": "MM/YYYY or Present",
      "current": false,
      "bullets": ["achievement or responsibility"]
    }
  ],
  "education": [
    {
      "institution": "School Name",
      "degree": "Degree Type",
      "field": "Field of Study",
      "graduationDate": "YYYY",
      "gpa": ""
    }
  ],
  "certifications": [
    { "name": "Certification Name", "issuer": "Issuer", "date": "MM/YYYY" }
  ],
  "awards": ["award description"],
  "customSections": [
    { "title": "Section Title", "content": "Full text content of the section" }
  ]
}

IMPORTANT: Any sections in the resume that do not fit into the above fields (e.g. Military Service, Volunteer Work, Publications, Additional Information, Highlights of Qualifications, References, etc.) MUST be captured as entries in "customSections". Do NOT omit any section from the resume. For each custom section, put the section heading as "title" and all its content (including sub-headings and bullet points as plain text) as "content".`;

    const response = await this.client.chat.completions.create({
      model: process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
      temperature: 0.2
    });

    const responseText = response.choices[0]?.message?.content || '{}';
    try {
      return JSON.parse(responseText);
    } catch {
      logger.error('Failed to parse OpenAI parseResumeFromText response:', responseText);
      throw new Error('AI returned invalid JSON');
    }
  }

  async suggestContent(section, currentContent, context) {
    if (!this.available) throw new Error('OpenAI API key not configured');

    const systemPrompt = `You are an expert resume writer. Provide concise, professional improvements for resume sections.
Return ONLY valid JSON — no markdown, no code fences, no extra text.`;

    const prompts = {
      summary: `Rewrite this professional summary to be more compelling and concise (2-3 sentences). Focus on value delivered.
Current: "${currentContent}"
Context: ${context}
Return: { "suggestion": "improved summary text" }`,

      experience_bullets: `Improve these job experience bullets with strong action verbs and quantifiable results where possible.
Current: ${JSON.stringify(currentContent)}
Role context: ${context}
Return: { "bullets": ["improved bullet 1", "improved bullet 2", "improved bullet 3"] }`,

      skills: `Suggest 6-8 additional relevant skills based on the existing skills and job context. Return only new skills not in the current list.
Current skills: ${JSON.stringify(currentContent)}
Context: ${context}
Return: { "suggestedSkills": ["skill1", "skill2"] }`,

      custom: `Improve this resume section content to be more professional and impactful.
Section: ${context}
Current content: "${currentContent}"
Return: { "suggestion": "improved content" }`
    };

    const prompt = prompts[section] || prompts.custom;

    const response = await this.client.chat.completions.create({
      model: process.env.OPENAI_RESUME_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 600,
      temperature: 0.7
    });

    const text = response.choices[0]?.message?.content || '{}';
    try {
      return JSON.parse(text);
    } catch {
      logger.error('Failed to parse OpenAI suggestContent response:', text);
      throw new Error('AI returned invalid JSON');
    }
  }
}

module.exports = new OpenAIResumeService();
