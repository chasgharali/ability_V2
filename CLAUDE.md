# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Run both client and server concurrently
npm run dev

# Run individually
npm run server:dev    # Express server (port 5000, nodemon)
npm run client:dev    # React dev server (port 3000)
```

### Building
```bash
npm run build         # Build React client
npm start             # Run production server
```

### Testing
```bash
npm test                        # Run all tests (both client + server)
npm run test:accessibility      # Run accessibility-specific tests

# Run a single test file (from client/ or server/)
cd client && npx react-scripts test --testPathPattern=<filename>
cd server && npx jest <filename>
```

### Linting & Formatting
```bash
npm run lint                    # Lint both client and server
cd client && npm run lint:fix   # Auto-fix client lint issues
cd client && npm run format     # Format with Prettier
```

### Database
```bash
cd server && npm run seed       # Seed users
node server/migrations/<file>   # Run a migration
```

## Architecture

This is a **full-stack Node.js + React application** — not Next.js. The client (React) runs on port 3000 and proxies API requests to the Express server on port 5000.

### Stack
- **Frontend**: React 18, React Router 6, React Hook Form, React Query, Sass
- **UI Components**: Syncfusion EJ2 (grids, calendars, rich text editor, chat), Adobe React Spectrum + React Aria (accessible primitives)
- **Backend**: Express 4, MongoDB + Mongoose 8, Redis (ioredis), Socket.IO 4
- **Real-time/Video**: Socket.IO for queue updates, Twilio Programmable Video for calls
- **External Services**: AWS S3 (file storage), AWS SES (email), Twilio (video/chat), Deepgram (speech-to-text)
- **Auth**: JWT (access + refresh tokens); access token in memory/localStorage, refresh token stored in localStorage and rotated on use

### Directory Layout
```
client/src/
  components/     # Feature-organized React components (35+ modules)
  contexts/       # Auth, Socket, Theme, Toast, RoleMessages providers
  hooks/          # Custom React hooks
  services/       # Axios-based API clients per domain
  utils/          # Helpers and utilities
  constants/      # App-wide constants

server/
  routes/         # 22 Express route files (one per domain)
  models/         # 17 Mongoose schemas
  config/         # database.js, redis.js, twilio.js
  middleware/     # auth.js (JWT), errorHandler.js
  socket/         # socketHandler.js (all Socket.IO events)
  services/       # deepgramService.js, etc.
  utils/          # logger (Winston), mailer, liveStatsStore
  migrations/     # Schema migration scripts
  scripts/        # seedUsers.js
```

### User Roles
Actual role strings used in code: `SuperAdmin`, `Admin`, `AdminEvent`, `BoothAdmin`, `Recruiter`, `Interpreter`, `GlobalInterpreter`, `Support`, `GlobalSupport`, `JobSeeker` — enforced server-side in route middleware and client-side via Auth context. `SuperAdmin` has global (cross-org) access; all others are org-scoped.

### Key Patterns

**Multi-tenancy**: `Organization` model scopes events, booths, users. Most entities carry an `organizationId` field. Recent migration `add-organization-scope.js` added this.

**Queue System**: Job seekers join a real-time queue (Socket.IO rooms). `Queue` and `BoothQueue` models track position. The `liveStatsStore` utility maintains in-memory stats.

**Video Calls**: Twilio Programmable Video tokens are generated server-side. Interpreter support is built in — calls can include a third-party interpreter. `VideoCall` model tracks call state; `MeetingRecord` persists metadata afterward.

**Accessibility First**: WCAG 2.1 AA is a core requirement. The app uses:
- `AccessibilityAnnouncer` for live region announcements
- `FocusManager` for keyboard navigation
- `GlobalRouteObserver` for route-change focus handling
- ESLint `jsx-a11y` rules set to `"error"` — all a11y violations are build-breaking

**File Uploads**: S3 presigned URLs via Multer + AWS SDK. Resumes and media go through `/routes/uploads.js`.

**Mixed JS/TS**: The client codebase uses both `.js` and `.tsx` files (e.g. `AuthContext.js` and `AuthContext.tsx` coexist). Prefer `.js` unless adding new TypeScript; don't convert existing files.

**Environment**: Copy `server/env.example` to `server/.env`. Required services: MongoDB URI, Redis URL, JWT secret, AWS credentials, Twilio credentials, Deepgram API key.
