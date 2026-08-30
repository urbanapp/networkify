/* ═══ Diagram loading ═══
   Replaces the whole diagram in one step (import, templates, reset-to-demo):
   swaps the DSL text, optionally seeds custom positions, and fits the view.
   Loading goes through setDslText, so CodeMirror undo history is preserved —
   an accidental replace is one Cmd/Ctrl+Z away. */

import { state } from './state.js';
import { setDslText } from './editor/editor.js';
import { fitView } from './camera.js';
import { closeDrawer } from './ui/drawer.js';
import { toast } from './ui/toast.js';
import { setSuppressPersist } from './persistence.js';

export function loadDiagram(dsl, msg, posMap) {
    setSuppressPersist(false);
    state.customPositions = posMap instanceof Map ? posMap : new Map();
    state.positions = new Map(); // don't carry positions over from the old diagram
    closeDrawer();
    setDslText(dsl);
    fitView();
    if (msg) toast(msg);
}
