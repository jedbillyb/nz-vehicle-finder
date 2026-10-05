#!/usr/bin/env bash
# Run the whole site on this machine: API on :3001 (restarts on save) and the
# site on :8080 (hot reload). A "Local dev" box on /account signs you in as a
# test user or a test admin, no email needed. Stripe uses the test keys in .env.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$(stat -c %s database/vehicles.db 2>/dev/null || echo 0)" -lt 1000000 ]; then
  echo "database/vehicles.db is missing or empty, so searches will find nothing."
  echo "Copy the live one (about 6 GB):"
  echo "  rsync -z --partial ubuntu@server.jedbillyb.com:nz-vehicle-finder/database/vehicles.db database/"
fi

# Free the ports if an old run is still holding them.
old=$(ss -ltnpH 'sport = :3001 or sport = :8080' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)
if [ -n "$old" ]; then kill $old; sleep 1; fi

# Keep test clicks and test accounts out of the real PostHog project.
export POSTHOG_API_KEY= VITE_POSTHOG_API_KEY=

# A phone on the same wifi opens the site at this address.
ip=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$ip" ] && ip=$(ip -4 route get 1.1.1.1 2>/dev/null | grep -o 'src [0-9.]*' | cut -d' ' -f2)
[ -n "$ip" ] && echo "On your phone: http://$ip:8080"

trap 'kill 0' EXIT
PUBLIC_URL=http://localhost:8080 DEV_LOGIN=1 ADMIN_EMAILS=admin@dev.local \
  npx tsx watch --env-file-if-exists .env server/index.ts &
npx vite --port 8080 --strictPort &
wait
