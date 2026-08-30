/* ═══ Status bar ═══
   Editor status line, canvas info readout, zoom %, empty-state visibility.
   Touches the DOM, so it is called only when data or zoom actually changes —
   never from the per-frame render loop. */

import { state } from '../state.js';

const statusEl  = document.getElementById('status');
const emptyEl   = document.getElementById('emptyState');
const infoEl    = document.getElementById('info');
const zoomPctEl = document.getElementById('zoomPct');

export function updateUI() {
    const pct = Math.round(state.view.zoom * 100) + '%';
    zoomPctEl.textContent = pct;

    const { nodes, edges, errors } = state.parsed;
    if (nodes.size > 0) {
        emptyEl.style.display = 'none';
        if (errors.length > 0) {
            const more = errors.length > 1 ? ` (+${errors.length - 1} more)` : '';
            statusEl.className = 'status error';
            statusEl.textContent = `L${errors[0].line}: ${errors[0].msg}${more}`;
            statusEl.title = errors.length > 1 ? 'Click to cycle through the errors' : 'Click to jump to the error';
        } else {
            statusEl.className = 'status ok';
            statusEl.textContent = `${nodes.size} nodes · ${edges.length} links`;
            statusEl.title = '';
        }
        infoEl.textContent = `${nodes.size} nodes · ${edges.length} links · ${pct}`;
    } else {
        emptyEl.style.display = '';
        statusEl.className = 'status empty';
        statusEl.textContent = 'Ready';
        statusEl.title = '';
        infoEl.textContent = '';
    }
}
