#!/usr/bin/env bash
set -euo pipefail

REPO="/home/pi/thundertube"
cd "$REPO"

[ -f ./.env.local.sh ] && . ./.env.local.sh

/usr/bin/git pull --ff-only

# run npm install in case we need to update anything
npm install

# Stop the app’s Node process (pkill exits 1 if nothing matches — don’t fail the script)
pkill -f '/node.* server' || true
sleep 1

exec "$REPO/startup.sh"
