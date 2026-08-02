#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [[ "$TARGET" != "dev" && "$TARGET" != "prod" ]]; then
    echo "Usage: $0 <dev|prod>" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CLIENT_ENV="$ROOT_DIR/client/.env.local"
SERVER_ENV="$ROOT_DIR/server/.env"
RELEASE_ENV="$ROOT_DIR/server/release-${TARGET}.env"

if [[ "$TARGET" == "dev" ]]; then
    PUBLIC_URL="https://access.abilityconnect.online"
else
    PUBLIC_URL="https://abilityconnect.online"
fi
CORS_LINE="CORS_ORIGIN=${PUBLIC_URL}"

for command in node npm python3 zip; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "Required command not found: $command" >&2
        exit 1
    fi
done

if [[ ! -f "$RELEASE_ENV" ]]; then
    echo "Missing private release profile: $RELEASE_ENV" >&2
    exit 1
fi

if [[ ! -f "$CLIENT_ENV" || ! -f "$SERVER_ENV" ]]; then
    echo "Expected client/.env.local and server/.env to exist." >&2
    exit 1
fi

python3 - "$CLIENT_ENV" "$SERVER_ENV" "$RELEASE_ENV" "$PUBLIC_URL" "$CORS_LINE" <<'PY'
import re
import sys
from pathlib import Path

client_path, server_path, profile_path = map(Path, sys.argv[1:4])
public_url, cors_line = sys.argv[4:6]


def read_values(path):
    values = {}
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def update_file(path, replacements):
    lines = path.read_text().splitlines()
    output = []
    replaced = set()

    for line in lines:
        matched_key = None
        for key in replacements:
            if re.match(rf"^\s*#?\s*{re.escape(key)}\s*=", line):
                matched_key = key
                break

        if matched_key is None:
            output.append(line)
        elif matched_key not in replaced:
            output.append(replacements[matched_key])
            replaced.add(matched_key)

    for key, replacement in replacements.items():
        if key not in replaced:
            output.append(replacement)

    path.write_text("\n".join(output) + "\n")


profile = read_values(profile_path)
required = ("MONGODB_URI", "REDIS_URL")
missing = [key for key in required if not profile.get(key)]
if missing:
    raise SystemExit(
        "Private release profile is missing: " + ", ".join(missing)
    )

update_file(
    client_path,
    {
        "REACT_APP_SOCKET_URL": f"REACT_APP_SOCKET_URL={public_url}",
        "REACT_APP_API_URL": f"REACT_APP_API_URL={public_url}",
    },
)
update_file(
    server_path,
    {
        "MONGODB_URI": f"MONGODB_URI={profile['MONGODB_URI']}",
        "REDIS_URL": f"REDIS_URL={profile['REDIS_URL']}",
        "CORS_ORIGIN": cors_line,
        "API_BASE_URL": f"API_BASE_URL={public_url}",
    },
)
PY

echo "Building React client for ${TARGET}..."
npm run build --prefix "$ROOT_DIR/client"

rm -rf "$ROOT_DIR/server/build"
mv "$ROOT_DIR/client/build" "$ROOT_DIR/server/build"

rm -f "$ROOT_DIR/server/be.zip"
(
    cd "$ROOT_DIR/server"
    zip -r be.zip . \
        -x "node_modules/*" \
        -x "be.zip" \
        -x "release-dev.env" \
        -x "release-prod.env" \
        -x "local.env"
)

echo "Release artifact created (${TARGET}): $ROOT_DIR/server/be.zip"
du -h "$ROOT_DIR/server/be.zip"
