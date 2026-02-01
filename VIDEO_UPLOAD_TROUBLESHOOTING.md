# Video Upload Troubleshooting Guide

## Error: Request failed with status code 400

This error occurs when the backend API rejects the upload request. Here are the common causes and solutions:

### 1. Check Backend API Endpoint

The upload flow makes these API calls:
```
POST /api/uploads/presign  - Request presigned URL
PUT  [S3 URL]              - Upload to S3
POST /api/uploads/complete - Confirm upload
```

**Check if the backend is running:**
```bash
# In the server directory
cd server
npm start
```

### 2. Verify Environment Variables

The backend needs these environment variables configured:

```env
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region
AWS_S3_BUCKET=your_bucket_name

# Or if using IAM roles
AWS_SDK_LOAD_CONFIG=1
```

**Check server/.env file exists and has correct values**

### 3. Check Authentication Token

The upload requires a valid JWT token:

```javascript
const token = localStorage.getItem('token');
```

**Verify you're logged in:**
- Open browser DevTools → Application → Local Storage
- Check if 'token' exists
- Try logging out and back in

### 4. Check File Size Limits

The backend may have file size limits:

**Common limits:**
- Express body-parser: 100mb default
- AWS S3: 5GB per file
- Nginx: 1mb default (needs configuration)

**Check server configuration:**
```javascript
// server/index.js
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
```

### 5. Check CORS Configuration

If uploading from different domain:

```javascript
// server/index.js
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
```

### 6. Check Backend Logs

Look at server console for detailed error:

```bash
# Server logs will show:
# - Missing AWS credentials
# - Invalid file type
# - Database errors
# - S3 connection issues
```

### 7. Test API Endpoints Manually

Use curl or Postman to test:

```bash
# Test presign endpoint
curl -X POST http://localhost:3000/api/uploads/presign \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test.mp4",
    "fileType": "video",
    "mimeType": "video/mp4"
  }'
```

### 8. Common Backend Issues

#### Missing AWS Credentials
```
Error: Missing credentials in config
```
**Solution:** Configure AWS credentials in server/.env

#### Invalid Bucket Name
```
Error: The specified bucket does not exist
```
**Solution:** Create S3 bucket or update bucket name in .env

#### Permission Denied
```
Error: Access Denied
```
**Solution:** Check IAM permissions for S3 bucket

#### Database Connection
```
Error: Cannot connect to MongoDB
```
**Solution:** Check MongoDB connection string in .env

### 9. Frontend Error Handling

The updated code now shows detailed error messages:

```javascript
catch (err) {
  const errorMessage = err.response?.data?.message || err.message;
  showToast(`Failed to upload: ${errorMessage}`);
}
```

**Check browser console for:**
- Full error stack trace
- API response details
- Network tab for failed requests

### 10. Quick Fixes

#### Clear Browser Cache
```
Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
```

#### Restart Backend Server
```bash
cd server
npm start
```

#### Check Network Tab
1. Open DevTools → Network
2. Try uploading
3. Look for failed requests (red)
4. Click on failed request
5. Check Response tab for error details

### 11. Verify Backend Routes

Check if routes are properly configured:

```javascript
// server/routes/uploads.js
router.post('/presign', auth, uploadsController.presign);
router.post('/complete', auth, uploadsController.complete);
router.get('/stream', uploadsController.stream);
```

### 12. Test with Small File First

Try uploading a very small video file (< 1MB) to rule out:
- Timeout issues
- Size limit issues
- Network issues

### 13. Check MongoDB Connection

If using MongoDB for file metadata:

```bash
# Check if MongoDB is running
mongosh

# Or check connection in server logs
```

### 14. Verify File Type Support

Backend should accept these MIME types:

**Video:**
- video/mp4
- video/quicktime (.mov)
- video/webm
- video/ogg
- video/x-msvideo (.avi)

**Audio:**
- audio/mp3
- audio/wav
- audio/ogg
- audio/webm
- audio/m4a

### 15. Enable Debug Logging

Add more logging to backend:

```javascript
// server/controllers/uploads.js
console.log('Presign request:', req.body);
console.log('User:', req.user);
console.log('AWS Config:', {
  region: process.env.AWS_REGION,
  bucket: process.env.AWS_S3_BUCKET
});
```

## Expected Behavior

When working correctly:
1. User selects video file
2. Syncfusion dialog closes
3. Progress modal appears
4. Progress bar animates 0-100%
5. Video inserts into editor
6. Success toast appears

## Still Having Issues?

1. Check all environment variables
2. Verify AWS credentials
3. Test S3 bucket access
4. Check server logs
5. Test with curl/Postman
6. Verify MongoDB connection
7. Check file size limits
8. Review CORS configuration

The error message in the toast should now show the specific backend error to help diagnose the issue.