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

A fast, terminal-inspired search tool for the NZ Motor Vehicle Register. Filter by make, model, region, fuel type, VIN, year range, engine specs, and more — across 17+ dimensions.

## Features

- **Deep filtering** — Make, model, colour, region, fuel type, body style, VIN, year, CC, kW, and dimensions
- **Autocomplete** — Context-aware suggestions on every search field
- **Shareable searches** — One-click link generation for any filtered query
- **CSV export** — Download your result set directly
- **Query history** — Recent searches recalled automatically
- **Visual breakdowns** — Dynamic charts for fuel type, make, and body type distributions

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

### Analytics (optional)

Set these env vars to enable PostHog tracking:

```env
VITE_POSTHOG_API_KEY=phc_...
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

Tracked events: page views, searches (with active filters), zero-result queries, CSV exports, and copy-link clicks.

## Deployment

A `post-commit` Git hook automatically syncs, installs, and builds to the VPS on every commit via `rsync`. See `deploy-to-server.sh` — configure `SERVER`, `REMOTE_DIR`, and `KEY` for your environment.

---

<div align="center">
<sub>MIT © <a href="https://vehiclefinder.co.nz">jedbillyb</a> · Made with ❤️</sub>
</div>
