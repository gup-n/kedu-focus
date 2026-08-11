#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -f "$SCRIPT_DIR/.env" ]]; then
  echo "Missing $SCRIPT_DIR/.env. Copy .env.example to .env and edit it first." >&2
  exit 1
fi

set -a
source "$SCRIPT_DIR/.env"
set +a
cd "$SCRIPT_DIR"
exec python3 server.py
