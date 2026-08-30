/* ═══ Node Drawer ═══
   Slide-in panel for editing the selected node: name, type, connections,
   position reset. Opening a node also highlights its DSL lines in the editor. */

import { NODE_TYPES } from '../config.js';
import { state } from '../state.js';
import { ICON_URLS } from '../icons.js';
import { requestRender } from '../render/renderer.js';
import { editNodeInDSL, deleteNodesFromDSL } from '../dsl/edit.js';
import { cmEditor, highlightNodeLines } from '../editor/editor.js';
import { layoutNodes } from '../layout.js';
import { animatePositions, panToNode } from '../motion.js';
import { persistState, setSuppressPersist } from '../persistence.js';
import { toast } from './toast.js';

const drawer         = document.getElementById('nodeDrawer');
const drawerIcon     = document.getElementById('drawerIcon');
const drawerName     = document.getElementById('drawerName');
const drawerTypeGrid = document.getElementById('drawerType');
const drawerConns    = document.getElementById('drawerConns');

export function openDrawer(nodeName) {
    const node = state.parsed.nodes.get(nodeName);
    if (!node) return;

    // Only one drawer open at a time (avoids a settings ↔ drawer import cycle)
    document.getElementById('settingsDrawer').classList.remove('open');
    state.drawerNodeName = nodeName;
    state.selectedNodes.clear();
    state.selectedNodes.add(nodeName);
    drawerIcon.src = ICON_URLS[node.type];
    drawerName.value = node.name;

    // Highlight active type in grid
    drawerTypeGrid.querySelectorAll('.type-grid-item').forEach(el => {
        el.classList.toggle('active', el.dataset.type === node.type);
    });

    // Populate connections
    drawerConns.innerHTML = '';
    for (const conn of node.conns) {
        const badge = document.createElement('span');
        badge.className = 'conn-badge';
        badge.textContent = conn;
        badge.onclick = () => { panToNode(conn); openDrawer(conn); };
        drawerConns.appendChild(badge);
    }
    if (node.conns.size === 0) {
        drawerConns.innerHTML = '<span style="color:#3e4470;font-size:11px">No connections</span>';
    }

    // Canvas → editor: show where this node lives in the DSL
    highlightNodeLines(nodeName);

    drawer.classList.add('open');
    requestRender();
}

/* Close and clear the selection (click on empty canvas, Escape, delete, …) */
export function closeDrawer() {
    if (!state.drawerNodeName && !drawer.classList.contains('open')) return;
    state.drawerNodeName = null;
    state.selectedNodes.clear();
    highlightNodeLines(null);
    drawer.classList.remove('open');
    requestRender();
}

/* Hide the panel but keep the current multi-selection */
export function closeDrawerPanel() {
    state.drawerNodeName = null;
    highlightNodeLines(null);
    drawer.classList.remove('open');
}

export function initDrawer() {
    // Build type grid once
    NODE_TYPES.forEach(t => {
        const item = document.createElement('div');
        item.className = 'type-grid-item';
        item.dataset.type = t;
        item.innerHTML = `<img src="${ICON_URLS[t]}" alt="${t}"><span>${t}</span>`;
        item.onclick = () => {
            if (!state.drawerNodeName || item.classList.contains('active')) return;
            drawerTypeGrid.querySelector('.active')?.classList.remove('active');
            item.classList.add('active');
            editNodeInDSL(state.drawerNodeName, { newType: t });
            openDrawer(state.drawerNodeName);
        };
        drawerTypeGrid.appendChild(item);
    });

    // Name editing — apply on Enter or blur
    drawerName.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.target.blur(); }
        if (e.key === 'Escape') { e.target.value = state.drawerNodeName; e.target.blur(); e.stopPropagation(); }
    });
    drawerName.addEventListener('blur', () => {
        const newName = drawerName.value.trim();
        if (!newName || !state.drawerNodeName || newName === state.drawerNodeName) return;
        if (state.parsed.nodes.has(newName)) {
            toast(`Name "${newName}" is already in use`, true);
            // Keep the typed name for correction (refocus after the blur settles)
            setTimeout(() => { drawerName.focus(); drawerName.select(); }, 0);
            return;
        }
        const oldName = state.drawerNodeName;
        editNodeInDSL(oldName, { newName });
        state.drawerNodeName = newName;
        openDrawer(newName);
    });

    // Reset position — clear the custom position, tween back to the auto spot
    document.getElementById('drawerReset').addEventListener('click', () => {
        const name = state.drawerNodeName;
        if (!name) return;
        if (!state.customPositions.has(name)) {
            toast('Position is already automatic');
            return;
        }
        state.customPositions.delete(name);
        setSuppressPersist(false);
        persistState(cmEditor.getValue());
        const auto = layoutNodes(state.parsed.nodes);
        const target = new Map(state.positions);
        if (auto.has(name)) target.set(name, auto.get(name));
        animatePositions(target);
    });

    // Delete
    document.getElementById('drawerDelete').addEventListener('click', () => {
        if (!state.drawerNodeName) return;
        deleteNodesFromDSL(state.drawerNodeName);
        closeDrawer();
    });

    // Close button
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
}
