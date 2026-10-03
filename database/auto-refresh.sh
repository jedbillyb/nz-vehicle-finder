#!/usr/bin/env bash
# Keep vehicles.db on the latest NZTA snapshot. Run daily from cron on the
# server; on most days NZTA has nothing new and this exits after a few HEAD
# requests.
#
#   30 3 * * * /home/ubuntu/nz-vehicle-finder/database/auto-refresh.sh
#
# Output goes to database/refresh.log.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_ROOT=/var/www/html/nz-vehicle-finder
LOG="$ROOT/database/refresh.log"
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

exec >>"$LOG" 2>&1
# A full rebuild takes a while; never let two overlap.
exec 9>"$ROOT/database/.refresh.lock"
flock -n 9 || { echo "$(date -Is) another refresh is running, skipping"; exit 0; }

cd "$ROOT"
echo "$(date -Is) checking NZTA"

before=$(stat -c %i database/vehicles.db 2>/dev/null || echo none)
npx tsx database/import-mvr.ts --if-newer --drop-old
after=$(stat -c %i database/vehicles.db 2>/dev/null || echo none)

if [ "$before" = "$after" ]; then
  exit 0
fi

# The built site serves its own copy of autocomplete.json as the client-side
# fallback, so it has to follow the database too.
sudo cp public/autocomplete.json "$WEB_ROOT/autocomplete.json"
pm2 restart vehicle-api
echo "$(date -Is) refreshed and restarted vehicle-api"

# Keep the log from growing forever.
tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
