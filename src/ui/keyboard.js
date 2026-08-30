/* ═══ Global Keyboard Shortcuts ═══
   Tool switching, zoom, fit, delete, temporary Space-pan, undo/redo routing,
   and Escape to close drawers. */

import { state } from '../state.js';
import { cmEditor } from '../editor/editor.js';
import { setZoom, fitView } from '../camera.js';
import { deleteNodesFromDSL } from '../dsl/edit.js';
import { tidyLayout } from '../motion.js';
import { setActiveTool, cancelPendingLink } from './interactions.js';
import { closeDrawer } from './drawer.js';
import { isSettingsOpen, closeSettings } from './settings.js';

let spaceHeldTool = null; // tool to restore when Space (temporary pan) is released

export function initKeyboard() {
    document.addEventListener('keydown', e => {
        // Don't trigger shortcuts when typing in inputs/editor
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('.CodeMirror')) return;

        // Route undo/redo to the DSL editor even when the canvas has focus
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) cmEditor.redo();
            else cmEditor.undo();
            return;
        }
        if (e.metaKey || e.ctrlKey || e.altKey) return;

        const k = e.key.toLowerCase();
        if (k === 'h') setActiveTool('hand');
        else if (k === 'v') setActiveTool('select');
        else if (k === 'm') setActiveTool('groupSelect');
        else if (k === 'l') setActiveTool('link');
        else if (k === 't') tidyLayout();
        else if (k === 'f') fitView();
        else if (k === '+' || k === '=') setZoom(state.view.zoom * 1.25);
        else if (k === '-') setZoom(state.view.zoom / 1.25);
        else if (k === '0') setZoom(1);
        else if ((k === 'delete' || k === 'backspace') && state.selectedNodes.size > 0) {
            e.preventDefault();
            deleteNodesFromDSL(state.selectedNodes);
            closeDrawer();
        }
        else if (k === ' ' && !e.repeat && !spaceHeldTool) {
            e.preventDefault();
            spaceHeldTool = state.activeTool;
            setActiveTool('hand');
        }
    });

    document.addEventListener('keyup', e => {
        if (e.key === ' ' && spaceHeldTool) {
            setActiveTool(spaceHeldTool);
            spaceHeldTool = null;
        }
    });

    // Escape aborts a link drag first, then closes the node drawer, then settings.
    // (Registered separately: it must also fire while the editor has focus.)
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (cancelPendingLink()) return;
            if (state.drawerNodeName) closeDrawer();
            else if (isSettingsOpen()) closeSettings();
        }
    });
}
