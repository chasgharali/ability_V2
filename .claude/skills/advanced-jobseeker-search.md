# Advanced Job Seeker AI Search — System Guide

## What this feature does

Admins can search registered job seekers using natural language prompts (e.g. *"security guard in Denver with ADHD"*). Profiles are indexed by combining resume content, profile metadata, survey/disability data, and event registration history into a structured `aiProfile` field using OpenAI.

---

## Architecture

### Data flow

```
Job seeker registers for event
        ↓
Auto-parse triggered (fire-and-forget)
        ↓
jobSeekerSearchService.parseJobSeekerProfile(userId)
        ↓
Fetches: Resume docs + raw resumeUrl + profile metadata + survey + event registrations
        ↓
OpenAI GPT-4o-mini extracts structured fields
        ↓
Stored in User.aiProfile (currentTitle, skills, disabilities, searchableText, …)

Admin types query → aiSearch(query, orgId)
        ↓
OpenAI translates query to structured criteria (location, titles, disabilities, skills)
        ↓
MongoDB filter built and executed against User.aiProfile
        ↓
Results returned with registration data attached
```

---

## Key files

| File | Role |
|---|---|
| `server/models/User.js` | `aiProfile` subdocument added (parsedAt, currentTitle, skills, disabilities, searchableText, …) |
| `server/services/jobSeekerSearchService.js` | Core service: `parseJobSeekerProfile`, `batchParseProfiles`, `getParseStatus`, `aiSearch` |
| `server/routes/organizations.js` | 3 new routes: GET `/:id/job-seekers/parse-status`, POST `/:id/job-seekers/parse-resumes`, POST `/:id/job-seekers/ai-search` |
| `server/routes/events.js` | Auto-parse hook after event registration |
| `client/src/services/organizations.js` | `getJobSeekerParseStatus`, `triggerBatchParse`, `aiSearchJobSeekers` |
| `client/src/components/JobSeekerManagement/AdvancedJobSeekerSearch.js` | React component — parse status banner, search textarea, result cards |
| `client/src/components/JobSeekerManagement/AdvancedJobSeekerSearch.css` | Styles for the AI search UI |
| `client/src/components/JobSeekerManagement/RegisteredJobSeekerManagement.js` | Tab bar added — "All Job Seekers" | "✦ AI Search" |

---

## API routes

### `GET /api/organizations/:id/job-seekers/parse-status`
Returns `{ total, parsed, unparsed }` for the org.

### `POST /api/organizations/:id/job-seekers/parse-resumes`
Triggers background batch parsing. Returns immediately; client polls parse-status for progress.

### `POST /api/organizations/:id/job-seekers/ai-search`
Body: `{ query: string, page?: number, limit?: number }`  
Returns `{ results, total, totalPages, page, criteria }`.
`criteria` is the structured interpretation OpenAI extracted from the query — used to render the "AI interpreted your query as" tags in the UI.

---

## `aiProfile` fields

| Field | Source | Example |
|---|---|---|
| `parsedAt` | set on parse | Date |
| `parseSource` | derived | `"resume-builder+profile"` |
| `currentTitle` | resume / profile | `"Security Guard"` |
| `yearsOfExperience` | resume | `5` |
| `skills` | resume + profile | `["CPR", "surveillance"]` |
| `industries` | resume | `["Security", "Hospitality"]` |
| `educationLevel` | profile / resume | `"High School"` |
| `workLanguages` | profile | `["English", "Spanish"]` |
| `disabilities` | survey + resume | `["adhd", "visual impairment"]` |
| `accessibilityNeeds` | User flags | `["screen reader", "ASL"]` |
| `totalEventsRegistered` | RegisteredJobSeeker | `3` |
| `eventNames` | RegisteredJobSeeker | `["Spring Job Fair 2025"]` |
| `searchableText` | combined blob | `"denver co security guard adhd..."` |

---

## Parse behavior

- **On event registration**: `parseJobSeekerProfile(userId)` fires async (fire-and-forget) immediately after a successful registration for an org event.
- **Admin batch parse**: Admin clicks "Index Profiles Now" → `POST parse-resumes` → server processes all unparsed (or parsed > 7 days ago) users async → client polls `parse-status` every 4 seconds.
- **Rate limiting**: 200 ms delay between each profile parse in batch to respect OpenAI rate limits.

---

## Search strategy

1. Admin query → OpenAI → structured criteria `{ titles, skills, location, disabilities, keywords }`
2. Location fields (`city`, `state`) matched against `User.city/state` AND `aiProfile.searchableText`
3. Disabilities matched against `aiProfile.disabilities` array AND `searchableText`
4. Title/skill/keyword terms matched across `currentTitle`, `skills`, `industries`, `keywords`, `headline`, `searchableText`
5. All matching is case-insensitive regex — no vector search required (works with standard MongoDB)

---

## Adding this feature to a new environment

1. Ensure `OPENAI_API_KEY` is set in `server/.env`
2. Run the app — `aiProfile` is a regular Mongoose Mixed/Schema field; no migration needed
3. Existing job seekers will be indexed on their next event registration, or admin can trigger a batch parse

---

## Common tasks

**Re-index all profiles for an org:**
```
POST /api/organizations/<orgId>/job-seekers/parse-resumes
```

**Check parse progress:**
```
GET /api/organizations/<orgId>/job-seekers/parse-status
→ { total: 120, parsed: 87, unparsed: 33 }
```

**Run an AI search:**
```
POST /api/organizations/<orgId>/job-seekers/ai-search
Body: { "query": "bilingual nurse needing ASL in Texas", "page": 1, "limit": 20 }
```
