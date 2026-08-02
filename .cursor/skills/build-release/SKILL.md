---
name: build-release
description: Builds Ability V2 Elastic Beanstalk releases (dev or prod) into server/be.zip. Use when the user asks to make, package, or rebuild a dev/prod release or be.zip artifact.
disable-model-invocation: true
---
# Build Release

Ask which target if unclear (`dev` or `prod`). Run from the repository root:

```bash
bash .cursor/skills/build-release/scripts/build-release.sh <dev|prod>
```

## Targets

### `dev`
- Client: `REACT_APP_SOCKET_URL` / `REACT_APP_API_URL` → `https://access.abilityconnect.online`
- Server: load secrets from ignored `server/release-dev.env`
- Server: `CORS_ORIGIN=https://access.abilityconnect.online`
- Server: `API_BASE_URL=https://access.abilityconnect.online`

### `prod`
- Client: `REACT_APP_SOCKET_URL` / `REACT_APP_API_URL` → `https://abilityconnect.online`
- Server: load secrets from ignored `server/release-prod.env`
- Server: `CORS_ORIGIN=https://abilityconnect.online`
- Server: `API_BASE_URL=https://abilityconnect.online`

## Shared steps

1. Update `client/.env.local` and `server/.env` for the target.
2. Build the React client.
3. Replace `server/build` with `client/build`.
4. Create `server/be.zip`, excluding `node_modules`, the output ZIP, and private release profiles.

Stop and report the exact error if any step fails. On success, report the target, artifact path, and size. Never print secret environment values.
