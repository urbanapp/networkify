/* ═══ Canvas Interactions ═══
   Mouse handling on the canvas (pan, node drag, marquee, hover, click-to-add,
   link-drag, right-drag quick-link, wheel zoom) and tool switching. Transient
   drag state lives here; anything the renderer needs (marquee rect, hovered
   cell/node, pending link, selection) lives in state. */

import { ICON_SZ } from '../config.js';
import { state } from '../state.js';
import { iso, screenToGrid } from '../geometry.js';
import { canvas, getViewCenter, requestRender } from '../render/renderer.js';
import { setZoom } from '../camera.js';
import { cmEditor, setDslText } from '../editor/editor.js';
import { openDrawer, closeDrawer, closeDrawerPanel } from './drawer.js';
import { toast } from './toast.js';
import { persistState, setSuppressPersist } from '../persistence.js';

/* Transient interaction state (never rendered directly) */
let panning = false;
let middlePanning = false;          // middle-button pan, works from any tool
let dragStart = { x: 0, y: 0 };
let mouseDownPos = null;
let draggingNode = null;
let dragStartGrid = null;
let dragOrigPositions = new Map();
let rightLinkDrag = false;          // a link drag started with the right button
let rightDownPos = null;
let suppressContextCreate = false;  // eat the contextmenu that follows a right-drag link

export function hitTestNode(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const { cx, cy } = getViewCenter();
    const hitR = ICON_SZ * state.view.zoom / 2;

    let best = null, bestDist = Infinity;
    for (const [name, pos] of state.positions) {
        const s = iso(pos.col, pos.row);
        const sx = cx + s.x * state.view.zoom;
        const sy = cy + s.y * state.view.zoom;
        const dx = mx - sx, dy = my - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < hitR && dist < bestDist) {
            best = name;
            bestDist = dist;
        }
    }
    return best;
}

/* ── Link cursor ────────────────────────────────────────────────────────────── */
/* Reticle with a chain-link badge, shown when the link tool (or an in-progress
   link drag) is over a node it can connect. Hotspot sits on the reticle centre;
   falls back to the native "alias" cursor where SVG cursors are unsupported. */
const LINK_CURSOR_SVG =
    `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'>` +
    `<g fill='none' stroke-linecap='round' stroke-linejoin='round'>` +
    `<g stroke='#10121a' stroke-width='4.5'>` +
    `<path d='M11 2.5v4M11 19.5v4M2.5 11h4M19.5 11h4'/><circle cx='11' cy='11' r='3.5'/></g>` +
    `<path d='M11 2.5v4M11 19.5v4M2.5 11h4M19.5 11h4' stroke='#fff' stroke-width='2'/>` +
    `<circle cx='11' cy='11' r='3.5' stroke='#9b6dff' stroke-width='2'/>` +
    `<g transform='translate(15.5 15.5) scale(0.5)'>` +
    `<g stroke='#10121a' stroke-width='7'>` +
    `<path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'/>` +
    `<path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'/></g>` +
    `<g stroke='#b48cff' stroke-width='3.2'>` +
    `<path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'/>` +
    `<path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'/></g>` +
    `</g></g></svg>`;
const LINK_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(LINK_CURSOR_SVG)}") 11 11, alias`;

/* ── Tool switching ─────────────────────────────────────────────────────────── */
function applyToolCursor() {
    const tool = state.activeTool;
    if (tool === 'hand') canvas.style.cursor = 'grab';
    else if (tool === 'groupSelect' || tool === 'link') canvas.style.cursor = 'crosshair';
    else canvas.style.cursor = 'default';
}

export function setActiveTool(tool) {
    state.activeTool = tool;
    document.querySelectorAll('#toolbar button').forEach(b => b.classList.remove('active'));
    const map = { hand: 'toolHand', select: 'toolSelect', groupSelect: 'toolGroupSelect', link: 'toolLink' };
    document.getElementById(map[tool]).classList.add('active');
    // Reset state when switching
    state.marquee = null;
    state.pendingLink = null;
    state.hoveredNode = null;
    draggingNode = null;
    panning = false;
    middlePanning = false;
    rightLinkDrag = false;
    applyToolCursor();
    requestRender();
}

/* ── Create node: right-click or double-click empty cell (Select tool) ──────── */
function generateNodeName() {
    let i = 1;
    while (state.parsed.nodes.has('node-' + i)) i++;
    return 'node-' + i;
}

function createNodeAtScreen(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const { cx, cy } = getViewCenter();
    const grid = screenToGrid(mx, my, cx, cy, state.view.zoom);
    const cellCol = Math.floor(grid.col) + 0.5;
    const cellRow = Math.floor(grid.row) + 0.5;

    // Check if a node already occupies this cell
    for (const [, p] of state.positions) {
        if (Math.abs(p.col - cellCol) < 0.1 && Math.abs(p.row - cellRow) < 0.1) {
            toast('That cell is occupied');
            return;
        }
    }

    const name = generateNodeName();
    setSuppressPersist(false);
    state.customPositions.set(name, { col: cellCol, row: cellRow });
    const text = cmEditor.getValue();
    setDslText(text + (text.endsWith('\n') ? '' : '\n') + name + ':server');
    openDrawer(name);
}

/* ── Link creation (link tool / Alt+drag / right-drag from a node) ──────────── */
function startPendingLink(from, e) {
    const rect = canvas.getBoundingClientRect();
    state.pendingLink = { from, x: e.clientX - rect.left, y: e.clientY - rect.top, target: null };
    requestRender();
}

/* Abort an in-progress link drag (Escape). Returns true if one was active. */
export function cancelPendingLink() {
    if (!state.pendingLink) return false;
    state.pendingLink = null;
    rightLinkDrag = false;
    rightDownPos = null;
    applyToolCursor();
    requestRender();
    return true;
}

function finishPendingLink() {
    const { from, target } = state.pendingLink;
    state.pendingLink = null;

    if (!target || target === from) {
        requestRender();
        return;
    }
    if (state.parsed.nodes.get(from)?.conns.has(target)) {
        toast(`${from} and ${target} are already connected`);
        requestRender();
        return;
    }

    setSuppressPersist(false);
    const text = cmEditor.getValue();
    setDslText(text + (text.endsWith('\n') ? '' : '\n') + `${from} --- ${target}`);
}

/* ── Mouse handlers ─────────────────────────────────────────────────────────── */
function onMouseDown(e) {
    if (rightLinkDrag) return; // ignore other buttons while a right-drag link is live

    if (e.button === 1) {
        // Middle-button drag pans regardless of the active tool
        e.preventDefault(); // suppress browser autoscroll
        if (state.pendingLink) return;
        middlePanning = true;
        dragStart = { x: e.clientX - state.view.x, y: e.clientY - state.view.y };
        canvas.style.cursor = 'grabbing';
        return;
    }

    if (e.button === 2) {
        // Right-press on a node starts a quick link: hold, drag onto a target,
        // release to connect. Works from any tool; the tool itself is untouched.
        if (state.pendingLink) return; // an Alt+drag link is already in progress
        const hit = hitTestNode(e.clientX, e.clientY);
        if (hit) {
            rightLinkDrag = true;
            suppressContextCreate = true;
            rightDownPos = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'crosshair';
            startPendingLink(hit, e);
        }
        return;
    }

    if (e.button !== 0) return; // left-click only from here on
    mouseDownPos = { x: e.clientX, y: e.clientY };

    if (state.activeTool === 'hand') {
        panning = true;
        dragStart = { x: e.clientX - state.view.x, y: e.clientY - state.view.y };
        canvas.style.cursor = 'grabbing';

    } else if (state.activeTool === 'select') {
        const hit = hitTestNode(e.clientX, e.clientY);
        if (hit && e.altKey) {
            // Alt+drag from a node starts a connection instead of a move
            startPendingLink(hit, e);
        } else if (hit) {
            draggingNode = hit;
            // Grabbing a selected node drags the entire selection
            const group = (state.selectedNodes.has(hit) && state.selectedNodes.size > 1) ? [...state.selectedNodes] : [hit];
            const rect = canvas.getBoundingClientRect();
            const { cx, cy } = getViewCenter();
            dragStartGrid = screenToGrid(e.clientX - rect.left, e.clientY - rect.top, cx, cy, state.view.zoom);
            dragOrigPositions = new Map();
            for (const n of group) {
                const p = state.positions.get(n);
                if (p) dragOrigPositions.set(n, { col: p.col, row: p.row });
            }
            canvas.style.cursor = 'grabbing';
        } else {
            panning = true;
            dragStart = { x: e.clientX - state.view.x, y: e.clientY - state.view.y };
        }

    } else if (state.activeTool === 'link') {
        const hit = hitTestNode(e.clientX, e.clientY);
        if (hit) {
            startPendingLink(hit, e);
        } else {
            panning = true;
            dragStart = { x: e.clientX - state.view.x, y: e.clientY - state.view.y };
        }

    } else if (state.activeTool === 'groupSelect') {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        state.marquee = { startX: mx, startY: my, endX: mx, endY: my };
    }
}

function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { cx, cy } = getViewCenter();

    // Update hovered cell (all tools)
    const grid = screenToGrid(mx, my, cx, cy, state.view.zoom);
    const newCol = Math.floor(grid.col);
    const newRow = Math.floor(grid.row);
    if (!state.hoveredCell || state.hoveredCell.col !== newCol || state.hoveredCell.row !== newRow) {
        state.hoveredCell = { col: newCol, row: newRow };
        if (!draggingNode && !panning && !middlePanning && !state.marquee && !state.pendingLink) requestRender();
    }

    // Middle-button pan overrides per-tool handling
    if (middlePanning) {
        state.view.x = e.clientX - dragStart.x;
        state.view.y = e.clientY - dragStart.y;
        requestRender();
        return;
    }

    // A link drag in progress overrides per-tool handling
    if (state.pendingLink) {
        state.pendingLink.x = mx;
        state.pendingLink.y = my;
        state.pendingLink.target = hitTestNode(e.clientX, e.clientY);
        const t = state.pendingLink.target;
        canvas.style.cursor = t && t !== state.pendingLink.from ? LINK_CURSOR : 'crosshair';
        requestRender();
        return;
    }

    if (state.activeTool === 'hand') {
        if (panning) {
            state.view.x = e.clientX - dragStart.x;
            state.view.y = e.clientY - dragStart.y;
            requestRender();
        }

    } else if (state.activeTool === 'select') {
        if (draggingNode) {
            const g = screenToGrid(mx, my, cx, cy, state.view.zoom);
            const dc = g.col - dragStartGrid.col;
            const dr = g.row - dragStartGrid.row;
            for (const [n, orig] of dragOrigPositions) {
                state.positions.set(n, { col: orig.col + dc, row: orig.row + dr });
            }
            requestRender();
        } else if (panning) {
            const pdx = e.clientX - mouseDownPos.x;
            const pdy = e.clientY - mouseDownPos.y;
            if (pdx * pdx + pdy * pdy > 25) {
                state.view.x = e.clientX - dragStart.x;
                state.view.y = e.clientY - dragStart.y;
                requestRender();
            }
        } else {
            const hit = hitTestNode(e.clientX, e.clientY);
            canvas.style.cursor = hit ? 'grab' : 'default';
            if (hit !== state.hoveredNode) {
                state.hoveredNode = hit;
                requestRender();
            }
        }

    } else if (state.activeTool === 'link') {
        if (panning) {
            state.view.x = e.clientX - dragStart.x;
            state.view.y = e.clientY - dragStart.y;
            requestRender();
        } else {
            const hit = hitTestNode(e.clientX, e.clientY);
            canvas.style.cursor = hit ? LINK_CURSOR : 'crosshair';
            if (hit !== state.hoveredNode) {
                state.hoveredNode = hit;
                requestRender();
            }
        }

    } else if (state.activeTool === 'groupSelect') {
        if (state.marquee) {
            state.marquee.endX = mx;
            state.marquee.endY = my;
            requestRender();
        }
    }
}

function onMouseUp(e) {
    if (e.button === 1) {
        middlePanning = false;
        applyToolCursor();
        return;
    }
    if (e.button === 2 && rightLinkDrag) {
        rightLinkDrag = false;
        if (state.pendingLink) {
            const moved = rightDownPos ? Math.hypot(e.clientX - rightDownPos.x, e.clientY - rightDownPos.y) : 0;
            const { from, target } = state.pendingLink;
            if (moved < 5 && (!target || target === from)) {
                toast('Hold right-click and drag onto another node to link');
            }
            finishPendingLink();
        }
        rightDownPos = null;
        applyToolCursor();
        return;
    }
    if (e.button !== 0) return;
    const dx = mouseDownPos ? e.clientX - mouseDownPos.x : 0;
    const dy = mouseDownPos ? e.clientY - mouseDownPos.y : 0;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (state.pendingLink) {
        if (rightLinkDrag) return; // stray left release during a right-drag link
        finishPendingLink();
        panning = false;
        mouseDownPos = null;
        return;
    }

    if (state.activeTool === 'hand') {
        canvas.style.cursor = 'grab';

    } else if (state.activeTool === 'select') {
        if (draggingNode) {
            if (dist < 5) {
                // Click on node → select & open drawer
                if (e.shiftKey) {
                    // Shift+click toggles in selection set
                    if (state.selectedNodes.has(draggingNode)) {
                        state.selectedNodes.delete(draggingNode);
                    } else {
                        state.selectedNodes.add(draggingNode);
                    }
                    // Open drawer if exactly 1 selected, otherwise just close drawer UI
                    if (state.selectedNodes.size === 1) {
                        openDrawer([...state.selectedNodes][0]);
                    } else {
                        closeDrawerPanel();
                        requestRender();
                    }
                } else {
                    openDrawer(draggingNode);
                }
            } else {
                // Snap every dragged node to grid and store custom positions
                for (const n of dragOrigPositions.keys()) {
                    const pos = state.positions.get(n);
                    if (!pos) continue;
                    if (state.settings.snapToGrid) {
                        pos.col = Math.floor(pos.col) + 0.5;
                        pos.row = Math.floor(pos.row) + 0.5;
                    }
                    state.customPositions.set(n, { col: pos.col, row: pos.row });
                }
                // Moving nodes is a user edit — save the new positions
                setSuppressPersist(false);
                persistState(cmEditor.getValue());
            }
            draggingNode = null;
            canvas.style.cursor = 'default';
            requestRender();
        } else if (panning && dist < 5) {
            // Click on empty space → deselect
            closeDrawer();
        }

    } else if (state.activeTool === 'groupSelect') {
        if (state.marquee) {
            // Find all nodes inside the marquee rectangle
            const x1 = Math.min(state.marquee.startX, state.marquee.endX);
            const y1 = Math.min(state.marquee.startY, state.marquee.endY);
            const x2 = Math.max(state.marquee.startX, state.marquee.endX);
            const y2 = Math.max(state.marquee.startY, state.marquee.endY);

            if (!e.shiftKey) state.selectedNodes.clear();

            for (const [name, pos] of state.positions) {
                const { cx, cy } = getViewCenter();
                const s = iso(pos.col, pos.row);
                const sx = cx + s.x * state.view.zoom;
                const sy = cy + s.y * state.view.zoom;
                if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) {
                    state.selectedNodes.add(name);
                }
            }

            // Open drawer if exactly 1 node selected, otherwise just close drawer
            if (state.selectedNodes.size === 1) {
                openDrawer([...state.selectedNodes][0]);
            } else {
                closeDrawerPanel();
            }

            state.marquee = null;
            requestRender();
        }
    }

    panning = false;
    mouseDownPos = null;
}

function onMouseLeave() {
    panning = false;
    middlePanning = false;
    draggingNode = null;
    mouseDownPos = null;
    rightLinkDrag = false;
    rightDownPos = null;
    suppressContextCreate = false;
    state.marquee = null;
    state.hoveredCell = null;
    state.hoveredNode = null;
    state.pendingLink = null;
    applyToolCursor();
    requestRender();
}

/* ── Init ───────────────────────────────────────────────────────────────────── */
export function initInteractions() {
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);

    canvas.addEventListener('contextmenu', e => {
        e.preventDefault();
        // Right-press on a node is the quick-link gesture, not create-node.
        // (Fires before mouseup on macOS, after it on Windows — the flag covers both.)
        if (suppressContextCreate) { suppressContextCreate = false; return; }
        if (state.pendingLink) return;
        if (state.activeTool !== 'select') return;
        if (hitTestNode(e.clientX, e.clientY)) return;
        createNodeAtScreen(e.clientX, e.clientY);
    });

    canvas.addEventListener('dblclick', e => {
        if (state.activeTool !== 'select') return;
        if (hitTestNode(e.clientX, e.clientY)) return;
        createNodeAtScreen(e.clientX, e.clientY);
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const f = e.deltaY > 0 ? 0.92 : 1.08;
        setZoom(state.view.zoom * f, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    document.getElementById('toolHand').onclick = () => setActiveTool('hand');
    document.getElementById('toolSelect').onclick = () => setActiveTool('select');
    document.getElementById('toolGroupSelect').onclick = () => setActiveTool('groupSelect');
    document.getElementById('toolLink').onclick = () => setActiveTool('link');
}
