# NZ Vehicle Finder

A powerful, high-performance search application for the New Zealand Motor Vehicle Register. Designed with a clean, terminal-inspired interface, it allows users to filter millions of vehicle records by make, model, geography, and technical specifications.

---

## Key Features

*   **Advanced Filtering**: Search across 17+ dimensions including Make, Model, Colour, Region, Fuel Type, and VIN.
*   **Precision Tools**: Filter using numeric ranges for Year, CC Rating, Power (kW), and Dimensions.
*   **High-Performance**: Utilizes SQLite for local data storage and a fast Express API.
*   **Productivity First**: 
    *   **Autocomplete**: Context-aware suggestions for search fields.
    *   **Sharable Search**: One-click "Copy Link" generates deep-linked URLs for any filtered query.
    *   **Data Export**: Download your filtered datasets as CSV files.
    *   **Query History**: Automatically remembers recent searches for quick recall.
*   **Smart UI**: Interactive result tables, sortable data, and dynamic visual breakdowns (fuel types, makes, body types).

## Live Deployment
You can access the live version of this project at: 
[https://nz-vehicle-finder.co.nz](https://nz-vehicle-finder.co.nz)

## Tech Stack

*   **Frontend**: Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, Lucide React, @tanstack/react-query
*   **Backend**: Node.js, Express, better-sqlite3

## Development Setup

### Prerequisites
*   Node.js 18+
*   npm (or bun)

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

## Deployment & Automation

This project features automated deployment workflows for efficient updates.

### Automated Sync (Post-Commit)
A configured Git `post-commit` hook ensures your production environment stays in sync without manual effort. Every time you run `git commit`, the project:
1. **Syncs**: Uses `rsync` to mirror your workspace to the VPS.
2. **Installs**: Refreshes dependencies (`npm install`).
3. **Builds**: Generates the production build (`npm run build`).

### Deployment Script
The `deploy-to-server.sh` script manages the process. 
*   **Prerequisites**: SSH key-based access to the production server.
*   **Configuration**: Adjust `SERVER`, `REMOTE_DIR`, and `KEY` in the script if your path changes.

## Branding
- **Logo/Favicon**: The project uses a custom-designed "magnifier" SVG favicon, representing the precision of the vehicle search tools.

## License
This project is licensed under the [MIT License](LICENSE).

---

Made with ❤️ by [jedbillyb](https://github.com/jedbillyb)
