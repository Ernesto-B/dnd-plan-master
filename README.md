# D&D Session Master

A local web and desktop app for planning and running D&D / TTRPG campaigns. Build and link sessions, encounters, NPCs, and locations; generate clean PDF + Markdown exports; manage multiple campaigns; and run live sessions from a local-first tool with no external backend.

## Requirements

- Node.js 18 or later
- npm

## Install

```bash
cd dnd-plan-master
npm install
```

Puppeteer will automatically download a compatible version of Chromium on first install (~170 MB).

## Run

```bash
npm start
```

Open **http://localhost:3000** in your browser.

Landing page:
- `/` opens the campaign overview dashboard
- `/sessions` opens the sessions list

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
- Current configured outputs:
  - macOS: `.dmg` and `.zip`
  - Windows: NSIS installer `.exe` and portable `.exe`

## Release Workflow

1. Run `npm install`
2. Run `npm run start:desktop` and smoke-test create / view / export flows
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
| Campaign Dashboard | `localhost:3000` | Active campaign overview with stats, recent records, party snapshot, and continuity summary. |
| Sessions | `localhost:3000/sessions` | Lists all saved sessions. Click any row to view. |
| New Session | `localhost:3000/form` | Session planning form (9 sections). |
| View Session | `localhost:3000/view/:id` | Renders session as formatted markdown. Shows linked encounters and NPCs. |
| Run Session | `localhost:3000/run/:id` | Live session runner — beats tracker, initiative tracker, collapsible sections. |
| Encounters | `localhost:3000/encounters` | Lists all encounter plans. |
| New Encounter | `localhost:3000/encounter/new` | 8-step encounter design form. |
| View Encounter | `localhost:3000/encounter/view/:id` | Renders encounter plan. |
| NPCs | `localhost:3000/npcs` | NPC database — browse, search, and manage all NPCs. |
| New NPC | `localhost:3000/npc/new` | Full NPC creation form (identity, voice, skills, inventory). |
| View NPC | `localhost:3000/npc/view/:id` | NPC profile with linked sessions and encounters. |
| Locations | `localhost:3000/locations` | Location database with linked-session browsing and export support. |
| New Location | `localhost:3000/location/new` | Location creation form for setting, hooks, atmosphere, and linked sessions. |
| View Location | `localhost:3000/location/view/:id` | Location profile with tags and linked sessions. |
| Campaign | `localhost:3000/campaign` | Campaign-level overview: continuity, timeline, and entity graph. |
| Campaigns | `localhost:3000/campaigns` | Campaign manager — create, switch, rename, and delete campaigns. |
| Settings | `localhost:3000/settings` | Party roster, theme, UI scale, autosave, export/import, backups, and keyboard shortcuts. |
| Shell | `localhost:3000/shell` | Optional multi-tab in-app shell for keeping several pages open at once. |

### Creating a session

1. Go to `localhost:3000/form`
2. Fill in the sections (Session Info, Goal & Hook, Beats, Continuity, NPCs, Locations, Faction Clocks, Combat, Notes)
3. In the NPCs and Locations sections, link any existing records you want available from the session
4. Click **Preview Session**
5. Review the rendered markdown, then click **Save to App**

Session data is stored locally. In web mode it uses the repo `data/` folder; in desktop mode it uses the OS app-data directory.

### Multiple campaigns

Each campaign has its own sessions, encounters, NPCs, and party roster. The active campaign is shown in the top nav as a pill button — click it to switch campaigns or go to the campaign manager. Settings are split: appearance (theme, UI scale, shortcuts) is global; party roster is per-campaign.

Existing records without a `campaignId` automatically belong to the default campaign — no migration needed.

From the campaign manager (`/campaigns`) you can also **export** a campaign to a single JSON file (its sessions, encounters, NPCs, and party roster) and **import** that file back in — to move a campaign to another machine, share it with another DM, or keep an off-app backup. Importing always creates a brand-new campaign, so it's safe to try without affecting your existing data.

### Exporting documents

Every session, encounter, NPC, and location view has export actions in the sidebar:

- **Export** — exports the current record only (Markdown and/or PDF)
- **Export with Connections** — exports the record plus all linked records in a single batch

Both open a preview popup listing the files to be saved, format checkboxes (Markdown / PDF), and a **Choose Save Folder** button that opens the OS native folder picker.

### Backups and import/export

Settings includes:

- manual backup creation
- backup restore from timestamped snapshots
- clear-all-data reset for session and encounter stores
- selective JSON export/import for sessions and encounters
- full campaign export/import from the campaign manager for moving an entire campaign between machines

### Running a session

Open any session and click **Run Session** to enter live-session mode. Features:
- Beats tracker with open / middle / escalate / close checkpoints
- Initiative tracker: add combatants, track rounds, and mark the active participant
- Collapsible sections to focus on what matters right now

### Theme and scale persistence

Theme (dark / light) and UI scale are saved server-side and restored across Electron restarts — they do not depend on `localStorage` or port number.

## Project Structure

```
dnd-plan-master/
├── src/
│   ├── app.js                              # Web server launcher
│   ├── createApp.js                        # Express app factory + route registration
│   ├── server.js                           # Server bootstrap (port binding, backup scheduler)
│   ├── routes/
│   │   ├── sessions.js                     # Session CRUD, links, linked-npcs, preview, export
│   │   ├── encounters.js                   # Encounter CRUD, session linking, preview, export
│   │   ├── npcs.js                         # NPC CRUD, linked sessions/encounters, export
│   │   ├── locations.js                    # Location CRUD, linked sessions, tags, export
│   │   ├── campaigns.js                    # Campaign CRUD, switch active, per-campaign settings
│   │   ├── settings.js                     # Global settings, export/import data, and backups
│   │   ├── search.js                       # Global search + entity connection graph
│   │   └── export.js                       # Multi-file save-to-folder endpoint
│   ├── services/
│   │   ├── appPaths.js                     # Web vs Electron data path resolution
│   │   ├── sessionStore.js                 # Session JSON store (CRUD, seed, campaign filter)
│   │   ├── encounterStore.js               # Encounter JSON store (CRUD, seed, campaign filter)
│   │   ├── npcStore.js                     # NPC JSON store (CRUD, seed, link sync)
│   │   ├── locationStore.js                # Location JSON store (CRUD, seed, campaign filter)
│   │   ├── campaignStore.js                # Campaign JSON store (active campaign, per-campaign settings)
│   │   ├── settingsStore.js                # Global settings JSON store
│   │   ├── planRelations.js                # Session ↔ encounter bidirectional link index
│   │   ├── entityConnections.js            # Full entity connection graph builder
│   │   ├── markdownGenerator.js            # Session markdown renderer
│   │   ├── encounterMarkdownGenerator.js   # Encounter markdown renderer
│   │   ├── npcMarkdownGenerator.js         # NPC profile markdown renderer
│   │   ├── locationMarkdownGenerator.js    # Location profile markdown renderer
│   │   ├── pdfGenerator.js                 # Runtime-aware PDF generation (Puppeteer / Electron)
│   │   ├── electronPdfGenerator.js         # Electron-specific PDF via webFrame.printToPDF
│   │   ├── folderPicker.js                 # Native OS folder picker (web + Electron)
│   │   ├── backupScheduler.js              # Scheduled backup interval timer
│   │   └── backupStore.js                  # Backup snapshots: create, list, restore, auto-prune
│   └── templates/
│       ├── pdfTemplate.js                  # Session PDF: two-column print layout
│       ├── encounterPdfTemplate.js         # Encounter PDF: design breakdown, enemies, tactics
│       ├── npcPdfTemplate.js               # NPC PDF: identity, voice, skills, inventory
│       └── locationPdfTemplate.js          # Location PDF: summary, hooks, atmosphere, links
├── electron/
│   └── main.js                             # Electron desktop entry (BrowserWindow, server lifecycle)
├── public/
│   ├── index.html                          # Sessions index
│   ├── form.html                           # Session form
│   ├── view.html                           # Session viewer
│   ├── run.html                            # Session run mode
│   ├── encounters.html                     # Encounters index
│   ├── encounter-form.html                 # Encounter form
│   ├── encounter-view.html                 # Encounter viewer
│   ├── npcs.html                           # NPC index
│   ├── npc-form.html                       # NPC form
│   ├── npc-view.html                       # NPC viewer
│   ├── locations.html                      # Location index
│   ├── location-form.html                  # Location form
│   ├── location-view.html                  # Location viewer
│   ├── campaign.html                       # Campaign continuity + entity graph
│   ├── campaigns.html                      # Campaign manager
│   ├── settings.html                       # Settings page
│   ├── shell.html                          # In-app multi-tab shell
│   ├── fonts/                              # Bundled local fonts (Cinzel, Crimson Pro)
│   ├── css/style.css
│   └── js/
│       ├── index.js                        # Sessions index (search, hover preview, context menu)
│       ├── form.js                         # Session form (NPC cards, locations, clocks, autosave)
│       ├── view.js                         # Session viewer (markdown render, DM modal, export)
│       ├── run.js                          # Run mode (beats tracker, initiative tracker)
│       ├── encounters.js                   # Encounters index
│       ├── encounter-form.js               # Encounter form (enemy cards, tasks, autosave)
│       ├── encounter-view.js               # Encounter viewer
│       ├── npcs.js                         # NPC index
│       ├── npc-form.js                     # NPC form (identity, voice, skills, inventory)
│       ├── npc-view.js                     # NPC viewer
│       ├── locations.js                    # Location index
│       ├── location-form.js                # Location form
│       ├── location-view.js                # Location viewer
│       ├── campaign.js                     # Campaign overview (continuity, timeline, entity graph)
│       ├── campaigns.js                    # Campaign manager (create, switch, rename, delete)
│       ├── settings.js                     # Settings (theme, scale, autosave, party roster, shortcuts)
│       ├── export-dialog.js                # Shared export overlay (format picker, folder save)
│       ├── global-search.js                # Cross-entity search (sigil prefixes, ranked results)
│       ├── hover-preview.js                # Hover card previews for list rows (configurable delay)
│       ├── nav.js                          # Top nav: campaign switcher, create-new dropdown
│       ├── connections-panel.js            # Connections panel (session ↔ encounter ↔ NPC)
│       ├── context-menu.js                 # Right-click context menu and multi-select for list pages
│       ├── search.js                       # Page-level search and filter logic
│       ├── shortcuts.js                    # Keyboard shortcuts (definitions, capture UI, rebind)
│       ├── tags.js                         # TagInput widget
│       ├── dialog.js                       # Confirm/alert/prompt modal dialogs
│       ├── form-utils.js                   # Auto-resize textareas, section TOC, char counters
│       ├── shell.js                        # Multi-tab shell behavior
│       ├── tab-client.js                   # Cross-tab sync via storage events
│       └── theme.js                        # Synchronous theme + scale restore (before paint)
├── data/
│   ├── seed.json                           # Default session seed data
│   ├── sessions.json                       # Live session store
│   ├── encounters.seed.json                # Default encounter seed data
│   ├── encounters.json                     # Live encounter store
│   ├── npcs.seed.json                      # Default NPC seed data
│   ├── npcs.json                           # Live NPC store
│   ├── locations.seed.json                 # Default location seed data
│   ├── locations.json                      # Live location store
│   ├── campaigns.json                      # Campaign list + active campaign ID
│   ├── settings.json                       # Global settings (theme, autosave, shortcuts)
│   └── backups/                            # Timestamped backup snapshots
└── package.json
```

## PDF Layout

Sessions use a two-column, print-optimized layout:

- **Left column**: Opening read-aloud, session beats table, combat encounters
- **Right column**: NPCs, locations, faction clocks
- **Full width**: Session notes (if any)

Designed for Letter paper at ~8.2pt font — fits 1–2 pages for a fully-populated session.

Encounter and NPC PDFs use a single-column layout optimized for their own content.

## Feature Status

- [x] Session planning (9-section structured form)
- [x] Encounter planning (8-step design framework with puzzle-enemy support)
- [x] NPC database — full CRUD with identity, voice, skills, spell list, and inventory
- [x] Location database — full CRUD with tags, linked sessions, and document export
- [x] Link encounters to sessions (bidirectional)
- [x] Link NPCs to sessions and encounters
- [x] Link locations to sessions
- [x] Tagging across sessions, encounters, NPCs, and locations
- [x] Multiple campaigns — per-campaign sessions, encounters, NPCs, and party roster
- [x] Campaign switcher in the top nav on every page
- [x] Campaign manager page (create, rename, switch, delete with cascading record removal)
- [x] Campaign dashboard landing page
- [x] Campaign continuity view with searchable timeline boards
- [x] Entity relationship graph for sessions, encounters, and NPCs
- [x] Unified export dialog — Markdown and/or PDF, choose save folder, single or with connections
- [x] Settings export/import for sessions and encounters
- [x] Campaign bundle export/import for full-campaign transfer
- [x] Manual backups plus restore flow
- [x] Clear-all-data reset in settings
- [x] Party roster with character sheet URL — names become clickable links in all documents
- [x] Light/dark theme persistence and UI scale persistence
- [x] Run-session mode — beats tracker, initiative tracker, collapsible sections
- [x] Search and filtering on list pages
- [x] Global search across sessions, encounters, NPCs, and tags (with sigil prefix support)
- [x] Right-click context menu and multi-select bulk actions on list pages
- [x] Optional in-app multi-tab shell

### Recommended Next Features

Compared with tools like Kanka, World Anvil, and LegendKeeper, the biggest gaps are less about raw CRUD and more about world presentation, player-facing sharing, and reusable GM utilities. That being said, this app is not meant to be player facing at all, and instead is entirely for GM's.

- [ ] Interactive maps and map pins. This is one of the clearest differentiators in tools like LegendKeeper, Kanka, and World Anvil, and it would fit your existing locations model well.
- [ ] Calendars, timelines, and in-world date tracking. You already have continuity notes, but a dedicated campaign calendar with event scheduling and recurrence would make long-form campaign management much stronger.
- [ ] Quest, clue, and thread tracking. A first-class quest/investigation board would help GMs manage active hooks, unresolved clues, owners, status, and payoff.
- [ ] Factions and organizations as their own entity type. Right now faction clocks exist inside sessions; promoting factions to persistent linked records would strengthen campaign-level play.
- [ ] Items, loot, and rewards database. This is a common GM need and would pair naturally with encounters, NPC inventories, and session rewards.
- [ ] Better reusable encounter/session generators. Roll tables, random prompts, and template-driven generators would make prep faster and help the app feel more opinionated rather than just archival.
- [ ] Rich media handouts. Image, audio, and reference handout support would improve live-session usefulness, especially in desktop mode.
- [ ] Stronger player portal or share links. Even a lightweight read-only player codex for approved NPCs, locations, quests, and recaps would set the app apart from purely private note tools.
- [ ] System-neutral extensibility. Custom fields or schema packs for different systems would make this more useful beyond D&D without forcing a rewrite.
