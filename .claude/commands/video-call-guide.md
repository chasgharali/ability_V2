# Video Call System Guide

Explains how the video call system works in this codebase — architecture, lifecycle, key files, and socket events.

---

## Overview

Video calls use **Twilio Programmable Video** for media transport and **Socket.IO** for signaling and real-time events (captions, chat, participant status). Calls are always between a Recruiter and a Job Seeker, optionally including an Interpreter.

---

## 1. Call Creation (Recruiter → Server)

**Route**: `POST /api/video-call/create` — [server/routes/videoCall.js](server/routes/videoCall.js)

1. Only `Recruiter` can create a call.
2. Atomically moves the BoothQueue entry from `waiting`/`invited` → `in_meeting` to prevent double-booking.
3. Generates a unique Twilio room name: `booth_${boothId}_${jobSeekerId}_${timestamp}`.
4. Creates the Twilio group room via `createOrGetRoom()` — [server/config/twilio.js](server/config/twilio.js).
5. Saves a `VideoCall` document (status: `active`) — [server/models/VideoCall.js](server/models/VideoCall.js).
6. Generates JWT access tokens for both participants using `generateAccessToken(identity, roomName)`.
   - Identity format: `recruiter_${userId}_${ts}` / `jobseeker_${userId}_${ts}`
   - TTL: 3600 s
7. Emits `call_invitation` to the job seeker's socket room (`user:${jobSeekerId}`).
8. Emits `queue-updated` to booth rooms so the queue UI refreshes.

---

## 2. Client Joins the Twilio Room

**File**: [client/src/components/VideoCall/VideoCall.js](client/src/components/VideoCall/VideoCall.js)

**Function**: `initializeCall()` / `initializeCallWithData(data)`

```
createLocalVideoTrack(constraints)   ← camera
createLocalAudioTrack(constraints)   ← microphone
↓
connect(accessToken, { name: roomName, tracks: [video, audio], ... })
↓
setRoom(room)          ← triggers re-render with local video overlay
setLocalTracks([...])  ← stored for mute/toggle
```

After connecting, the client emits `join-video-call` to the socket so the server knows which socket is in which call room (`call_${roomName}`).

---

## 3. Participant Management

### Remote participants (Twilio events)
```
room.on('participantConnected')    → addParticipant(p) → participants Map updated
room.on('participantDisconnected') → removeParticipant(p) → Map updated
```
Each remote participant renders a `<VideoParticipant>` component that subscribes to `trackSubscribed` / `trackUnsubscribed` events and attaches tracks to `<video>` / `<audio>` refs.

### Local video overlay
The local participant's video renders as a small picture-in-picture box (`local-video-overlay`) positioned above the footer. It is a direct child of `.video-call-container-new` (not inside `.video-main-area`) to avoid stacking context issues from `overflow: visible`.

---

## 4. Track Management

| Action | Code |
|--------|------|
| Mute mic | `audioTrack.disable()` |
| Unmute mic | `audioTrack.enable()` |
| Stop video | `videoTrack.disable()` |
| Resume video | `videoTrack.enable()` |
| End call cleanup | `publication.unpublish(); publication.track.stop()` |

Tracks are published automatically when passed to `connect()`. No manual publish step is needed during the call.

---

## 5. Interpreter Flow

1. **Recruiter fetches available interpreters**: `GET /api/video-call/available-interpreters/:boothId`
   - Returns booth-assigned + global interpreters filtered by online status and availability.
2. **Recruiter invites**: `POST /api/video-call/invite-interpreter`
   - Server emits `interpreter_invitation` to the interpreter's socket room.
3. **Interpreter responds**: socket event `interpreter-response` (`accept` or `decline`)
   - On accept: server generates a token, interpreter joins `call_${roomName}` socket room, client receives `interpreter-accepted-confirmation`.
   - On decline: `interpreter-declined` emitted to the call room.

Interpreter status in the `VideoCall` model: `invited → joined | declined | left`.

---

## 6. Caption / Transcription System

Two providers, selected by `CAPTION_PROVIDER` env var (`openai` default, `deepgram` if available).

### Audio path
```
Browser mic → AudioCapture util → socket emit 'caption-audio-stream'
  → server routes chunks to provider (Deepgram WS or OpenAI buffer)
    → transcription callback → io.to('call_${roomName}').emit('caption-transcription', data)
      → all clients display caption
```

### Key socket events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `caption-audio-stream` | client → server | raw PCM audio chunks |
| `caption-started` | server → client | transcription session confirmed |
| `caption-transcription` | server → room | live/final caption text |
| `caption-transcription-broadcast` | client → server | Web Speech API fallback |
| `caption-stop-all` | client → server | stop all captions for the call |

Client stores captions in a `remoteCaptions` Map keyed by participant ID. Live (interim) entries use key prefix `live__${participantId}`; final entries use `${participantId}_${timestamp}`.

**Files**:
- [server/services/deepgramService.js](server/services/deepgramService.js)
- [server/services/openaiCaptionService.js](server/services/openaiCaptionService.js)
- [server/socket/socketHandler.js](server/socket/socketHandler.js) (events ~line 534–620)

---

## 7. Call Termination

### Recruiter ends call for everyone
`POST /api/video-call/end`
1. `endRoom(roomName)` — Twilio API sets room status to `completed`.
2. VideoCall document updated: `status = 'ended'`, `endedAt`, `duration`.
3. BoothQueue entry updated via `queueEntry.leaveQueue()`.
4. Socket emits `call_ended` to `call_${roomName}`.

### Participant leaves (call continues)
`POST /api/video-call/leave`
- Updates participant record; emits `participant_left_call`.

### Client-side cleanup (`cleanupRemainingResources`)
1. Unpublish and stop all local media tracks.
2. Disconnect from Twilio room.
3. `socket.emit('leave-video-call', { roomName })`.
4. Clear state: participants Map, captions, chat messages, timers.

### Unexpected disconnect (socketHandler.js ~line 1249)
On socket `disconnect`: stops caption sessions, sets interpreter status to `left`, removes job seeker from queue, notifies remaining call participants.

---

## 8. Socket Rooms

| Room | Members | Events |
|------|---------|--------|
| `user:${userId}` | one user | `call_invitation`, `interpreter_invitation` |
| `call_${roomName}` | all call participants | `call_ended`, `participant_left_call`, `caption-transcription`, chat |
| `booth_${boothId}` | booth participants | `queue-updated` |
| `booth_management_${boothId}` | booth staff | queue management |
| `role:Interpreter` | all interpreters | interpreter broadcasts |

---

## 9. Key Files

| File | Responsibility |
|------|---------------|
| [server/routes/videoCall.js](server/routes/videoCall.js) | REST API: create, join, end, leave, invite-interpreter |
| [server/socket/socketHandler.js](server/socket/socketHandler.js) | All socket events for calls, captions, interpreter responses |
| [server/models/VideoCall.js](server/models/VideoCall.js) | DB schema: room info, participants, interpreters, chat, quality |
| [server/models/MeetingRecord.js](server/models/MeetingRecord.js) | Persisted meeting metadata after call ends |
| [server/config/twilio.js](server/config/twilio.js) | `generateAccessToken`, `createOrGetRoom`, `endRoom` |
| [server/services/deepgramService.js](server/services/deepgramService.js) | Real-time Deepgram WebSocket transcription |
| [server/services/openaiCaptionService.js](server/services/openaiCaptionService.js) | Buffered OpenAI Whisper transcription |
| [client/src/components/VideoCall/VideoCall.js](client/src/components/VideoCall/VideoCall.js) | Main call UI: room connect, participant grid, captions, controls |
| [client/src/components/VideoCall/VideoParticipant.js](client/src/components/VideoCall/VideoParticipant.js) | Per-participant video/audio track attachment and display |
| [client/src/utils/audioCapture.js](client/src/utils/audioCapture.js) | Captures local mic audio and streams chunks to server |

---

## 10. VideoCall Data Model (key fields)

```js
{
  roomName: String,          // unique Twilio room name
  roomSid: String,           // Twilio room SID
  event, booth, recruiter, jobSeeker: ObjectId,
  queueEntry: ObjectId,      // unique per active call (prevents duplicate calls)
  interpreters: [{
    interpreter: ObjectId,
    category: String,        // ASL, Spanish, French, etc.
    status: 'invited' | 'joined' | 'declined' | 'left'
  }],
  status: 'active' | 'ended' | 'failed',
  duration: Number,          // seconds
  participants: [{
    user: ObjectId,
    role: 'recruiter' | 'jobseeker' | 'interpreter',
    participantSid: String,
    connectionQuality: 'excellent' | 'good' | 'fair' | 'poor'
  }],
  chatMessages: [{ sender, senderRole, message, timestamp, messageType }],
  metadata: {
    interpreterRequested: Boolean,
    interpreterCategory: String
  }
}
```
