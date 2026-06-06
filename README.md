# D&D Session Master

A local web and desktop app for planning D&D sessions. Fill out structured forms and generate clean, print-ready PDF + Markdown files for sessions, encounters, and NPCs.

## Requirements

- Node.js 18 or later
- npm

## Install

```bash
cd dnd-plan-master
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

1. Run `npm install`
2. Run `npm run start:desktop` and smoke test create/view/export flows
3. Run `npm run build:desktop` and verify the unpacked app launches
4. Run `npm run dist` on the target OS
5. Test the generated installer or app bundle from `dist/`

Practical notes:
- Build mac releases on a Mac.
- Build Windows releases on Windows.
- Unsigned builds are fine for local use, but macOS Gatekeeper and Windows SmartScreen may warn when distributing to other machines.

## Usage

| Page | URL | Description |
|------|-----|-------------|
| Sessions | `localhost:3000` | Lists all saved sessions. Click any row to view. |
| New Session | `localhost:3000/form` | Session planning form (9 sections). |
| View Session | `localhost:3000/view/:id` | Renders session as formatted markdown. Shows linked encounters and NPCs. |
| Encounters | `localhost:3000/encounters` | Lists all encounter plans. |
| New Encounter | `localhost:3000/encounter/new` | 8-step encounter design form. |
| View Encounter | `localhost:3000/encounter/view/:id` | Renders encounter plan. |
| NPCs | `localhost:3000/npcs` | NPC database — browse, search, and manage all NPCs. |
| New NPC | `localhost:3000/npc/new` | Full NPC creation form (identity, voice, skills, inventory). |
| View NPC | `localhost:3000/npc/view/:id` | NPC profile with hover-preview support. |
| Campaign | `localhost:3000/campaign` | Campaign-level overview and continuity tracking. |
| Settings | `localhost:3000/settings` | Party roster, theme, autosave, export/import, and backups. |

### Creating a session

1. Go to `localhost:3000/form`
2. Fill in the sections (Session Info, Goal & Hook, Beats, Continuity, NPCs, Locations, Faction Clocks, Combat, Notes)
3. In the NPCs section, select any existing NPCs from the database to link them to the session
4. Click **Preview Session**
5. Review the PDF and Markdown preview, then choose **Save to App** or **Save + Export Files**

Session data is stored locally. In web mode it uses the repo `data/` folder; in desktop mode it uses the OS app-data directory.

### Theme and scale persistence

Theme (dark/light) and UI scale are saved server-side and restored across Electron restarts — they do not depend on localStorage or port number.

## Project Structure

```
dnd-plan-master/
├── src/
│   ├── app.js                          # Web server launcher
│   ├── createApp.js                    # Shared Express app factory
│   ├── server.js                       # Shared server bootstrap
│   ├── routes/
│   │   ├── sessions.js                 # Session CRUD + linked-npcs, links, export-packet
│   │   ├── encounters.js               # Encounter CRUD + session linking
│   │   ├── npcs.js                     # NPC CRUD
│   │   └── settings.js                 # Settings read/write
│   ├── services/
│   │   ├── appPaths.js                 # Web vs Electron data path resolution
│   │   ├── sessionStore.js             # Session JSON store
│   │   ├── encounterStore.js           # Encounter JSON store
│   │   ├── npcStore.js                 # NPC JSON store
│   │   ├── settingsStore.js            # Settings JSON store
│   │   ├── planRelations.js            # Session ↔ encounter link index
│   │   ├── markdownGenerator.js        # Session markdown rendering
│   │   ├── encounterMarkdownGenerator.js
│   │   ├── pdfGenerator.js             # Runtime-aware PDF generation
│   │   ├── electronPdfGenerator.js
│   │   ├── folderPicker.js             # Native folder picker (web + Electron)
│   │   ├── backupScheduler.js          # Scheduled backup snapshots
│   │   ├── backupStore.js              # Backup read/write/restore
│   │   └── templateLibrary.js          # Template storage (internal, UI removed)
│   └── templates/
│       ├── pdfTemplate.js
│       └── encounterPdfTemplate.js
├── electron/
│   └── main.js                         # Electron desktop entrypoint
├── public/
│   ├── index.html                      # Sessions index
│   ├── form.html                       # Session form
│   ├── view.html                       # Session viewer
│   ├── encounters.html                 # Encounters index
│   ├── encounter-form.html             # Encounter form
│   ├── encounter-view.html             # Encounter viewer
│   ├── npcs.html                       # NPC index
│   ├── npc-form.html                   # NPC form
│   ├── npc-view.html                   # NPC viewer
│   ├── campaign.html                   # Campaign overview
│   ├── settings.html                   # Settings page
│   ├── fonts/                          # Bundled local fonts
│   ├── css/style.css
│   └── js/
│       ├── form.js                     # Session form logic
│       ├── view.js                     # Session viewer (linked encounters + NPCs)
│       ├── encounter-form.js           # Encounter form logic
│       ├── encounter-view.js           # Encounter viewer
│       ├── npc-form.js                 # NPC form logic
│       ├── npc-view.js                 # NPC viewer
│       ├── npcs.js                     # NPC index page
│       ├── encounters.js               # Encounters index page
│       ├── index.js                    # Sessions index page
│       ├── settings.js                 # Settings page
│       ├── context-menu.js             # Right-click / ⋮ context menu (all list pages)
│       ├── hover-preview.js            # Hover card previews for sessions, encounters, NPCs
│       ├── form-utils.js               # Auto-resize textareas, section TOC, char counts
│       ├── search.js                   # Search and filter logic
│       ├── tags.js                     # TagInput widget + escHtml
│       ├── dialog.js                   # Confirm/alert modal
│       ├── nav.js                      # Create-new dropdown nav
│       ├── shortcuts.js                # Keyboard shortcuts
│       └── theme.js                    # Synchronous theme + scale restore before paint
├── data/
│   ├── seed.json                       # Default session seed data
│   ├── sessions.json                   # Live session store
│   ├── encounters.seed.json
│   ├── encounters.json                 # Live encounter store
│   ├── npcs.seed.json
│   └── npcs.json                       # Live NPC store
└── package.json
```

## PDF Layout

The PDF uses a two-column, print-optimized layout:

- **Left column**: Opening read-aloud, session beats table, combat encounters
- **Right column**: NPCs, locations, faction clocks
- **Full width**: Session notes (if any)

Designed for Letter paper at ~8.2pt font — fits 1–2 pages for a fully-populated session.

## Feature Status

- [x] Session planning (9-section structured form)
- [x] Encounter planning (8-step design framework)
- [x] NPC database — full CRUD with identity, voice, skills, and inventory
- [x] Link encounters to sessions both ways
- [x] Link NPCs to sessions
- [x] Hover-preview cards for sessions, encounters, and NPCs in list views
- [x] Campaign continuity fields (recap, world-state, threads, NPC status, treasure log)
- [x] Right-click context menu with select mode and bulk operations
- [x] Autosave and draft recovery
- [x] Theme (dark/light) and UI scale — persisted across Electron restarts
- [x] Settings: party roster, autosave toggle, export/import, backup snapshots
- [x] One-click session packet export (session + all linked encounter PDFs)
- [ ] View keybindings by pressing '?'
- [ ] Running-the-session mode (collapsible sections, initiative tracker, beats tracker)
- [ ] Global search across sessions, encounters, NPCs, tags, and locations
- [ ] NPC/location/faction relationship graph
- [ ] Multi-campaign support
- [ ] Per-campaign settings
- [ ] Campaign export/import
- [ ] Tabs/windows support
- [ ] Locations (new page, forms, etc). Can link with sessions/encounters/NPCs
- [ ] Entity connections map/visualizing/searching/etc.

## Known Bugs and Improvements
- Buttons in settings page look greyed out even though they aren't
- Save settings button in settings page should be easier to see. Do we even need this? Can we not just apply/save changes as soon as they are made?
- Verify campaign page working & integrations with other functionality
