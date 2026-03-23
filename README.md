# NZ Fleet Search — Vehicle Register Lookup

Search the New Zealand motor vehicle fleet by make, model, colour, region and more, using a fast terminal‑style UI backed by a local SQLite/Express API.

---

## Features

- **Rich filtering UI**: Make, model, submodel, colour, fuel type, body type, transmission, region, postcode, import status, usage, NZ assembled, and more.
- **Numeric ranges**: Year, CC rating, power (kW), gross vehicle mass, width, seats, axles.
- **Autocomplete suggestions**: Type‑ahead suggestions for text fields based on existing data.
- **Manual search trigger**: Filters only run when you click **RUN SEARCH** (or press Enter), avoiding constant backend load.
- **Result table**: Sortable columns, zebra‑striped rows, click a row to open full vehicle details.
- **Result breakdown**: Optional breakdown panel showing top fuel types, colours, body types, transmissions, and makes.
- **CSV export**: Download current results as CSV.
- **Sharable URLs**: Filters are encoded into the URL; a **COPY LINK** button puts the current search on your clipboard.
- **Recent queries**: Last few successful searches are saved locally and can be recalled with one click.

---

## Tech stack

- **Frontend**: Vite, React, TypeScript, shadcn‑ui, Tailwind CSS
- **Routing**: `react-router-dom`
- **Data fetching / cache**: `@tanstack/react-query`
- **Backend**: Node.js + Express + `better-sqlite3`

---

## Getting started (local development)

Requirements:

- Node.js 18+ and npm

Install dependencies:

```bash
cd nz-vehicle-finder
npm install
```

### 1. Start the API server

```bash
npm run server
```

By default this listens on `http://localhost:3001` and serves:

- `GET /api/vehicles` — paged vehicle search
- `GET /api/suggestions/:field` — autocomplete suggestions for a given field

### 2. Start the frontend

In a second terminal:

```bash
cd nz-vehicle-finder
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`) in your browser.

---

## Configuration

The frontend talks to the API via a base URL defined in `src/lib/vehicleApi.ts`:

- **Environment variable**: `VITE_API_BASE_URL`
- **Default**: `http://localhost:3001`

When running in production (e.g. on a VPS), set:

```bash
VITE_API_BASE_URL="https://your-api-domain-or-host:port"
```

in your environment (or a `.env` file consumed by your process manager) before running the frontend build.

---

## Building and previewing

Create a production build:

```bash
npm run build
```

Preview the built app locally:

```bash
npm run preview
```

You still need the API server (`npm run server`) running for search to work.

---

## Deployment notes (VPS + domain)

High‑level approach:

1. **API**: Run `npm run server` under a process manager like `pm2` or `systemd`, reverse‑proxied by nginx/Caddy on your chosen API host/domain.
2. **Frontend**: Run `npm run build` and serve the static `dist/` directory via nginx/Caddy (or a static hosting provider).
3. Ensure `VITE_API_BASE_URL` for the frontend points at the public URL of your API (HTTPS recommended).

Once deployed, the app should behave the same as locally: open the frontend URL, set filters, click **RUN SEARCH**, and explore vehicles.

## license

MIT
