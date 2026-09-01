# networkify — Isometric Network Editor

A browser-based isometric network topology editor. Define networks using a simple text DSL and see them rendered as interactive isometric diagrams.

**Live at [networkify.app](https://networkify.app)** (editor: [networkify.app/app/](https://networkify.app/app/)) — fully static, runs entirely in your browser, nothing leaves your machine.

## Development

```
npm install
npm run dev        # dev server with hot reload at http://localhost:5173
```

Built with [Vite](https://vitejs.dev) and vanilla JavaScript ES modules — no framework. CodeMirror 5 is the only runtime dependency (bundled locally, no CDN or internet connection needed).

```
index.html             marketing landing page (self-contained)
app/index.html         editor page shell
src/
  main.js              entry point — wires all modules together
  config.js            shared constants (node types, grid metrics, default DSL)
  state.js             central mutable state + persisted settings
  theme.js             light/dark canvas palettes and toggle
  icons.js             isometric PNG icon loading
  geometry.js          isometric projection math (pure functions)
  layout.js            BFS auto-layout (pure)
  camera.js            zoom / fit-to-view
  dsl/parser.js        DSL text → nodes/edges/errors (pure)
  dsl/edit.js          structured edits back into the DSL text
  editor/editor.js     CodeMirror setup, autocomplete, text → model pipeline
  render/renderer.js   canvas drawing + animation loop
  ui/                  interactions, keyboard, drawer, settings, statusbar, toast, resizer
  export/exporters.js  PNG / SVG / JSON export
  styles/              CSS split by concern (base, editor, canvas, drawer, light)
```

## DSL Syntax

```
# Define connections
web-01:server --- db:database
fw:firewall --- web-01:server

# Standalone nodes
monitor:laptop
```

Available node types: `server`, `database`, `cloud`, `switch`, `router`, `firewall`, `laptop`, `user`

## Features

- Live-updating isometric canvas visualization
- Syntax-highlighted editor with autocomplete and inline error highlighting
- Drag to reposition nodes (multi-select drags the whole group), scroll to zoom towards the cursor
- Right-click or double-click the canvas to create nodes visually
- Marquee selection for bulk operations; `Delete` removes the selection
- Keyboard shortcuts: `V` select, `H` hand, `M` marquee, `Space` temporary pan, `F` fit diagram, `+`/`-`/`0` zoom, `⌘Z` undo
- Export as PNG, SVG, or JSON
- Light/dark canvas theme; settings persist across sessions

## Deployment

```
npm run build      # outputs a fully static site to dist/
npm run preview    # serve the built site locally
```

Deploy `dist/` to any static host (GitHub Pages, Netlify, S3, nginx, …). Asset URLs are relative (`base: './'`), so it works from any subpath. Everything is bundled — no runtime CDN dependencies.

The hosted instance deploys automatically to GitHub Pages on every push to `main` (see `.github/workflows/deploy.yml`).

### Build flags

- `VITE_ADS` — set to `1` to show the (mock) ad slot in the bottom-left corner of the editor pane; anything else hides it. Off by default.

## License

[MIT](LICENSE)
