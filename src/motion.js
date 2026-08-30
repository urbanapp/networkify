/* ═══ Motion ═══
   Short view/layout tweens (~220ms ease-out) plus the "tidy layout" action.
   All tweens collapse to an instant jump when animations are disabled or the
   OS asks for reduced motion. */

import { state } from './state.js';
import { iso } from './geometry.js';
import { layoutNodes } from './layout.js';
import { canvas, render, requestRender, invalidateScene } from './render/renderer.js';
import { fitView } from './camera.js';
import { updateUI } from './ui/statusbar.js';
import { toast } from './ui/toast.js';
import { cmEditor } from './editor/editor.js';
import { persistState, setSuppressPersist } from './persistence.js';

const DURATION = 220;
const easeOut = k => 1 - Math.pow(1 - k, 3);

function shouldAnimate() {
    return state.settings.animEnabled && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ── View tween ─────────────────────────────────────────────────────────────── */
let viewAnimToken = 0;

export function animateView(tx, ty) {
    if (!shouldAnimate()) {
        state.view.x = tx;
        state.view.y = ty;
        updateUI();
        requestRender();
        return;
    }
    const token = ++viewAnimToken;
    const from = { x: state.view.x, y: state.view.y };
    const t0 = performance.now();
    function step(now) {
        if (token !== viewAnimToken) return; // superseded by a newer tween
        const e = easeOut(Math.min(1, (now - t0) / DURATION));
        state.view.x = from.x + (tx - from.x) * e;
        state.view.y = from.y + (ty - from.y) * e;
        invalidateScene(); // tween bypasses requestRender, so invalidate directly
        render();
        if (e < 1) requestAnimationFrame(step);
        else { updateUI(); requestRender(); }
    }
    requestAnimationFrame(step);
}

/* Centre the view on a node (keeps the current zoom) */
export function panToNode(name) {
    const p = state.positions.get(name);
    if (!p) return;
    const dpr = devicePixelRatio || 1;
    const h = canvas.height / dpr;
    const s = iso(p.col, p.row);
    animateView(-s.x * state.view.zoom, h / 2 - h * 0.42 - s.y * state.view.zoom);
}

/* ── Position tween ─────────────────────────────────────────────────────────── */
let posAnimToken = 0;

export function animatePositions(target, done) {
    if (!shouldAnimate()) {
        state.positions = target;
        requestRender();
        done?.();
        return;
    }
    const token = ++posAnimToken;
    const moves = [];
    for (const [name, to] of target) {
        const from = state.positions.get(name) || to;
        moves.push({ name, from: { ...from }, to: { ...to } });
    }
    state.positions = target;
    const t0 = performance.now();
    function step(now) {
        if (token !== posAnimToken) return;
        const e = easeOut(Math.min(1, (now - t0) / DURATION));
        // Write through state.positions each frame — updateFromDsl may have
        // swapped the map mid-tween (e.g. the user typed during the animation)
        const posMap = state.positions;
        for (const m of moves) {
            if (!posMap.has(m.name)) continue;
            posMap.set(m.name, {
                col: m.from.col + (m.to.col - m.from.col) * e,
                row: m.from.row + (m.to.row - m.from.row) * e,
            });
        }
        invalidateScene(); // tween bypasses requestRender, so invalidate directly
        render();
        if (e < 1) requestAnimationFrame(step);
        else { requestRender(); done?.(); }
    }
    requestAnimationFrame(step);
}

/* ── Tidy layout: drop all custom positions, back to auto-layout ────────────── */
export function tidyLayout() {
    if (state.parsed.nodes.size === 0) return;
    if (state.customPositions.size === 0) {
        toast('Layout is already automatic');
        return;
    }
    state.customPositions.clear();
    setSuppressPersist(false); // tidying is a user edit
    persistState(cmEditor.getValue());
    animatePositions(layoutNodes(state.parsed.nodes), fitView);
}

export function initMotion() {
    document.getElementById('tidyBtn').addEventListener('click', tidyLayout);
}
