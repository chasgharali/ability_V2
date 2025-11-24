# WebSocket Fix for Elastic Beanstalk Deployment

## Issues Fixed

1. ✅ **Server Socket.IO Configuration**: Updated to work behind Elastic Beanstalk's load balancer
2. ✅ **Server Host Binding**: Changed default to `0.0.0.0` for production to accept external connections
3. ✅ **CORS Configuration**: Updated to support multiple origins and the production domain
4. ✅ **Content Security Policy**: Fixed to allow Google Fonts
5. ✅ **Proxy Trust Settings**: Updated for Elastic Beanstalk's load balancer

## Required Environment Variables for Elastic Beanstalk

You need to set these environment variables in your Elastic Beanstalk environment:

### Server Environment Variables (in EB Configuration)

```bash
NODE_ENV=production
CORS_ORIGIN=https://access.abilityconnect.online
HOST=0.0.0.0
TRUST_PROXY_HOPS=2
```

### Additional Required Variables
Make sure all your other environment variables are set (MongoDB URI, JWT secrets, AWS credentials, etc.)

## Critical: Client Rebuild Required

The client is currently connecting to `http://localhost:5000` because it was built with development settings. You need to rebuild the client with production environment variables:

### Steps to Fix Client:

1. **Create/Update `client/.env.production`**:
```bash
REACT_APP_API_URL=https://access.abilityconnect.online
REACT_APP_SOCKET_URL=https://access.abilityconnect.online
```

2. **Rebuild the client**:
```bash
cd client
npm run build
```

3. **Copy the build to your server**:
```bash
# Copy the built client to server/build directory
cp -r client/build server/build
```

4. **Rebuild and redeploy your Elastic Beanstalk package**:
```bash
cd server
zip -r be.zip . -x "node_modules/\*"
# Then upload be.zip to Elastic Beanstalk
```

## Elastic Beanstalk Load Balancer Configuration

To ensure WebSocket connections work properly, configure your Elastic Beanstalk load balancer:

1. **Enable Sticky Sessions** (recommended for Socket.IO):
   - Go to Elastic Beanstalk Console → Your Environment → Configuration → Load Balancer
   - Enable "Sticky Sessions" with "Application-based" cookies
   - Set cookie expiration to 86400 seconds (24 hours)

2. **Health Check Configuration**:
   - Ensure health check is using `/health` endpoint
   - HTTP code should be `200`

3. **Listener Configuration**:
   - Port 80 (HTTP) → Forward to instance port (8080 or your PORT)
   - Port 443 (HTTPS) → Forward to instance port (8080 or your PORT)

## Testing After Deployment

1. **Check Server Logs**: 
   - Verify server is listening on `0.0.0.0:8080` (or your PORT)
   - Check for Socket.IO connection logs

2. **Check Browser Console**:
   - Should see "Socket connected" message
   - No more "websocket error" messages

3. **Test Socket Connection**:
   - Try sending a message in TeamChat
   - Check if real-time updates work

## What Was Changed in the Code

### `server/index.js`:
- Socket.IO now configured with `allowEIO3`, proper ping timeouts, and transport settings for proxy environments
- Server now binds to `0.0.0.0` in production mode
- CORS supports multiple origins (comma-separated)
- Content Security Policy updated to allow Google Fonts
- Trust proxy settings updated for load balancer (2 hops)

## Next Steps

1. Set environment variables in Elastic Beanstalk
2. Rebuild client with production environment variables
3. Redeploy to Elastic Beanstalk
4. Configure load balancer sticky sessions
5. Test WebSocket connections

## Troubleshooting

If WebSocket still doesn't work after these changes:

1. **Check Elastic Beanstalk Security Groups**: Ensure WebSocket traffic (port 80/443) is allowed
2. **Check Load Balancer Timeout**: Increase idle timeout to at least 60 seconds
3. **Check Server Logs**: Look for Socket.IO connection errors
4. **Verify Environment Variables**: Use EB CLI or Console to verify all env vars are set correctly
5. **Test Direct Connection**: Try connecting directly to the instance IP to rule out load balancer issues

