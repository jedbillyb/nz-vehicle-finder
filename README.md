<div align="center">

<img src="public/favicon.svg" width="128" height="128" alt="NZ Vehicle Finder" />

# NZ Vehicle Finder

**Search 5.9 million records from the New Zealand Motor Vehicle Register.**

[![Live](https://img.shields.io/badge/live-vehiclefinder.co.nz-brightgreen?style=flat-square)](https://vehiclefinder.co.nz)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)

</div>

---

A fast, terminal-inspired search tool for the NZ Motor Vehicle Register. Filter by make, model, region, fuel type, VIN, year range, engine specs, and more - across 17+ dimensions.

## Features

- **Deep filtering** - Make, model, colour, region, fuel type, body style, import status, year, CC, kW, and dimensions
- **Multi-value filters** - Pick several values per field (Red *or* Blue), AND'd across fields
- **Partial matching** - Type `Manual` in Transmission to catch `5-GEAR MANUAL`, `6-GEAR MANUAL` and the rest in one search
- **Autocomplete** - Context-aware suggestions on every search field
- **Adjustable page size** - 50 / 100 / 200 / 500 results per page, remembered between visits
- **Shareable searches** - One-click link generation for any filtered query
- **CSV export** - Download your result set directly
- **Query history** - Recent searches recalled automatically
- **Visual breakdowns** - Dynamic charts for fuel type, make, and body type distributions

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Data fetching | TanStack Query |
| Backend | Node.js, Express, better-sqlite3 |
| Icons | Lucide React |

## Getting Started

```bash
git clone https://github.com/jedbillyb/nz-vehicle-finder.git
cd nz-vehicle-finder
npm install
```

Start the API server (defaults to `http://localhost:3001`):

```bash
npm run server
```

Start the frontend dev server:

```bash
npm run dev
```

### Building the database

The search database is not in the repo - it is built from the NZ Transport Agency's
[vehicle fleet open data](https://nzta.govt.nz/resources/new-zealand-motor-vehicle-register-statistics/new-zealand-vehicle-fleet-open-data-sets),
which NZTA republishes monthly:

```bash
npx tsx database/import-mvr.ts
```

That downloads every vehicle-year file **plus the separate pre-1990 archive**, builds
`database/vehicles.db` from scratch (~6 GB, ~5.9M vehicles, model years 1890 onwards),
creates the indexes, precomputes the breakdown cache and rewrites `public/autocomplete.json`.
It builds into `vehicles.db.new` and only swaps at the end, so a failed run cannot take the
site down; the previous file is kept as `vehicles.db.old`. Restart the API afterwards
(`pm2 restart vehicle-api`) so it opens the new file.

Useful flags: `--no-swap` (build only), `--keep-csv` (keep the downloads), `--only=2026`
(smoke test against a subset).

Re-run it monthly to stay current, and commit the regenerated `public/autocomplete.json`.

### Multi-value filter encoding

Filter fields hold a comma-separated term list (`shared/filterTerms.ts`). A term prefixed
with `~` is a "contains" match, everything else is an exact value; backslash escapes a
literal comma, tilde or backslash. A single plain value is still a valid encoding, so
search links shared before multi-select existed keep working:

```
?MAKE=TOYOTA                        one make
?MAKE=TOYOTA,HONDA                  either make
?TRANSMISSION_TYPE=~MANUAL          any transmission containing "MANUAL"
?TRANSMISSION_TYPE=~MANUAL,6-GEAR%20AUTO
```

Contains terms are resolved against the distinct-value list server-side and expanded into
an `IN (...)`, so they stay on the same index-backed path as an exact match rather than
scanning 5.9M rows with `LIKE '%...%'`.

### Analytics (optional)

Set these env vars to enable PostHog tracking:

```env
VITE_POSTHOG_API_KEY=phc_...
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

Tracked events: page views, searches (with active filters), zero-result queries, CSV exports, and copy-link clicks.

## Deployment

A `post-commit` Git hook automatically syncs, installs, and builds to the VPS on every commit via `rsync`. See `deploy-to-server.sh` - configure `SERVER`, `REMOTE_DIR`, and `KEY` for your environment.

## Troubleshooting

### `better-sqlite3` Version Mismatch
If the backend fails to start after a Node.js update on the server (common error: `NODE_MODULE_VERSION` mismatch), run:
```bash
npm rebuild better-sqlite3
```
This recompiles the database driver for the current environment.

---

<div align="center">
<sub>MIT © <a href="https://vehiclefinder.co.nz">jedbillyb</a> · Made with ❤️</sub>
</div>
