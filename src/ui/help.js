/* ═══ Help ═══
   Help dialog — the detailed version of the editor-pane quick help: DSL
   reference, node types, tools/shortcuts, mouse gestures, import/export.
   Static content lives in index.html (#helpModal); this module fills the
   node-type grid and wires the header button + `?` shortcut. */

import { NODE_TYPES } from '../config.js';
import { ICON_URLS } from '../icons.js';
import { openModal } from './modal.js';

export function openHelp() {
    openModal('helpModal');
}

export function initHelp() {
    const grid = document.getElementById('helpTypes');
    NODE_TYPES.forEach(type => {
        const cell = document.createElement('div');
        cell.className = 'help-type';

        const img = document.createElement('img');
        img.src = ICON_URLS[type];
        img.alt = type;

        const label = document.createElement('span');
        label.textContent = type;

        cell.append(img, label);
        grid.appendChild(cell);
    });

    document.getElementById('helpBtn').addEventListener('click', openHelp);
}
