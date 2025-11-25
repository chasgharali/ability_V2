# Troubleshooting Login 500 Error

## Root Cause

The error `Proxy error: Could not proxy request /api/auth/login from localhost:3000 to http://localhost:5000/ (ECONNREFUSED)` indicates that:

1. **The backend server is not running** on port 5000
2. The React dev server (port 3000) is trying to proxy API requests to the backend, but can't connect

## Solution

### Step 1: Start the Backend Server

You need to start the backend server before the frontend can connect to it.

**Option A: Start server only**
```bash
cd server
npm install  # if you haven't already
npm run dev   # or npm start
```

**Option B: Start both server and client together**
```bash
# From the root directory
npm run dev
```

### Step 2: Verify Server is Running

After starting the server, you should see output like:
```
Server running on localhost:5000 in development mode
Server is ready to accept connections
API endpoints available at http://localhost:5000/api
MongoDB connection attempted
```

### Step 3: Check Port Configuration

- **Server port**: Default is `5000` (set in `server/index.js` or via `PORT` env variable)
- **Client proxy**: Configured to proxy to `http://localhost:5000` (in `client/package.json`)

If you need to change the port:
1. Set `PORT=5000` in your `.env` file in the `server` directory
2. Update `client/package.json` proxy to `"proxy": "http://localhost:5000"`

### Step 4: Check Environment Variables

Make sure you have a `.env` file in the `server` directory with at least:
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/ability_v2
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
```

### Step 5: Verify Database Connection

The server will attempt to connect to MongoDB. In development mode, it will continue even if MongoDB is unavailable, but some features won't work.

## Error Logging Improvements

I've added enhanced error logging that will:
- Log all uncaught exceptions
- Log unhandled promise rejections
- Show detailed error information in the console
- Display errors in the terminal when login fails

## Common Issues

### Port Already in Use
If you see `EADDRINUSE` error:
- Another process is using port 5000
- Kill the process: `npx kill-port 5000` (or find and kill manually)
- Or change the port in your `.env` file

### MongoDB Not Running
- The server will still start in development mode
- But login will fail if MongoDB is required
- Start MongoDB: `mongod` or use MongoDB Atlas

### Missing Environment Variables
- Create a `.env` file in the `server` directory
- Copy from `server/env.example` if available
- Set at least the required variables

## Testing the Connection

Once the server is running, test it:
```bash
curl http://localhost:5000/health
```

You should get a JSON response with server status.

## Next Steps

1. Start the backend server
2. Verify it's running on port 5000
3. Try logging in again
4. Check the terminal for any error messages (they will now be more detailed)

