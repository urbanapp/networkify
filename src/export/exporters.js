/* ═══ Export ═══
   PNG (re-uses the exact same canvas draw functions as the live view),
   SVG, and JSON exports, plus the export menu wiring. */

import { ICON_SZ } from '../config.js';
import { state } from '../state.js';
import { themeColors } from '../theme.js';
import { iso, getIsoPath, getDiagramBounds } from '../geometry.js';
import { drawGrid, drawEdges, drawNodes } from '../render/renderer.js';
import { images } from '../icons.js';
import { cmEditor } from '../editor/editor.js';
import { toast } from '../ui/toast.js';

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/* ── PNG Export — reuses the exact same draw functions as the live canvas ───── */
function exportPNG() {
    const bounds = getDiagramBounds(state.positions, 80);
    if (!bounds) { toast('Nothing to export yet', true); return; }

    const scale = 2;
    const offCanvas = document.createElement('canvas');
    offCanvas.width  = bounds.w * scale;
    offCanvas.height = bounds.h * scale;
    const oc = offCanvas.getContext('2d');
    oc.scale(scale, scale);

    const cx = -bounds.x;
    const cy = -bounds.y;

    oc.fillStyle = themeColors.canvasBg;
    oc.fillRect(0, 0, bounds.w, bounds.h);
    drawGrid(oc, cx, cy, 1, bounds.w, bounds.h);
    drawEdges(oc, cx, cy, 1, 0);
    drawNodes(oc, cx, cy, 1, {});

    try {
        offCanvas.toBlob(blob => {
            if (blob) { downloadBlob(blob, 'network-diagram.png'); toast('PNG exported'); }
        }, 'image/png');
    } catch (e) {
        toast('PNG export failed — serve over HTTP so the canvas is not tainted', true);
    }
}

/* ── SVG Export ─────────────────────────────────────────────────────────────── */
function exportSVG() {
    const bounds = getDiagramBounds(state.positions, 80);
    if (!bounds) { toast('Nothing to export yet', true); return; }

    const cx = -bounds.x;
    const cy = -bounds.y;
    const parts = [];

    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.w}" height="${bounds.h}" viewBox="0 0 ${bounds.w} ${bounds.h}">`);

    // Background
    parts.push(`<rect width="${bounds.w}" height="${bounds.h}" fill="${themeColors.canvasBg}"/>`);

    // Grid
    if (state.settings.showGrid) {
        parts.push(`<g stroke="${themeColors.gridLine}" stroke-width="0.5">`);
        const R = 14;
        for (let i = -R; i <= R; i++) {
            let a = iso(i, -R), b = iso(i, R);
            parts.push(`<line x1="${cx + a.x}" y1="${cy + a.y}" x2="${cx + b.x}" y2="${cy + b.y}"/>`);
            a = iso(-R, i); b = iso(R, i);
            parts.push(`<line x1="${cx + a.x}" y1="${cy + a.y}" x2="${cx + b.x}" y2="${cy + b.y}"/>`);
        }
        parts.push('</g>');
    }

    // Edges
    state.parsed.edges.forEach(([a, b]) => {
        const pa = state.positions.get(a), pb = state.positions.get(b);
        if (!pa || !pb) return;
        const path = getIsoPath(pa, pb);
        const pts = path.map(p => {
            const s = iso(p.col, p.row);
            return `${cx + s.x},${cy + s.y}`;
        }).join(' ');

        parts.push(`<polyline points="${pts}" fill="none" stroke="${themeColors.edgeGlow}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`);
        parts.push(`<polyline points="${pts}" fill="none" stroke="${themeColors.edgeDash}" stroke-width="2" stroke-dasharray="10 5" stroke-linecap="round" stroke-linejoin="round"/>`);
        parts.push(`<polyline points="${pts}" fill="none" stroke="${themeColors.edgeCore}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>`);
    });

    // Nodes
    const sorted = Array.from(state.positions.entries())
        .sort((a, b) => (a[1].col + a[1].row) - (b[1].col + b[1].row));
    sorted.forEach(([name, pos]) => {
        const node = state.parsed.nodes.get(name);
        if (!node) return;
        const s = iso(pos.col, pos.row);
        const sx = cx + s.x;
        const sy = cy + s.y;
        const sz = ICON_SZ;

        // Embed icon as base64 image
        const img = images[node.type];
        if (img?.complete) {
            // If loaded via data URL (fetch path), use it directly
            if (img.src.startsWith('data:')) {
                parts.push(`<image href="${img.src}" x="${sx - sz / 2}" y="${sy - sz / 2}" width="${sz}" height="${sz}"/>`);
            } else {
                const tmpC = document.createElement('canvas');
                tmpC.width = img.naturalWidth;
                tmpC.height = img.naturalHeight;
                tmpC.getContext('2d').drawImage(img, 0, 0);
                try {
                    const dataUrl = tmpC.toDataURL('image/png');
                    parts.push(`<image href="${dataUrl}" x="${sx - sz / 2}" y="${sy - sz / 2}" width="${sz}" height="${sz}"/>`);
                } catch (e) {
                    parts.push(`<rect x="${sx - sz / 2}" y="${sy - sz / 2}" width="${sz}" height="${sz}" rx="8" fill="#2a2d3e" stroke="#3a3f6e"/>`);
                }
            }
        }

        // Label
        const fs = 11;
        const ly = sy + sz * 0.55;
        const approxW = name.length * 7 + 12;
        const lh = fs + 6;
        const esc = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        parts.push(`<rect x="${sx - approxW / 2}" y="${ly}" width="${approxW}" height="${lh}" rx="4" fill="${themeColors.labelBg}" stroke="${themeColors.labelBorder}" stroke-width="0.5"/>`);
        parts.push(`<text x="${sx}" y="${ly + lh / 2 + 1}" text-anchor="middle" dominant-baseline="middle" fill="${themeColors.labelText}" font-family="'Segoe UI', system-ui, sans-serif" font-size="${fs}" font-weight="500">${esc}</text>`);
    });

    parts.push('</svg>');

    const blob = new Blob([parts.join('\n')], { type: 'image/svg+xml' });
    downloadBlob(blob, 'network-diagram.svg');
    toast('SVG exported');
}

/* ── JSON Export ────────────────────────────────────────────────────────────── */
function exportJSON() {
    const nodes = [];
    for (const [name, node] of state.parsed.nodes) {
        const pos = state.positions.get(name);
        nodes.push({
            name: node.name,
            type: node.type,
            connections: [...node.conns],
            position: pos ? { col: pos.col, row: pos.row } : null
        });
    }
    const edges = state.parsed.edges.map(([a, b]) => ({ from: a, to: b }));
    const data = {
        nodes,
        edges,
        dsl: cmEditor.getValue()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'network-diagram.json');
    toast('JSON exported');
}

/* ── Menu wiring ────────────────────────────────────────────────────────────── */
export function initExport() {
    const exportBtn  = document.getElementById('exportBtn');
    const exportMenu = document.getElementById('exportMenu');

    exportBtn.addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('templatesMenu')?.classList.remove('open');
        exportMenu.classList.toggle('open');
    });

    document.addEventListener('click', e => {
        if (!exportMenu.contains(e.target) && e.target !== exportBtn) {
            exportMenu.classList.remove('open');
        }
    });

    exportMenu.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            exportMenu.classList.remove('open');
            const fmt = btn.dataset.format;
            if (fmt === 'png')  exportPNG();
            else if (fmt === 'svg')  exportSVG();
            else if (fmt === 'json') exportJSON();
        });
    });
}
