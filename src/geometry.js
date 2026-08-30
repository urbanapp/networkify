/* ═══ Isometric geometry ═══
   Pure projection math shared by the renderer, exporters, and interactions. */

import { TILE_W, TILE_H, ICON_SZ } from './config.js';

/* Grid (col, row) → world coordinates (screen px at zoom 1, before view offset) */
export function iso(col, row) {
    return {
        x: (col - row) * TILE_W / 2,
        y: (col + row) * TILE_H / 2
    };
}

/* Inverse isometric: canvas coordinates → grid (col, row).
   (cx, cy) is the world origin on the canvas; see renderer getViewCenter(). */
export function screenToGrid(mx, my, cx, cy, zoom) {
    const wx = (mx - cx) / zoom;
    const wy = (my - cy) / zoom;
    return {
        col: wx / TILE_W + wy / TILE_H,
        row: wy / TILE_H - wx / TILE_W
    };
}

/* Edge routing: returns the polyline (in grid coords) connecting two nodes */
export function getIsoPath(pa, pb) {
    const dc = Math.abs(pb.col - pa.col);
    const dr = Math.abs(pb.row - pa.row);

    // Axis-aligned: direct line along one grid axis
    if (dc < 0.01 || dr < 0.01) {
        return [pa, pb];
    }

    // Equal deltas: straight diagonal (crosses grid lines only at corners)
    if (Math.abs(dc - dr) < 0.01) {
        return [pa, pb];
    }

    // Mixed: diagonal segment + axis-aligned segment
    // Diagonal for min(|dc|,|dr|) steps, then straight for the rest
    const diag = Math.min(dc, dr);
    const mid = {
        col: pa.col + Math.sign(pb.col - pa.col) * diag,
        row: pa.row + Math.sign(pb.row - pa.row) * diag
    };
    return [pa, mid, pb];
}

/* Bounding box of the diagram in world coordinates, with padding.
   Used by fit-to-view and the PNG/SVG exporters. */
export function getDiagramBounds(positions, padding) {
    if (positions.size === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pos of positions.values()) {
        const s = iso(pos.col, pos.row);
        const sz = ICON_SZ / 2;
        minX = Math.min(minX, s.x - sz);
        maxX = Math.max(maxX, s.x + sz);
        minY = Math.min(minY, s.y - sz);

        // Account for label below the icon
        const labelH = 30;
        maxY = Math.max(maxY, s.y + sz + labelH);
    }
    return {
        x: minX - padding, y: minY - padding,
        w: maxX - minX + padding * 2, h: maxY - minY + padding * 2
    };
}

export function roundRectPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
}
