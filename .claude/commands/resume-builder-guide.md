# Resume Builder — System Guide

A full-stack AI-powered resume management feature for JobSeeker users.

---

## Architecture Overview

### Backend

| File | Purpose |
|------|---------|
| `server/models/Resume.js` | Mongoose schema — one document per saved resume |
| `server/services/openaiResumeService.js` | OpenAI `gpt-4o-mini` calls for generation + suggestions |
| `server/routes/resumes.js` | REST endpoints mounted at `/api/resumes` |
| `server/index.js` | Route registered: `app.use('/api/resumes', resumeRoutes)` |

### Frontend

| File | Purpose |
|------|---------|
| `client/src/services/resumes.js` | Axios API client — all resume CRUD + AI calls |
| `client/src/components/Dashboard/ResumeBuilder/ResumeBuilder.js` | Main component: list, editor, preview |
| `client/src/components/Dashboard/ResumeBuilder/ResumeSelectWidget.js` | Compact picker used inside RegistrationWizard |
| `client/src/components/Dashboard/ResumeBuilder/ResumeBuilder.css` | All styles incl. `@media print` for PDF export |

### Integration Points

| File | Change |
|------|--------|
| `client/src/components/Layout/AdminSidebar.js` | Added "Resume Builder" item under My Account; added `'resume-builder'` to `JOBSEEKER_ACCOUNT_KEYS` |
| `client/src/components/Dashboard/Dashboard.js` | Imports + routes `activeSection === 'resume-builder'` → `<ResumeBuilder />` |
| `client/src/components/Events/RegistrationWizard.js` | Renders `<ResumeSelectWidget>` in Step 2; passes `resumeId` to `registerForEvent()` |
| `client/src/services/events.js` | `registerForEvent(slug, { resumeId })` — optional resumeId param |
| `server/routes/events.js` | `POST /:id/register` reads `req.body.resumeId`, generates PDF via `pdfResumeService`, stores `resumeId` + `generatedResumeUrl` in both `user.metadata.registeredEvents` and `RegisteredJobSeeker` |
| `server/services/pdfResumeService.js` | Generates PDF with PDFKit, uploads to S3 at `resume/{userId}/generated/{ts}_{resumeId}.pdf`, returns stable S3 URL |
| `server/models/RegisteredJobSeeker.js` | Stores `resumeId` (ref to Resume doc) and `resumeUrl` (S3 PDF URL) per registration |
| `client/src/utils/resumeViewer.js` | `openResumeInNewTab(resumeId, resumeUrl)` — renders inline HTML for saved resumes; fetches presigned URL for uploaded/generated PDFs |
| `client/src/services/resumes.js` | `getAdminResumeFileUrl(s3Url)` — calls `/api/uploads/admin/resume-url` to get a fresh presigned URL |
| `server/routes/uploads.js` | `GET /admin/resume-url` accepts keys starting with `resume/` or `resumes/` (both prefixes valid) |

---

## Resume Data Model

```js
// server/models/Resume.js
{
  userId:          ObjectId,        // owner — always current user
  organizationId:  ObjectId|null,
  title:           String,          // user-visible label, max 100 chars
  isDefault:       Boolean,         // one per user; shown first in picker
  lastAiGenerated: Date|null,
  content: {
    name, email, phone, location, linkedIn, website,
    summary,                        // AI-improvable
    skills:         [String],       // AI-suggestable
    languages:      [String],
    experience: [{
      company, title, location, startDate, endDate, current,
      bullets: [String]             // AI-improvable per entry
    }],
    education: [{ institution, degree, field, graduationDate, gpa }],
    certifications: [{ name, issuer, date }],
    awards:         [String],
    customSections: [{ title, content }]
  }
}
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/resumes` | List all resumes for current user |
| POST | `/api/resumes` | Create resume (`{ title, content, fromProfile }`) |
| GET | `/api/resumes/:id` | Get single resume |
| PUT | `/api/resumes/:id` | Update resume (`{ title, content }`) |
| DELETE | `/api/resumes/:id` | Delete resume |
| POST | `/api/resumes/:id/set-default` | Mark as default |
| POST | `/api/resumes/:id/generate` | AI: fill from user's profile (OpenAI) |
| POST | `/api/resumes/:id/suggest` | AI: suggest content for a section |

### AI suggest body

```json
{
  "section": "summary | experience_bullets | skills | custom",
  "currentContent": "...",
  "context": "optional extra context"
}
```

---

## Key Behaviors

- **Profile pre-fill**: Creating with `fromProfile: true` maps `User.name`, `email`, `phoneNumber`, `city/state/country`, `linkedInUrl`, and `metadata.profile.{headline, keywords, languages}` into the resume content.
- **AI Generate from Profile** (`POST /:id/generate`): Calls OpenAI with the user's full profile, merges AI output into existing content (preserves manually entered fields).
- **PDF export**: Client-side `window.print()` — `@media print` CSS hides everything except `.rb-print-area`. No server-side PDF library needed.
- **Multiple resumes**: No hard limit. First resume created auto-sets `isDefault: true`. Deleting the default promotes the next most-recently-updated resume.
- **Event registration attachment**: `ResumeSelectWidget` appears in Step 2 of `RegistrationWizard`. The selected `resumeId` is POSTed with the registration. The server generates a server-side PDF via PDFKit, uploads it to S3 at `resume/{userId}/generated/...`, and stores the URL in both `user.metadata.registeredEvents[n].generatedResumeUrl` and `RegisteredJobSeeker.resumeUrl`.
- **Admin resume view**: Admins click "View" in RegisteredJobSeekerManagement. If a `resumeUrl` (S3 PDF) is present it calls `GET /api/uploads/admin/resume-url?url=...` to generate a presigned URL and opens it; if only a `resumeId` is present it fetches the Resume doc via `GET /api/resumes/admin/:id` and renders an HTML preview. The presigned URL endpoint accepts S3 keys prefixed with either `resume/` (user-uploaded) or `resumes/` (legacy generated, kept for backward compat).
- **S3 key conventions**: User-uploaded resumes → `resume/{userId}/{filename}`. Server-generated PDFs → `resume/{userId}/generated/{timestamp}_{resumeId}.pdf`.

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENAI_API_KEY` | — | Required for AI features |
| `OPENAI_RESUME_MODEL` | `gpt-4o-mini` | Model used for resume generation/suggestions |

AI features gracefully degrade — if the key is missing the UI shows an error toast; the rest of the builder still works.

---

## Routing

- Dashboard URL: `/dashboard/resume-builder`
- Sidebar key: `'resume-builder'` (part of `JOBSEEKER_ACCOUNT_KEYS`)
- Role guard: JobSeeker only (sidebar item only renders for `user.role === 'JobSeeker'`)

---

## Common Tasks

**Add a new resume section type**
1. Add fields to `resumeContentSchema` in `server/models/Resume.js`
2. Add UI controls to the `'more'` tab in `ResumeBuilder.js`
3. Add rendering to the preview block in `ResumeBuilder.js`

**Change AI model**
Set `OPENAI_RESUME_MODEL=gpt-4o` (or any chat-completion model) in `server/.env`.

**Add AI support for a new section**
Add a new key to the `prompts` object in `openaiResumeService.js → suggestContent()` and call `handleAiSuggest(newKey, ...)` from the editor tab.
