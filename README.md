# D&D Session Master

A local web app for planning D&D sessions. Fill out a structured form and generate a clean print-ready PDF + Markdown file for each session.

## Requirements

- Node.js 18 or later
- npm
- Google Chrome (required for the native folder picker dialog)

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

Open **http://localhost:3000** in Chrome.

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

Session data is also stored locally in `data/sessions.json` so you can browse and view past sessions in the browser at any time.

### File picker note

The folder picker uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API), which is only supported in **Chrome and Edge**. In other browsers, files will download to your default downloads folder instead.

## Project Structure

```
dnd-session-master/
├── src/
│   ├── app.js                    # Express server entry point
│   ├── routes/
│   │   └── sessions.js           # API routes
│   ├── services/
│   │   ├── sessionStore.js       # Read/write data/sessions.json
│   │   ├── markdownGenerator.js  # Builds the .md file content
│   │   └── pdfGenerator.js       # Puppeteer PDF rendering
│   └── templates/
│       └── pdfTemplate.js        # HTML/CSS template for the PDF
├── public/
│   ├── index.html                # Sessions index page
│   ├── form.html                 # New session form
│   ├── view.html                 # Session viewer
│   ├── css/style.css
│   └── js/
│       ├── form.js               # Form logic + file saving
│       ├── index.js              # Index page
│       └── view.js               # View page
├── data/
│   └── sessions.json             # Auto-created on first save
└── package.json
```

## PDF Layout

The PDF uses a two-column, print-optimized layout:

- **Left column**: Opening read-aloud, session beats table, combat encounters
- **Right column**: NPCs, locations, faction clocks
- **Full width**: Session notes (if any)

Designed for Letter paper at ~8.2pt font — fits 1–2 pages for a fully-populated session.
