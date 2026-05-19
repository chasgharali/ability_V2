---
name: ai-search
description: Architecture, privacy contract, and operational runbook for the Advanced AI Search feature (job-seeker resume parsing + semantic search). Read this BEFORE making any change to resume parsing, embeddings, search endpoints, the ParsedResume collection, or any code that touches survey/disability data in a search context.
---

# Advanced AI Search — Job Seekers

This skill captures everything an LLM (or human) needs to know to safely
modify the AI search feature. **The most important section is the privacy
contract — read it first and do not bypass it.**

---

## 1. Privacy contract (non-negotiable)

The product requirement is explicit: **recruiters and admins must NOT be
able to filter, rank, or surface job seekers by disability, accessibility
need, or any other protected attribute.** This is enforced at four layers
— if you remove any layer, you are breaking the contract.

| Layer | File | What it does |
|---|---|---|
| 1. Source filter | `services/resumeParserService.js` → `sanitizeUser()` | Strips `survey`, `usesScreenReader`, `usesScreenMagnifier`, `needsASL`, `needsCaptions`, `needsOther` from the user object before parsing. |
| 2. Prompt firewall | `services/resumeParserService.js` → `extractStructured()` | Tells OpenAI to ignore disability/race/gender/age/origin even if mentioned in the resume. |
| 3. Schema allowlist | `models/ParsedResume.js` | Mongoose schema lists the **only** fields that may be persisted. A `pre('validate')` hook hard-rejects any sensitive key name. |
| 4. Query firewall | `services/aiSearchService.js` → `findSensitiveTerm()` | Rejects user-supplied queries that mention disability/race/gender/age. Returns `code: 'SENSITIVE_QUERY'`. |

### Sensitive terms that are blocked at query time

Disability terms (deaf, blind, ADHD, autism, wheelchair, PTSD, TBI…),
accessibility terms (ASL, sign language, screen reader, captions, CART),
race/ethnicity, gender identity, age cohort, religion, sexual orientation,
veteran status, country-of-origin (the seeker's *current* country is
fine — only "country of origin" from the survey is blocked), and
pregnancy. The full list is `SENSITIVE_QUERY_PATTERNS` in
`services/aiSearchService.js`.

### What's allowed

Role/title, skills, industries, education level, work level (Entry / Mid
/ Senior / Executive), employment type (Full-time / Part-time /
Contract), spoken languages, years of experience, and current location
(city / state / country).

### What to do if a recruiter asks for more

Do not loosen the firewall. The right path is a separate, explicitly
consented disclosure flow (e.g. the existing interpreter-request feature
already collects this consent for a single call). AI search is for
skill / role / location matching only.

---

## 2. Architecture

```
                                  ┌─────────────────────────────────┐
   Resume create/update    ──────►│                                 │
   Resume upload (S3)      ──────►│  resumeParserService            │
   Event registration      ──────►│  (one ParsedResume per user)    │
   Admin batch trigger     ──────►│                                 │
                                  └────────────┬────────────────────┘
                                               │
                                               ▼
                                  ┌─────────────────────────────────┐
                                  │  ParsedResume (MongoDB)         │
                                  │  + Atlas Vector Search index    │
                                  │    on `embedding`               │
                                  └────────────┬────────────────────┘
                                               │
   Org admin search       ──────►              │
   SuperAdmin search      ──────►   aiSearchService                  │
   Recruiter/Admin        ──────►              │
   meeting-records search           │           │
   job-seeker-interests search      │           │
                                    └───────────┘
```

### Files

| File | Responsibility |
|---|---|
| `server/models/ParsedResume.js` | Schema — strict allowlist, sensitive-key validator, indexes. |
| `server/services/resumeParserService.js` | Read user + resume → call OpenAI → embed → upsert ParsedResume. |
| `server/services/aiSearchService.js` | NL query → embedding + structured-filter extraction → `$vectorSearch` → hybrid re-rank (vector + role/skill keyword boost) → relevance floor → hydrate. |
| `server/migrations/strip-sensitive-aiprofile-fields.js` | One-time scrub of legacy `aiProfile.disabilities` / `aiProfile.accessibilityNeeds`. |
| `server/services/jobSeekerSearchService.js` | Deprecated stub that throws on use. Do not write here. |

### Endpoints (server)

| Endpoint | Roles | Scope |
|---|---|---|
| `GET  /api/organizations/:id/job-seekers/parse-status` | SuperAdmin / Admin / AdminEvent | Org |
| `POST /api/organizations/:id/job-seekers/parse-resumes` | SuperAdmin / Admin | Org |
| `POST /api/organizations/:id/job-seekers/ai-search` | SuperAdmin / Admin / AdminEvent | Org |
| `GET  /api/users/job-seekers/parse-status` | SuperAdmin | Global |
| `POST /api/users/job-seekers/parse-resumes` | SuperAdmin | Global |
| `POST /api/users/job-seekers/ai-search` | SuperAdmin | Global |
| `POST /api/meeting-records/ai-search` | Admin / GlobalSupport / Recruiter / SuperAdmin | Visible meeting records |
| `POST /api/job-seeker-interests/ai-search` | Admin / GlobalSupport / Recruiter | Visible job seeker interests |

### Client component

`client/src/components/JobSeekerManagement/AdvancedJobSeekerSearch.js` is
shared by all three UIs via a `mode` prop:

- `mode="org"` (default) — used in `RegisteredJobSeekerManagement.js`
- `mode="global"` — used in `JobSeekerManagement.js` for SuperAdmin
- `mode="meeting"` — used in `MeetingRecords.js` (no parse controls; the
  parsing happens elsewhere). Returned results include `meetingRecordIds`
  so the UI can deep-link to a specific call.
- `mode="interests"` — used in `JobSeekerInterests.js` (no parse controls).
  Returned results are interest rows with booth/event/company context; the
  parent page opens `JobSeekerProfileModal` via `onViewJobSeeker`.

---

## 3. Data model: `ParsedResume`

One document **per user** (not per registration). Keyed by `userId`
(unique). Re-parsing is idempotent: the parser computes a SHA-256 of the
input and skips re-embedding when the hash hasn't changed.

```js
{
  userId,                  // unique, indexed
  organizationIds: [...],  // all orgs this seeker has registered with
  sourceResumeId,          // the Resume doc the parse used (if any)
  sourceResumeUrl,         // or the uploaded URL
  parseSource,             // 'resume-builder' | 'uploaded-resume' | 'profile-only'
  parsedAt,
  inputHash,               // sha256 of canonicalized input
  // Allowlisted, non-sensitive fields:
  currentTitle, yearsOfExperience, skills[], industries[],
  educationLevel, workLanguages[], summary, headline, keywords[],
  employmentTypes[], workLevel,
  city, state, country,
  searchableText,          // fallback for keyword matching
  embedding: [Number],     // 1536-d (text-embedding-3-small), select:false
  embeddingModel,
  embeddingDimensions
}
```

**Never add a sensitive field to this schema.** The `pre('validate')`
hook will reject the save anyway, but the contract is "read-only after
review" — schema changes need security sign-off.

---

## 3a. Hybrid scoring (why and how)

Pure vector similarity is too soft on short queries. "developer from US"
embeds close to *any* US tech professional, so a designer can rank above
a developer just from the location signal. We layer keyword hits on top
of cosine score:

| Signal | Weight |
|---|---|
| Role keyword in `currentTitle` / `headline` | +0.20 each |
| Skill keyword in `skills` / `industries` | +0.08 each |
| Role/skill keyword in `summary` / `keywords` | +0.05 each |
| Keyword in `searchableText` only | +0.03 each |
| Role specified but **no** trace anywhere on the profile | × 0.6 |

The keywords come from the same OpenAI structured-filter call (fields
`roleKeywords`, `skillKeywords`). The model is instructed to expand
synonyms — "developer" → `["developer", "engineer", "programmer"]`.

After hybrid scoring we apply `minScore = 0.35` (default) as a relevance
floor. The role-required penalty + the floor together prune off-topic
matches like a designer for a "developer" query. Tune `opts.minScore`
per call if you need broader recall (e.g. lower it to `0.2` for sparse
data sets).

The weights and floor are constants at the top of `aiSearchService.js`.
If you change them, re-run the smoke tests in
`server/__tests__/aiSearchService.test.js` (when added).

---

## 4. OpenAI usage

| Purpose | Model | Why |
|---|---|---|
| Resume → structured fields | `gpt-4o-mini` (override: `OPENAI_RESUME_MODEL`) | Cheap, structured-output capable, JSON mode. |
| Query → structured filters | `gpt-4o-mini` | Same. We only ask for non-sensitive filters. |
| Embeddings | `text-embedding-3-small` (override: `OPENAI_EMBEDDING_MODEL`) | 1536-d, cheap (~$0.02 / 1M tokens), strong semantic recall. |

The embedding model dimension (1536) is wired into the Atlas Vector
Search index. **If you change the model, you must rebuild the index.**

---

## 5. MongoDB Atlas Vector Search

Index name: `parsed_resume_vector_index` (override env var:
`PARSED_RESUME_VECTOR_INDEX`).

Definition (paste into Atlas → Search → Create Search Index → JSON):

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    { "type": "filter", "path": "userId" },
    { "type": "filter", "path": "organizationIds" }
  ]
}
```

### Self-hosted MongoDB / local dev

Atlas Vector Search isn't available outside Atlas. The service detects
that and falls back to in-Node cosine similarity automatically. To force
the fallback (e.g. for tests against a local replica set), set:

```
ATLAS_VECTOR_SEARCH_ENABLED=false
```

The fallback loads all `ParsedResume` rows in scope into Node and scores
them. It's correct but doesn't scale past ~10k seekers per org. For
production at scale, **use Atlas**.

---

## 6. Operational runbook

### First-time deploy

1. Set env vars: `OPENAI_API_KEY`, optionally `OPENAI_RESUME_MODEL`,
   `OPENAI_EMBEDDING_MODEL`, `PARSED_RESUME_VECTOR_INDEX`.
2. Run the privacy migration:
   ```
   node server/migrations/strip-sensitive-aiprofile-fields.js
   ```
3. Create the Atlas Vector Search index using the JSON above.
4. Have a SuperAdmin POST `/api/users/job-seekers/parse-resumes` (or any
   org admin POST `/api/organizations/:id/job-seekers/parse-resumes`).
   This is fire-and-forget; the client polls `parse-status`.
5. Smoke test: POST `/api/users/job-seekers/ai-search` with body
   `{ "query": "developer in Pakistan with 5 years experience" }`.

### Re-parsing

The parser is **idempotent** thanks to `inputHash`. Run any time:

- After OpenAI model upgrade (pass `?force=true` from client or
  `{ force: true }` body to re-embed everything).
- After a bulk import.
- After a change to the parsing prompt.

### Adding a new field

1. Confirm with security/product that the field is **not** sensitive.
2. Add it to the `ParsedResume` schema (allowlist).
3. Update the OpenAI prompt in `extractStructured()` to ask for it.
4. Update `buildEmbeddingInput()` if it should influence ranking.
5. Update `searchableText` composition if it should be keyword-searchable.
6. Bump the parser version (a string env var or constant) to invalidate
   `inputHash` and force re-parsing.

### Adding a new sensitive term to the firewall

Add the regex to `SENSITIVE_QUERY_PATTERNS` in
`services/aiSearchService.js`. Tests are in
`server/__tests__/aiSearchService.test.js`.

---

## 7. Auto-parse triggers

The parser runs automatically (fire-and-forget) when:

- A user creates / updates / deletes a `Resume` document
  (`server/routes/resumes.js`)
- A user uploads a resume file via the S3 confirm endpoint
  (`server/routes/uploads.js`)
- A user registers for an event with a resume selected/uploaded
  (`server/routes/events.js`)
- An admin clicks "Index Profiles Now" (manual batch)

If OpenAI is rate-limited the service backs off 10s and retries once.
Failures are logged but never bubble up to the user — search is a
secondary concern when the primary action (registration etc.) succeeds.

---

## 8. Security checklist for code review

When reviewing a PR that touches AI search, verify:

- [ ] No new field on `ParsedResume` reads from `User.survey` or any
      accessibility flag.
- [ ] No new prompt sends `survey`, disabilities, race, gender, etc. to
      OpenAI.
- [ ] No new endpoint accepts a query without going through
      `findSensitiveTerm()` (or directly through `aiSearchService.search`,
      which calls it).
- [ ] No new client UI displays disability / accessibility data fetched
      from a search result.
- [ ] If the embedding model changed, the Atlas index `numDimensions`
      changed too.
- [ ] Migration script reviewed if any field shape changed.

---

## 9. Known limitations / future work

- The query firewall is regex-based. A determined recruiter could attempt
  obfuscation ("people who can't see"). The schema-level guarantee — that
  ParsedResume has no disability data to match against — is the actual
  defense. The query firewall is UX (clear error message) + defense in
  depth.
- Vector search currently filters by `organizationIds` post-fan-out. If a
  seeker is registered with 100 orgs the doc participates in 100 candidate
  pools. Atlas $vectorSearch handles this efficiently; the in-Node
  fallback doesn't.
- We re-embed on every resume change. A hashing optimization is in place
  for non-resume-content edits. If OpenAI cost becomes an issue, a
  smaller distilled model could replace `text-embedding-3-small`.

---

## 10. Quick reference

```
# Trigger global re-parse (SuperAdmin)
curl -X POST $API/api/users/job-seekers/parse-resumes \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"force": true}' -H "Content-Type: application/json"

# Run a search
curl -X POST $API/api/users/job-seekers/ai-search \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"query": "senior backend engineer in Karachi"}'

# Inspect a parsed resume in Mongo shell
db.parsedresumes.findOne({ userId: ObjectId("…") }, { embedding: 0 })

# Verify firewall (should 400 with code: SENSITIVE_QUERY)
curl -X POST $API/api/users/job-seekers/ai-search \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"query": "deaf candidates in Texas"}'
```
