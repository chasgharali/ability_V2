# Test Interpreter End Call Fix

## Changes Made

### Backend (`server/routes/videoCall.js`)
1. **Fixed Authorization Check** (lines 447-452):
   - Added interpreters to participant check using `.some()`
   - Added 'Interpreter' and 'GlobalInterpreter' to privileged roles list
   - Enabled authorization enforcement (was commented out)

2. **Added Debug Logging** (lines 432-468):
   - Logs user details (ID, email, role)
   - Logs authorization check details
   - Shows all participants (recruiter, jobseeker, interpreters)
   - Tracks authorization pass/fail

### Frontend (`client/src/components/VideoCall/VideoCall.js`)
1. **Removed Role Restriction** (line 784):
   - Changed from restricting to recruiter only
   - Now allows all participants to end call via API
   - Only checks if callInfo exists

2. **Added Debug Logging** (lines 775-795):
   - Logs user details and call info
   - Tracks API call status
   - Shows if call ID is missing

## How to Test

### Setup
1. Restart the server:
   ```bash
   cd server
   npm run dev
   ```

2. Open browser console (F12) to see debug logs

### Test Steps
1. **Create a Video Call**:
   - Login as recruiter
   - Start a video call with a job seeker

2. **Invite Interpreter**:
   - In the video call, open Participants panel
   - Click "Invite Interpreter"
   - Select an interpreter and send invitation

3. **Join as Interpreter**:
   - Login as interpreter in another browser/incognito
   - Accept the call invitation
   - Verify interpreter joins the call

4. **End Call as Interpreter**:
   - As interpreter, click "End Call" button
   - **Check browser console** for frontend logs:
     - Should see: "🔚 End call initiated by user"
     - Should see: "📞 Calling API to end call: [callId]"
     - Should see: "✅ API call to end call successful"
   
   - **Check server console** for backend logs:
     - Should see: "🔚 End call request"
     - Should see: "🔐 Authorization check" with isParticipant=true
     - Should see: "✅ Authorization passed - ending call"

### Expected Results
✅ Interpreter can successfully end the call
✅ No 403 Forbidden error
✅ All participants are disconnected
✅ Call status updates to 'ended'
✅ Console shows successful authorization

### If Issues Persist
Check the console logs for:
- **Frontend**: Is callId present in callInfo?
- **Backend**: Does the interpreters array contain the interpreter's user ID?
- **Backend**: Is isParticipant showing true?

### Debug Output Examples

**Frontend Success:**
```
🔚 End call initiated by user: {userId: "...", userRole: "Interpreter", callId: "..."}
📞 Calling API to end call: 673a1b2c3d4e5f6a7b8c9d0e
✅ API call to end call successful
🧹 Cleaning up video call...
```

**Backend Success:**
```
🔚 End call request: {callId: "...", userEmail: "interpreter@example.com", userRole: "Interpreter"}
🔐 Authorization check: {isParticipant: true, hasPrivilegedRole: true, ...}
✅ Authorization passed - ending call
```

**Backend Failure (if still broken):**
```
🔚 End call request: {callId: "...", userEmail: "interpreter@example.com", userRole: "Interpreter"}
🔐 Authorization check: {isParticipant: false, hasPrivilegedRole: false, ...}
❌ Authorization failed - not a participant or privileged role
```
