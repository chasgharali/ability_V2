#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
CLIENT_ENV="$ROOT_DIR/client/.env.local"
SERVER_ENV="$ROOT_DIR/server/.env"
LOCAL_ENV="${LOCAL_ENV_FILE:-$ROOT_DIR/server/local.env}"

if ! command -v python3 >/dev/null 2>&1; then
    echo "Required command not found: python3" >&2
    exit 1
fi

if [[ ! -f "$LOCAL_ENV" ]]; then
    echo "Missing private local profile: $LOCAL_ENV" >&2
    exit 1
fi

if [[ ! -f "$CLIENT_ENV" || ! -f "$SERVER_ENV" ]]; then
    echo "Expected client/.env.local and server/.env to exist." >&2
    exit 1
fi

python3 - "$CLIENT_ENV" "$SERVER_ENV" "$LOCAL_ENV" <<'PY'
import re
import sys
from pathlib import Path

client_path, server_path, profile_path = map(Path, sys.argv[1:])


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
if not profile.get("MONGODB_URI"):
    raise SystemExit("Private local profile is missing: MONGODB_URI")

local_api = "http://localhost:5000"
update_file(
    client_path,
    {
        "REACT_APP_SOCKET_URL": f"REACT_APP_SOCKET_URL={local_api}",
        "REACT_APP_API_URL": f"REACT_APP_API_URL={local_api}",
    },
)
update_file(
    server_path,
    {
        "MONGODB_URI": f"MONGODB_URI={profile['MONGODB_URI']}",
        "CORS_ORIGIN": "CORS_ORIGIN=http://localhost:3000",
        "API_BASE_URL": f"API_BASE_URL={local_api}",
    },
)
PY

echo "Local env applied:"
echo "  client: REACT_APP_SOCKET_URL, REACT_APP_API_URL -> http://localhost:5000"
echo "  server: API_BASE_URL -> http://localhost:5000"
echo "  server: CORS_ORIGIN -> http://localhost:3000"
echo "  server: MONGODB_URI -> (from server/local.env)"
