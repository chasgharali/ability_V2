---
name: set-local-env
description: Switches Ability V2 client and server environment files to local development URLs and the local MongoDB database. Use when the user asks to set local env, switch to localhost, or restore local development config.
disable-model-invocation: true
---
# Set Local Env

Run from the repository root:

```bash
bash .cursor/skills/set-local-env/scripts/set-local-env.sh
```

The script:

1. Sets client `REACT_APP_SOCKET_URL` and `REACT_APP_API_URL` to `http://localhost:5050` (Socket.IO/API live on the Express server; macOS AirPlay often blocks 5000).
2. Sets server `API_BASE_URL=http://localhost:5050` and `PORT=5050`.
3. Sets server `CORS_ORIGIN=http://localhost:3000`.
4. Loads `MONGODB_URI` from the ignored `server/local.env`.

Does not build or zip. Stop and report the exact error if any step fails. On success, confirm which keys were updated. Never print secret environment values.
