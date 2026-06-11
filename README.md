# D&D Session Master

Local-first campaign prep and live-play app for D&D / TTRPGs. It runs as:

- a browser app backed by a local Express server
- an Electron desktop app backed by the same local server

The frontend is a Vite + React SPA in `client/`. The backend in `src/` owns all `/api/*` routes, JSON stores, import/export, backups, map persistence, and PDF generation.

## What It Does

- Plan and run sessions
- Build encounter plans
- Manage NPCs, locations, and factions
- Link records across entity types
- Organize multiple campaigns
- Upload and annotate a campaign map
- Explore campaign continuity and relationship graphs
- Export Markdown and PDF files
- Import/export JSON bundles
- Create and restore backups

## Requirements

- Node.js 18+
- npm

## Install

```bash
npm install
```

`puppeteer` downloads a compatible Chromium build during install.

## Run

Web app:

```bash
npm start
```

Open `http://localhost:3000`.

Development mode:

```bash
npm run dev
```

This starts:

- Express on `http://localhost:3000`
- Vite with `/api`, `/vendor`, and `/fonts` proxied to Express

Desktop app:

```bash
npm run start:desktop
```

Desktop packaging:

```bash
npm run build:desktop
npm run dist
```

Platform-specific distributables:

```bash
npm run dist:mac
npm run dist:win
```

## Test

```bash
npm test
```

The repo currently includes Node test coverage for key stores and import/persistence logic.

## Main Routes

| Route | Purpose |
|------|---------|
| `/` or `/campaign` | Campaign dashboard and continuity overview |
| `/graph` | Campaign graph workspace |
| `/sessions` | Session list |
| `/form` | New/edit session form |
| `/view/:id` | Session view |
| `/run/:id` | Full-screen session runner |
| `/encounters` | Encounter list |
| `/encounter/new` | New encounter form |
| `/encounter/edit/:id` | Edit encounter |
| `/encounter/view/:id` | Encounter view |
| `/npcs` | NPC list |
| `/npc/new` | New NPC form |
| `/npc/edit/:id` | Edit NPC |
| `/npc/view/:id` | NPC view |
| `/locations` | Location list |
| `/location/new` | New location form |
| `/location/edit/:id` | Edit location |
| `/location/view/:id` | Location view |
| `/factions` | Faction list |
| `/faction/new` | New faction form |
| `/faction/edit/:id` | Edit faction |
| `/faction/view/:id` | Faction view |
| `/campaigns` | Campaign manager |
| `/map` | Campaign map editor |
| `/settings` | Settings, import/export, backups, archive/trash |

## Core Features

- Session planning with continuity tracking, linked records, preview, PDF, and live run mode
- Encounter planning with preview/export and session linkage
- NPC, location, and faction databases with linked-record navigation
- Campaign dashboard with continuity boards, pickup summary, and relationship explorer
- Dedicated campaign graph workspace at `/graph`
- Map editor with uploaded image, draggable pins, and record links
- Campaign switching and campaign-level import/export
- Archive and trash lifecycle for records
- Manual and scheduled backups
- Theme, UI scale, shortcuts, and party-roster settings

## Campaign Graph Workspace

The graph workspace is now a first-class route at `/graph`.

Current capabilities:

- auto-layout with sessions arranged horizontally as the campaign spine
- relationship edges between sessions, encounters, NPCs, locations, and factions
- pan and zoom canvas controls
- search and type filters
- draggable node positions
- named saved views via `graph-views.json`
- grouping boxes for visual organization

Relevant implementation:

- [client/src/pages/CampaignGraphPage.jsx](/Users/ernestobarreto/Documents/tech_home/personal/dnd-plan-master/client/src/pages/CampaignGraphPage.jsx:1)
- [client/src/pages/campaign/CampaignGraphWorkspace.jsx](/Users/ernestobarreto/Documents/tech_home/personal/dnd-plan-master/client/src/pages/campaign/CampaignGraphWorkspace.jsx:1)
- [src/services/entityConnections.js](/Users/ernestobarreto/Documents/tech_home/personal/dnd-plan-master/src/services/entityConnections.js:1)
- [src/services/graphViewStore.js](/Users/ernestobarreto/Documents/tech_home/personal/dnd-plan-master/src/services/graphViewStore.js:1)

## Data Storage

Web mode stores live data in the repo `data/` directory.

Electron mode stores live data in the OS app-data directory. Seed files still ship from the app bundle, but user-created data does not live in the repo once packaged.

Main persisted files include:

- `campaigns.json`
- `sessions.json`
- `encounters.json`
- `npcs.json`
- `locations.json`
- `factions.json`
- `maps.json`
- `graph-views.json`
- `settings.json`

Seed/demo content includes:

- `seed.json`
- `encounters.seed.json`
- `npcs.seed.json`
- `locations.seed.json`

On first launch, the app initializes a default campaign and seeds a demo campaign.

## Import, Export, and Backups

- Record views support export of the current record or the record plus its connections
- Settings supports selective JSON export/import for records in the active campaign
- Campaign manager supports full-campaign export/import bundles
- Backups can be created manually and restored from Settings
- Record lifecycle tools support archive, trash, restore, and permanent delete

## Architecture

## Frontend

- `client/index.html` bootstraps the SPA and theme
- `client/src/App.jsx` defines React Router routes
- `client/src/components/` contains chrome and shared UI
- `client/src/pages/` contains list, view, campaign, map, run, settings, and form pages
- `client/src/lib/` contains markdown, icons, API helpers, and bridges to a few reused vanilla helpers

## Backend

- `src/createApp.js` wires routes and serves the built SPA from `dist-client/`
- `src/routes/` contains all API routes
- `src/services/` contains stores, import/export logic, graph building, lifecycle helpers, and PDF generation
- `src/templates/` contains HTML templates for PDF output

## Shared Browser Helpers

The app still reuses a small set of classic scripts from `public/js/`:

- `dialog.js`
- `shortcuts.js`
- `tags.js`
- `wiki-links.js`
- `connections-panel.js`
- `export-dialog.js`
- `theme.js`

These are consumed from React via `client/src/lib/vanilla.js`.

## Project Structure

```text
dnd-plan-master/
├── client/
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── components/
│       ├── lib/
│       └── pages/
├── data/
│   ├── *.seed.json
│   ├── campaigns.json
│   ├── graph-views.json
│   ├── locations.json
│   ├── maps.json
│   └── npcs.json
├── electron/
│   ├── main.js
│   └── preload.js
├── public/
│   ├── css/style.css
│   ├── fonts/
│   └── js/
├── src/
│   ├── app.js
│   ├── createApp.js
│   ├── routes/
│   ├── services/
│   └── templates/
├── test/
├── AGENTS.md
├── package.json
└── vite.config.js
```

Note: some live JSON files are created lazily after first write, so a fresh checkout may not contain every store file yet.

## Desktop Build Notes

- `npm run start:desktop` builds the SPA first, then launches Electron
- `npm run build:desktop` creates an unpacked Electron bundle for local testing
- `npm run dist` creates packaged artifacts in `dist/`
- macOS builds should be produced on macOS
- Windows builds should be produced on Windows

## Current Status

- The legacy multi-page frontend has been removed from active use
- Express serves the built SPA for every non-API route
- The React app now owns all user-facing pages
- `AGENTS.md` contains the implementation roadmap, migration log, and pending feature specs
