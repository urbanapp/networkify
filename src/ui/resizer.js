/* ═══ Pane Resizer ═══
   Drag handle between the editor pane and the canvas pane. */

import { resizeCanvas } from '../render/renderer.js';
import { cmEditor } from '../editor/editor.js';

export function initResizer() {
    const resizer    = document.getElementById('resizer');
    const editorPane = document.getElementById('editorPane');
    let resizing = false;
    let resizePending = false;

    resizer.addEventListener('mousedown', e => {
        resizing = true;
        resizer.classList.add('active');
        e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
        if (!resizing) return;
        editorPane.style.width = Math.max(260, Math.min(600, e.clientX)) + 'px';
        if (!resizePending) { // rAF-throttled: canvas realloc + CM refresh are heavy
            resizePending = true;
            requestAnimationFrame(() => {
                resizePending = false;
                resizeCanvas();
                cmEditor.refresh();
            });
        }
    });

    document.addEventListener('mouseup', () => {
        resizing = false;
        resizer.classList.remove('active');
    });
}
