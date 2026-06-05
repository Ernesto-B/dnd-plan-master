# D&D Session Master

A local web and desktop app for planning D&D sessions. Fill out a structured form and generate a clean print-ready PDF + Markdown file for each session.

## Requirements

- Node.js 18 or later
- npm
## Install

```bash
cd dnd-session-master
npm install
```

Puppeteer will automatically download a compatible version of Chromium on first install (~170MB).

## Run

```bash
npm start
```

Open **http://localhost:3000** in your browser.

## Desktop Run

To launch the standalone Electron app during development:

```bash
npm run start:desktop
```

This opens D&D Session Master in its own desktop window rather than a browser tab.

## Desktop Builds

For local desktop packaging:

```bash
npm run build:desktop
```

For a distributable build on the current machine:

```bash
npm run dist
```

For explicit platform-targeted builds:

```bash
npm run dist:mac
npm run dist:win
```

Notes:
- macOS builds should be produced on macOS.
- Windows builds are best produced on Windows.
- In desktop mode, app data is stored in the OS app-data folder rather than the repo `data/` directory.
- `npm run build:desktop` creates an unpacked app bundle for local smoke testing.
- `npm run dist` creates installable/release artifacts in `dist/`.
- Current configured outputs are:
- macOS: `.dmg` and `.zip`
- Windows: `NSIS` installer `.exe` and portable `.exe`

## Release Workflow

Recommended release workflow:

1. Run `npm install`
2. Run `npm run start:desktop` and smoke test create/view/export flows
3. Run `npm run build:desktop` and verify the unpacked app launches
4. Run `npm run dist` on the target OS
5. Test the generated installer or app bundle from `dist/`

Practical notes:
- Build mac releases on a Mac.
- Build Windows releases on Windows.
- Unsigned builds are fine for local use, but macOS Gatekeeper and Windows SmartScreen may warn when distributing to other machines.
- Adding an app icon and code signing should be the next distribution polish step when you are ready.

## Usage

| Page | URL | Description |
|------|-----|-------------|
| Sessions Index | `localhost:3000` | Lists all saved sessions. Click any row to view it. |
| New Session | `localhost:3000/form` | The planning form. |
| View Session | `localhost:3000/view/:id` | Renders the session as formatted markdown. |

### Creating a session

1. Go to `localhost:3000/form`
2. Fill in the sections (Session Info, Goal, Beats, NPCs, Locations, etc.)
3. Click **Generate & Save Files**
4. A native folder picker opens — choose where to save the files
5. Two files are written to your chosen folder:
   - `session-001.md` — well-structured markdown for reference
   - `session-001.pdf` — compact 1–2 page print-ready reference sheet

Session data is stored locally. In web mode it uses the repo `data/` folder; in desktop mode it uses the OS app-data directory for the app.

### File picker note

The folder picker is handled locally by the app server in web mode and by Electron in desktop mode.

## Project Structure

```
dnd-session-master/
├── src/
│   ├── app.js                    # Web server launcher
│   ├── createApp.js              # Shared Express app factory
│   ├── server.js                 # Shared server bootstrap
│   ├── routes/
│   │   ├── sessions.js           # Session API routes
│   │   ├── encounters.js         # Encounter API routes
│   │   └── settings.js           # Settings API routes
│   ├── services/
│   │   ├── appPaths.js           # Web vs Electron path handling
│   │   ├── sessionStore.js       # Session JSON store
│   │   ├── encounterStore.js     # Encounter JSON store
│   │   ├── markdownGenerator.js  # Session markdown rendering
│   │   ├── encounterMarkdownGenerator.js
│   │   ├── pdfGenerator.js       # Runtime-aware PDF generation
│   │   └── electronPdfGenerator.js
│   └── templates/
│       ├── pdfTemplate.js
│       └── encounterPdfTemplate.js
├── electron/
│   └── main.js                   # Electron desktop entrypoint
├── public/
│   ├── index.html                # Sessions index page
│   ├── form.html                 # New session form
│   ├── view.html                 # Session viewer
│   ├── fonts/                    # Bundled local fonts
│   ├── css/style.css
│   └── js/
│       ├── form.js
│       ├── encounter-form.js
│       ├── index.js
│       ├── encounters.js
│       ├── view.js
│       ├── encounter-view.js
│       ├── search.js
│       └── tags.js
├── data/
│   ├── seed.json
│   └── encounters.seed.json
└── package.json
```

## PDF Layout

The PDF uses a two-column, print-optimized layout:

- **Left column**: Opening read-aloud, session beats table, combat encounters
- **Right column**: NPCs, locations, faction clocks
- **Full width**: Session notes (if any)

Designed for Letter paper at ~8.2pt font — fits 1–2 pages for a fully-populated session.

## Future Improvements

The app already covers the core planning loop well: create, save, export, and revisit. The biggest remaining opportunities are around live session support, continuity tracking, and faster retrieval as a campaign grows.

High-value additions to consider next:

1. Session prep from reusable building blocks
- Reusable NPC library
- Reusable location library
- Reusable faction/clock templates
- Reusable encounter templates

2. Better cross-linking between plans
- Link encounters to sessions both ways
- Link NPCs, locations, and factions across sessions
- Show where an entity or plan has been used before

3. Campaign timeline and continuity tracking
- Session recap field
- World-state changes
- Unresolved threads
- NPC status changes
- Treasure and rewards log

4. Running-the-session mode
- Collapsible sections
- Pin important notes
- Initiative scratchpad
- Live checklist or beats tracker
- Reveal-only-what-I-need presentation

5. Search and filtering depth
- Global search across sessions, encounters, tags, NPC names, and locations
- Filters by arc, date, level, faction, or unresolved status
- Saved searches or quick filters

6. Relationships and campaign graph
- NPC to faction, session, location, and encounter links
- Relationship notes between entities

7. Stronger export and print support
- One-click session packet export
- Combined export of a session and its linked encounters
- Print-friendly DM table mode

8. Autosave and draft recovery
- Save unfinished forms automatically
- Restore drafts after a restart or crash
- Optional toggle in settings

9. Better settings and backup safety
- Safer backup and restore workflows
- Import preview with duplicate handling
- Restorable backup snapshots

10. Campaign-level structure
- Multiple campaigns
- Separate data per campaign
- Campaign-specific NPCs, party, and settings

Compared with other campaign planning tools, the biggest remaining gaps are multi-campaign organization, entity databases instead of only document-style plans, timeline/history views, stronger live-play tooling, and player-knowledge versus DM-knowledge separation.
