# NZ Vehicle Finder

A powerful, high-performance search application for the New Zealand Motor Vehicle Register. Designed with a clean, terminal-inspired interface, it allows users to filter millions of vehicle records by make, model, geography, and technical specifications.

## Key Features

- **Advanced Filtering**: Search across 17+ dimensions including Make, Model, Colour, Region, Fuel Type, and VIN.
- **Precision Tools**: Filter using numeric ranges for Year, CC Rating, Power (kW), and Dimensions.
- **High-Performance**: Utilizes SQLite for local data storage and a fast Express API.
- **Productivity First**: 
    - **Autocomplete**: Context-aware suggestions for search fields.
    - **Sharable Search**: One-click "Copy Link" generates deep-linked URLs for any filtered query.
    - **Data Export**: Export search results directly to CSV.
    - **Query History**: Automatically remembers recent searches for quick recall.
- **Smart UI**: Interactive result tables, sortable data, and dynamic visual breakdowns of search results (fuel types, makes, etc.).

## Tech Stack

- **Framework**: Vite + React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Icons**: Lucide React
- **Backend**: Node.js + Express + `better-sqlite3`
- **State/Caching**: `@tanstack/react-query`

## Development Setup

### Prerequisites
- Node.js 18+
- npm (or bun)

### Installation
```bash
git clone https://github.com/jedbillyb/nz-vehicle-finder.git
cd nz-vehicle-finder
npm install
```

### Running Locally
1. **Start the API Server**:
   ```bash
   npm run server
   ```
   (Runs on `http://localhost:3001` by default)

2. **Start the Frontend**:
   ```bash
   npm run dev
   ```

## Deployment & Auto-Sync

This project includes automated deployment capabilities for VPS environments.

### Automated Sync
A `post-commit` Git hook is configured. Every time you run `git commit`, the project automatically:
1. Syncs your local changes to the remote production server via `rsync`.
2. Re-installs dependencies (`npm install`).
3. Re-builds the production bundle (`npm run build`).

**Server Requirements**:
- Ensure your SSH key is added to the remote server's `authorized_keys`.
- The `deploy-to-server.sh` script handles the transfer and build process.

## Branding
- **Logo/Favicon**: The project uses a custom-designed "magnifier" SVG favicon, symbolizing precise vehicle lookup capabilities.

## License
MIT
