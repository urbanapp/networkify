# Isometric Network Editor

## Overview
An isometric network topology editor. Users define network diagrams using a text-based DSL in an editor pane (CodeMirror), and the app renders an interactive isometric visualization on an HTML5 canvas.

## Architecture
- **Vite + vanilla JS ES modules** — no framework. Two pages: `index.html` is the static marketing landing (self-contained, inline CSS/JS), `app/index.html` is the editor's slim shell; all editor logic lives in `src/`.
- **Dependencies** (npm, bundled): CodeMirror 5 (editor, simple mode, active-line, show-hint), Vite (dev).
- **Assets**: Isometric PNG icons in `src/assets/icons/` named `{type}-isometric.png`, imported as URLs via `src/icons.js`.

## Module Map (src/)
- `main.js` — entry point; initializes every module and kicks off the first render. Exposes `window.__iso` (state, cmEditor, render, fitView, setZoom, setDslText) for debugging and headless smoke tests.
- `config.js` — constants: `NODE_TYPES`, grid metrics (`TILE_W/TILE_H/ICON_SZ`), zoom limits, `DEFAULT_DSL`.
- `state.js` — single shared mutable store (`state.parsed`, `positions`, `customPositions`, `view`, `selectedNodes`, `settings`, …). Cross-module state lives here; transient drag state stays local to `ui/interactions.js`.
- `dsl/parser.js` — pure: DSL text → `{ nodes, edges, errors }`.
- `dsl/edit.js` — rename/retype/delete nodes applied back into the DSL text.
- `layout.js` — pure BFS tree-layer auto-layout onto the isometric grid.
- `geometry.js` — pure projection math: `iso()`, `screenToGrid()`, `getIsoPath()`, `getDiagramBounds()`.
- `editor/editor.js` — CodeMirror setup + `updateFromDsl()` (the text → parse → layout → render pipeline). Programmatic edits must go through `setDslText()`. Also editor↔canvas linking (`highlightNodeLines`, cursor-line emphasis) and error cycling.
- `render/renderer.js` — owns the canvas; draw functions take explicit `(ctx, cx, cy, zoom)` so PNG export reuses them; render scheduling + edge-dash animation loop; hover/selection emphasis + pending-link preview. Nodes are cached in an offscreen layer between dash frames (idle dash capped at ~33fps) — anything that changes the scene outside requestRender/scheduleRender must call `invalidateScene()`.
- `camera.js` — anchored zoom and fit-to-view.
- `motion.js` — short view/position tweens (respect animEnabled + prefers-reduced-motion), `panToNode`, `tidyLayout`.
- `persistence.js` — localStorage save/restore of DSL + custom positions, share-URL hash encode/decode, Share button. Must not import editor.js (editor.js imports it) — callers pass DSL text in.
- `diagram.js` — `loadDiagram()`: whole-diagram replace (import/templates/reset) via `setDslText`, so it stays undoable.
- `templates.js` — starter topology data + header dropdown + empty-state cards.
- `ui/` — `interactions.js` (canvas mouse + tools incl. link tool), `keyboard.js` (global shortcuts), `drawer.js` (node editor panel), `settings.js`, `statusbar.js`, `toast.js`, `resizer.js`, `importer.js` (JSON/DSL file import + drag-drop), `adslot.js` (mock ad slot, only when `VITE_ADS=1` — off by default, incl. production).
- `export/exporters.js` — PNG/SVG/JSON export + menu.
- Module graph is a DAG — where two modules would need each other (theme ↔ renderer), `main.js` injects a callback instead. Keep it cycle-free.

## DSL Syntax
```
# Comments start with # or //
name:type --- name:type    # Connection between two nodes
name:type                  # Standalone node declaration
```
Node types: `server`, `database`, `cloud`, `switch`, `router`, `firewall`, `laptop`, `user`. Default type is `server` if omitted.

## Development
- `npm run dev` — dev server with HMR (http://localhost:5173)
- `npm run build` — static production build to `dist/` (relative base, deployable anywhere)
- `npm run preview` — serve the built `dist/`

## Deployment
- Open source (MIT), repo: `github.com/urbanapp/networkify`.
- GitHub Actions (`.github/workflows/deploy.yml`) builds and deploys to GitHub Pages on every push to `main` → custom domain `networkify.app` (DNS: Cloudflare; the github.io URL 301s here). Landing: `networkify.app/`, editor: `networkify.app/app/`. SEO files: `public/robots.txt`, `public/sitemap.xml`; landing images in `public/landing-img/`.
- Env flags are set in the workflow (`VITE_ADS: '0'` — flip to `'1'` to show the ad slot).

## Conventions
- Vanilla JS only — no frameworks; avoid new npm dependencies unless asked
- One concern per module; new cross-module state goes in `state.js`, new constants in `config.js`
- Section headers use box-drawing comment style: `/* ── Section ──── */` in CSS, `/* ═══ Section ═══ */` in JS
- CSS is split by concern in `src/styles/` (`base`, `editor`, `canvas`, `drawer`, `light`); light-theme overrides live only in `light.css` and must load last
- Dark purple theme: background `#0f1117`/`#1a1d2e`, accent `#9b6dff`/`#7c5cbf`, text `#c0c6e0`
- The editor defaults to dark; light is opt-in only (saved `iso-theme` — no OS-preference fallback, mirrored by the pre-paint script in `app/index.html`)
