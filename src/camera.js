/* ═══ Camera ═══
   Zoom (anchored so the point under the cursor stays put) and fit-to-view,
   plus the zoom button wiring. */

import { ZOOM_MIN, ZOOM_MAX } from './config.js';
import { state } from './state.js';
import { getDiagramBounds } from './geometry.js';
import { canvas, requestRender } from './render/renderer.js';
import { updateUI } from './ui/statusbar.js';

/* Zooms towards an anchor point (px, py in canvas coords) so the world point
   under the cursor stays put. Defaults to the canvas centre. */
export function setZoom(newZoom, px, py) {
    newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
    const dpr = devicePixelRatio || 1;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    if (px === undefined) { px = w / 2; py = h / 2; }

    const view = state.view;
    const cx = w / 2 + view.x, cy = h * 0.42 + view.y;
    const wx = (px - cx) / view.zoom, wy = (py - cy) / view.zoom;
    view.zoom = newZoom;
    view.x = px - w / 2 - wx * newZoom;
    view.y = py - h * 0.42 - wy * newZoom;
    updateUI();
    requestRender();
}

/* Fit the whole diagram in the viewport */
export function fitView() {
    const dpr = devicePixelRatio || 1;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    const bounds = getDiagramBounds(state.positions, 60);
    const view = state.view;
    if (!bounds) {
        view.x = 0; view.y = 0; view.zoom = 1;
    } else {
        const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(w / bounds.w, h / bounds.h)));
        const bcx = bounds.x + bounds.w / 2, bcy = bounds.y + bounds.h / 2;
        view.zoom = zoom;
        view.x = -bcx * zoom;
        view.y = h / 2 - h * 0.42 - bcy * zoom;
    }
    updateUI();
    requestRender();
}

export function initCamera() {
    document.getElementById('zoomIn').onclick  = () => setZoom(state.view.zoom * 1.25);
    document.getElementById('zoomOut').onclick = () => setZoom(state.view.zoom / 1.25);
    document.getElementById('zoomPct').onclick = () => setZoom(1);
    document.getElementById('zoomFit').onclick = fitView;
}
