/* ═══ Canvas Renderer ═══
   Owns the canvas element, the render/animation loop, and all draw functions.
   All draw* functions take an explicit context + transform so the same code
   renders both the live canvas and the PNG export (see export/exporters.js). */

import { TILE_W, TILE_H, ICON_SZ } from '../config.js';
import { state } from '../state.js';
import { themeColors } from '../theme.js';
import { iso, getIsoPath, roundRectPath } from '../geometry.js';
import { images } from '../icons.js';

export const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let dashOffset = 0;
let animId = null;
let renderScheduled = false;
let lastFrameTime = 0;

const ANIM_FRAME_MS = 30; // idle dash flow renders at ~33fps, not every vsync

/* ── Node layer cache ───────────────────────────────────────────────────────
   Nodes are by far the most expensive part of a frame: large icon PNGs
   rescaled, a shadow sprite, and a measured+filled text label — per node.
   During the edge-dash animation only the dash offset changes, so the node
   pass is rendered once into this offscreen layer and blitted per frame
   until something invalidates it (any requestRender/scheduleRender call). */
const nodeLayer = document.createElement('canvas');
const nodeLayerCtx = nodeLayer.getContext('2d');
let nodeLayerValid = false;

export function invalidateScene() { nodeLayerValid = false; }

/* ── Shadow sprite — pre-rendered once; ctx.filter blur per node per frame is
     far too expensive (forces a GPU filter pass for every node, every frame) ── */
const shadowSprite = document.createElement('canvas');
{
    shadowSprite.width = 128;
    shadowSprite.height = 64;
    const sc = shadowSprite.getContext('2d');
    sc.translate(64, 32);
    sc.scale(1, 0.5);
    const grad = sc.createRadialGradient(0, 0, 0, 0, 0, 60);
    grad.addColorStop(0,   'rgba(0, 0, 0, 0.20)');
    grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.10)');
    grad.addColorStop(1,   'rgba(0, 0, 0, 0)');
    sc.fillStyle = grad;
    sc.fillRect(-64, -64, 128, 128);
}

/* World origin on the canvas for the current view (pan offset applied) */
export function getViewCenter() {
    const dpr = devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    return { cx: w / 2 + state.view.x, cy: h * 0.42 + state.view.y };
}

export function resizeCanvas() {
    const r = canvas.parentElement.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    canvas.width  = r.width  * dpr;
    canvas.height = r.height * dpr;
    canvas.style.width  = r.width  + 'px';
    canvas.style.height = r.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    requestRender();
}

/* ── Grid ───────────────────────────────────────────────────────────────────── */
export function drawGrid(g, cx, cy, zoom, w, h) {
    if (!state.settings.showGrid) return;

    // Cover exactly the visible rect: invert the four corners to grid space
    const inv = (x, y) => {
        const wx = (x - cx) / zoom, wy = (y - cy) / zoom;
        return { col: wx / TILE_W + wy / TILE_H, row: wy / TILE_H - wx / TILE_W };
    };
    const corners = [inv(0, 0), inv(w, 0), inv(0, h), inv(w, h)];
    const c0 = Math.floor(Math.min(...corners.map(p => p.col))) - 1;
    const c1 = Math.ceil (Math.max(...corners.map(p => p.col))) + 1;
    const r0 = Math.floor(Math.min(...corners.map(p => p.row))) - 1;
    const r1 = Math.ceil (Math.max(...corners.map(p => p.row))) + 1;
    if ((c1 - c0) + (r1 - r0) > 800) return; // too zoomed-out for a useful grid

    g.save();
    g.strokeStyle = themeColors.gridLine;
    g.lineWidth = 0.5;
    g.beginPath(); // one batched path → a single stroke call for the whole grid
    for (let c = c0; c <= c1; c++) {
        const a = iso(c, r0), b = iso(c, r1);
        g.moveTo(cx + a.x * zoom, cy + a.y * zoom);
        g.lineTo(cx + b.x * zoom, cy + b.y * zoom);
    }
    for (let r = r0; r <= r1; r++) {
        const a = iso(c0, r), b = iso(c1, r);
        g.moveTo(cx + a.x * zoom, cy + a.y * zoom);
        g.lineTo(cx + b.x * zoom, cy + b.y * zoom);
    }
    g.stroke();
    g.restore();
}

/* ── Hovered cell highlight ─────────────────────────────────────────────────── */
function drawHoveredCell(cx, cy) {
    if (!state.hoveredCell) return;
    const { col, row } = state.hoveredCell;
    const zoom = state.view.zoom;

    // Four corners of the isometric diamond cell
    const top   = iso(col, row);
    const right = iso(col + 1, row);
    const bot   = iso(col + 1, row + 1);
    const left  = iso(col, row + 1);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx + top.x   * zoom, cy + top.y   * zoom);
    ctx.lineTo(cx + right.x * zoom, cy + right.y * zoom);
    ctx.lineTo(cx + bot.x   * zoom, cy + bot.y   * zoom);
    ctx.lineTo(cx + left.x  * zoom, cy + left.y  * zoom);
    ctx.closePath();

    ctx.fillStyle = themeColors.hoveredFill;
    ctx.fill();
    ctx.strokeStyle = themeColors.hoveredStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

/* ── Emphasis (hover / selection / editor-cursor highlighting) ──────────────── */
/* Only directly-referenced nodes are highlighted: the hovered node, the
   selection, and the nodes on the editor cursor's DSL line (max 2). No
   neighbour spreading, nothing is dimmed. An edge brightens only when both
   of its endpoints are highlighted (the cursor line's own connection).
   Null while a link-drag is in progress. */
export function getEmphasis() {
    if (state.pendingLink) return null;
    const seeds = new Set();
    if (state.hoveredNode && state.parsed.nodes.has(state.hoveredNode)) seeds.add(state.hoveredNode);
    for (const n of state.selectedNodes) if (state.parsed.nodes.has(n)) seeds.add(n);
    for (const n of state.cursorHighlight) if (state.parsed.nodes.has(n)) seeds.add(n);
    return seeds.size > 0 ? seeds : null;
}

/* ── Connections ────────────────────────────────────────────────────────────── */
function strokeEdgeGroup(g, polys, zoom, dashOff, dashColor, coreColor) {
    if (polys.length === 0) return;
    const tracePath = () => {
        g.beginPath();
        for (const pts of polys) {
            g.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        }
    };

    // Glow — all edges in one stroke
    g.strokeStyle = themeColors.edgeGlow;
    g.lineWidth = 10 * zoom;
    g.setLineDash([]);
    tracePath(); g.stroke();

    // Dashed flow line
    g.strokeStyle = dashColor;
    g.lineWidth = 2 * zoom;
    g.setLineDash([10 * zoom, 5 * zoom]);
    g.lineDashOffset = -dashOff;
    tracePath(); g.stroke();

    // Bright core
    g.strokeStyle = coreColor;
    g.lineWidth = 1 * zoom;
    g.setLineDash([]);
    tracePath(); g.stroke();
}

export function drawEdges(g, cx, cy, zoom, dashOff, w, h, emph) {
    if (state.parsed.edges.length === 0) return;

    // Project all edge polylines once, culling those fully outside the viewport.
    // An edge is drawn brighter only when both endpoints are emphasized.
    const normal = [], bright = [];
    for (const [a, b] of state.parsed.edges) {
        const pa = state.positions.get(a), pb = state.positions.get(b);
        if (!pa || !pb) continue;
        const pts = getIsoPath(pa, pb).map(p => {
            const s = iso(p.col, p.row);
            return { x: cx + s.x * zoom, y: cy + s.y * zoom };
        });
        if (w !== undefined) {
            const m = 12 * zoom;
            const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
            if (Math.max(...xs) < -m || Math.min(...xs) > w + m ||
                Math.max(...ys) < -m || Math.min(...ys) > h + m) continue;
        }
        if (emph && emph.has(a) && emph.has(b)) bright.push(pts);
        else normal.push(pts);
    }

    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    strokeEdgeGroup(g, normal, zoom, dashOff, themeColors.edgeDash, themeColors.edgeCore);
    strokeEdgeGroup(g, bright, zoom, dashOff, themeColors.edgeDashHi, themeColors.edgeCoreHi);
    g.restore();
}

/* ── Pending link rubber band (link tool / Alt+drag / right-drag) ───────────── */
function drawPendingLink(cx, cy) {
    const pl = state.pendingLink;
    if (!pl) return;
    const from = state.positions.get(pl.from);
    if (!from) return;
    const zoom = state.view.zoom;

    const s = iso(from.col, from.row);
    const x1 = cx + s.x * zoom, y1 = cy + s.y * zoom;
    let x2 = pl.x, y2 = pl.y;

    // Snap the free end to the hovered target node
    const target = pl.target && pl.target !== pl.from ? state.positions.get(pl.target) : null;
    if (target) {
        const ts = iso(target.col, target.row);
        x2 = cx + ts.x * zoom;
        y2 = cy + ts.y * zoom;
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = themeColors.linkPreview;
    ctx.lineWidth = 2 * zoom;
    ctx.setLineDash([8 * zoom, 6 * zoom]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (target) {
        ctx.beginPath();
        ctx.arc(x2, y2, ICON_SZ * zoom * 0.55, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}

/* ── Nodes ──────────────────────────────────────────────────────────────────── */
export function drawNodes(g, cx, cy, zoom, opts = {}) {
    const { selection, w, h, emph } = opts;

    // Sort by depth (col + row) for correct overlap
    const sorted = Array.from(state.positions.entries())
        .sort((a, b) => (a[1].col + a[1].row) - (b[1].col + b[1].row));

    sorted.forEach(([name, pos]) => {
        const node = state.parsed.nodes.get(name);
        if (!node) return;

        const s  = iso(pos.col, pos.row);
        const sx = cx + s.x * zoom;
        const sy = cy + s.y * zoom;
        const sz = ICON_SZ * zoom;

        // Cull nodes fully outside the viewport (label adds ~sz below the icon)
        if (w !== undefined && (sx < -sz || sx > w + sz || sy < -sz || sy > h + sz)) return;

        // Drop shadow (cached sprite — no per-frame blur filter)
        g.drawImage(shadowSprite, sx - sz * 0.45, sy + sz * 0.42 - sz * 0.175, sz * 0.9, sz * 0.35);

        // Icon image (centered on grid cell)
        const img = images[node.type];
        if (img?.complete && img.naturalWidth > 0) {
            g.drawImage(img, sx - sz / 2, sy - sz / 2, sz, sz);
        }

        // Label — highlight colours for directly-emphasized nodes only
        const hi = emph?.has(name);
        g.save();
        const fs = Math.max(9, 11 * zoom);
        g.font = `${hi ? 600 : 500} ${fs}px 'Segoe UI', system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'top';

        const tm = g.measureText(name);
        const ly = sy + sz * 0.55;
        const px = 6 * zoom, py = 3 * zoom;
        const lw = tm.width + px * 2, lh = fs + py * 2;

        roundRectPath(g, sx - lw / 2, ly, lw, lh, 4 * zoom);
        g.fillStyle = hi ? themeColors.labelBgHi : themeColors.labelBg;
        g.fill();
        g.strokeStyle = hi ? themeColors.labelBorderHi : themeColors.labelBorder;
        g.lineWidth = hi ? 1 : 0.5;
        g.stroke();

        g.fillStyle = hi ? themeColors.labelTextHi : themeColors.labelText;
        g.fillText(name, sx, ly + py);
        g.restore();

        // Selection ring
        if (selection?.has(name)) {
            g.save();
            g.strokeStyle = themeColors.selectionRing;
            g.lineWidth = 2.5 * zoom;
            g.shadowColor = themeColors.selectionGlow;
            g.shadowBlur = 16 * zoom;
            g.beginPath();
            g.arc(sx, sy, sz * 0.55, 0, Math.PI * 2);
            g.stroke();
            g.restore();
        }
    });
}

/* ── Marquee ────────────────────────────────────────────────────────────────── */
function drawMarquee() {
    const marquee = state.marquee;
    if (!marquee) return;
    const x = Math.min(marquee.startX, marquee.endX);
    const y = Math.min(marquee.startY, marquee.endY);
    const w = Math.abs(marquee.endX - marquee.startX);
    const h = Math.abs(marquee.endY - marquee.startY);

    ctx.save();
    ctx.fillStyle = themeColors.marqueeFill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = themeColors.marqueeStroke;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.restore();
}

/* ── Main render ────────────────────────────────────────────────────────────── */
export function render() {
    const dpr = devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const { cx, cy } = getViewCenter();

    ctx.fillStyle = themeColors.canvasBg;
    ctx.fillRect(0, 0, w, h);

    const emph = getEmphasis();
    drawGrid(ctx, cx, cy, state.view.zoom, w, h);
    drawHoveredCell(cx, cy);
    drawEdges(ctx, cx, cy, state.view.zoom, dashOffset, w, h, emph);

    // Nodes: redraw the offscreen layer only when the scene actually changed
    if (!nodeLayerValid || nodeLayer.width !== canvas.width || nodeLayer.height !== canvas.height) {
        nodeLayer.width = canvas.width;   // assigning also clears the layer
        nodeLayer.height = canvas.height;
        nodeLayerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawNodes(nodeLayerCtx, cx, cy, state.view.zoom, { selection: state.selectedNodes, w, h, emph });
        nodeLayerValid = true;
    }
    ctx.drawImage(nodeLayer, 0, 0, w, h);

    drawPendingLink(cx, cy);
    drawMarquee();
}

/* ── Render scheduling & animation ──────────────────────────────────────────── */
/* Every scheduled redraw implies "something changed", so both entry points
   invalidate the cached node layer. */
export function scheduleRender() {
    nodeLayerValid = false;
    if (!renderScheduled) {
        renderScheduled = true;
        requestAnimationFrame(() => { renderScheduled = false; render(); });
    }
}

// Request a redraw unless the animation loop is already repainting every frame
export function requestRender() {
    nodeLayerValid = false;
    if (animId === null) scheduleRender();
}

function animate(ts) {
    // Time-based so dash flow speed is independent of display refresh rate.
    // Pure dash frames are capped at ~33fps; frames where interaction
    // invalidated the scene render immediately at the full refresh rate.
    const elapsed = ts - lastFrameTime;
    if (lastFrameTime && elapsed < ANIM_FRAME_MS && nodeLayerValid) {
        animId = requestAnimationFrame(animate);
        return;
    }
    if (lastFrameTime) dashOffset += Math.min(elapsed, 100) * 0.021;
    lastFrameTime = ts;
    render();
    if (state.parsed.edges.length > 0 && state.settings.animEnabled) {
        animId = requestAnimationFrame(animate);
    } else {
        animId = null;
    }
}

export function startAnim() {
    if (!animId && state.parsed.edges.length > 0 && state.settings.animEnabled) {
        lastFrameTime = 0;
        animId = requestAnimationFrame(animate);
    }
}

export function stopAnim() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
}
