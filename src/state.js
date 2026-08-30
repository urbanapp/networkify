/* ═══ Central mutable state ═══
   Single shared store for everything that crosses module boundaries.
   Modules read and mutate fields directly; short-lived interaction state
   (drag origins, pan anchors, …) stays local to ui/interactions.js. */

function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('iso-settings')) || {}; } catch (e) { /* corrupt storage — use defaults */ }
    return {
        showGrid:    saved.grid ?? true,
        snapToGrid:  saved.snap ?? true,
        // Animation defaults off under prefers-reduced-motion
        animEnabled: saved.anim ?? !matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
}

export const state = {
    /* Model — derived from the DSL text (see editor.js updateFromDsl) */
    parsed: { nodes: new Map(), edges: [], errors: [], lineRefs: new Map() },
    positions: new Map(),        // name → { col, row } — current layout
    customPositions: new Map(),  // name → { col, row } — user-dragged overrides

    /* Viewport */
    view: { x: 0, y: 0, zoom: 1 },

    /* Interaction */
    activeTool: 'select',        // 'select' | 'hand' | 'groupSelect' | 'link'
    selectedNodes: new Set(),
    hoveredCell: null,           // { col, row } | null
    hoveredNode: null,           // node name under the cursor (select/link tools) | null
    marquee: null,               // { startX, startY, endX, endY } | null
    pendingLink: null,           // { from, x, y, target } while dragging a new connection
    drawerNodeName: null,        // node open in the editor drawer, or null
    cursorHighlight: new Set(),  // nodes referenced by the DSL line under the editor cursor
    autotypeRunning: false,      // suppresses editor↔canvas highlights while the demo types

    /* Persisted settings */
    settings: loadSettings(),
};

export function saveSettings() {
    const s = state.settings;
    try {
        localStorage.setItem('iso-settings', JSON.stringify({ grid: s.showGrid, snap: s.snapToGrid, anim: s.animEnabled }));
    } catch (e) { /* storage unavailable (private mode) — settings just won't persist */ }
}
