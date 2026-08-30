/* ═══ DSL Editor ═══
   CodeMirror setup (syntax mode, autocomplete, error highlighting) and the
   text → model pipeline: updateFromDsl() re-parses, re-lays-out, and triggers
   a render. All programmatic edits should go through setDslText(). */

import CodeMirror from 'codemirror';
import 'codemirror/addon/mode/simple.js';
import 'codemirror/addon/selection/active-line.js';
import 'codemirror/addon/hint/show-hint.js';

import { NODE_TYPES } from '../config.js';
import { state } from '../state.js';
import { parse } from '../dsl/parser.js';
import { layoutNodes } from '../layout.js';
import { updateUI } from '../ui/statusbar.js';
import { requestRender, startAnim, stopAnim } from '../render/renderer.js';
import { persistState, setSuppressPersist } from '../persistence.js';

export let cmEditor = null;

let inputTimer;
let errorLineHandles = [];
let nodeLineHandles = [];
let errorCycleIdx = 0;   // which parse error the next status click jumps to
let cursorHLTimer;

/* ── Syntax mode ────────────────────────────────────────────────────────────── */
CodeMirror.defineSimpleMode('network-topo', {
    start: [
        { regex: /(?:#|\/\/).*$/, token: 'comment' },
        { regex: /---/, token: 'operator' },
        { regex: /\b(?:server|database|cloud|switch|router|firewall|laptop|user)\b/, token: 'keyword' },
        { regex: /:/, token: 'punctuation' },
        { regex: /[a-zA-Z0-9_][a-zA-Z0-9_-]*/, token: 'variable' },
    ]
});

/* ── Autocomplete: node types after ':', known node names elsewhere ─────────── */
function topoHint(editor) {
    const cur = editor.getCursor();
    const line = editor.getLine(cur.line);
    const before = line.slice(0, cur.ch);

    // --- Type hints after colon ---
    const colonIdx = before.lastIndexOf(':');
    if (colonIdx !== -1) {
        const prefix = before.slice(colonIdx + 1);
        if (!/\s/.test(prefix)) {
            const matches = NODE_TYPES.filter(t => t.startsWith(prefix.toLowerCase()));
            if (matches.length) return {
                list: matches,
                from: CodeMirror.Pos(cur.line, colonIdx + 1),
                to: cur
            };
        }
    }

    // --- Node name hints ---
    const nameMatch = before.match(/([\w-]+)$/);
    if (!nameMatch) return;
    const prefix = nameMatch[1].toLowerCase();
    if (prefix.length < 1) return;
    const names = [...state.parsed.nodes.keys()].filter(n => n.toLowerCase().startsWith(prefix) && n.toLowerCase() !== prefix);
    if (!names.length) return;
    return {
        list: names,
        from: CodeMirror.Pos(cur.line, cur.ch - nameMatch[1].length),
        to: cur
    };
}

/* ── Text → model pipeline ──────────────────────────────────────────────────── */
export function updateFromDsl() {
    const oldPositions = state.positions;
    state.parsed    = parse(cmEditor.getValue());
    state.positions = layoutNodes(state.parsed.nodes);

    // Apply custom positions (from drag or click-to-add)
    for (const [name, pos] of state.customPositions) {
        if (state.positions.has(name)) {
            state.positions.set(name, { col: pos.col, row: pos.row });
        } else {
            state.customPositions.delete(name);
        }
    }

    // Preserve positions of existing nodes so they don't shift when new nodes are added
    for (const [name, pos] of oldPositions) {
        if (state.positions.has(name) && !state.customPositions.has(name)) {
            state.positions.set(name, { col: pos.col, row: pos.row });
        }
    }

    errorCycleIdx = 0;
    markErrorLines();
    highlightNodeLines(state.drawerNodeName, false); // re-mark: setValue drops line classes
    updateUI();
    if (state.parsed.edges.length > 0) startAnim();
    else stopAnim();
    requestRender();
    persistState(cmEditor.getValue());
}

/* Set editor content and synchronously update the model (skips the debounce) */
export function setDslText(text) {
    clearTimeout(inputTimer);
    cmEditor.setValue(text);
    updateFromDsl();
}

/* Highlight lines with parse errors in the editor gutter/background */
function markErrorLines() {
    errorLineHandles.forEach(h => cmEditor.removeLineClass(h, 'background', 'cm-errorline-bg'));
    errorLineHandles = state.parsed.errors
        .map(err => cmEditor.addLineClass(err.line - 1, 'background', 'cm-errorline-bg'))
        .filter(Boolean);
}

/* Canvas → editor linking: highlight every DSL line that mentions a node.
   Pass null to clear. Scrolls the first mention into view unless told not to. */
export function highlightNodeLines(name, scroll = true) {
    nodeLineHandles.forEach(h => cmEditor.removeLineClass(h, 'background', 'cm-nodeline-bg'));
    nodeLineHandles = [];
    const node = name ? state.parsed.nodes.get(name) : null;
    if (!node?.lines || state.autotypeRunning) return;

    const lines = [...node.lines].sort((a, b) => a - b);
    nodeLineHandles = lines
        .map(l => cmEditor.addLineClass(l - 1, 'background', 'cm-nodeline-bg'))
        .filter(Boolean);
    if (scroll && lines.length > 0) cmEditor.scrollIntoView({ line: lines[0] - 1, ch: 0 }, 60);
}

/* ── Init ───────────────────────────────────────────────────────────────────── */
export function initEditor() {
    cmEditor = CodeMirror.fromTextArea(document.getElementById('editor'), {
        mode: 'network-topo',
        theme: 'purple-night',
        lineNumbers: true,
        styleActiveLine: true,
        tabSize: 2,
        indentWithTabs: false,
        lineWrapping: false,
        hintOptions: { hint: topoHint, completeSingle: false },
    });

    // Trigger autocomplete after typing a colon, type letters, or node name letters
    cmEditor.on('inputRead', (editor, change) => {
        if (change.origin !== '+input') return;
        const cur = editor.getCursor();
        const line = editor.getLine(cur.line);
        const before = line.slice(0, cur.ch);
        const colonIdx = before.lastIndexOf(':');
        // After colon: type hints
        if (colonIdx !== -1 && !/\s/.test(before.slice(colonIdx + 1))) {
            editor.showHint({ hint: topoHint, completeSingle: false });
            return;
        }
        // Node name hints: trigger when typing word chars (at least 2 chars)
        const nameMatch = before.match(/([\w-]{2,})$/);
        if (nameMatch && state.parsed.nodes.size > 0) {
            editor.showHint({ hint: topoHint, completeSingle: false });
        }
    });

    // Debounced live re-parse while typing
    cmEditor.on('changes', (ed, changes) => {
        // Any non-setValue change is a user edit — from then on, persist again
        // (share-URL loads suppress persistence until the visitor edits)
        if (changes.some(c => c.origin !== 'setValue')) setSuppressPersist(false);
        clearTimeout(inputTimer);
        inputTimer = setTimeout(updateFromDsl, 100);
    });

    // Editor → canvas linking: emphasize the nodes on the cursor's line
    cmEditor.on('cursorActivity', () => {
        clearTimeout(cursorHLTimer);
        cursorHLTimer = setTimeout(() => {
            if (state.autotypeRunning) return;
            const refs = state.parsed.lineRefs.get(cmEditor.getCursor().line + 1);
            const next = refs ? refs.nodes.filter(n => state.parsed.nodes.has(n)) : [];
            const same = next.length === state.cursorHighlight.size &&
                next.every(n => state.cursorHighlight.has(n));
            if (!same) {
                state.cursorHighlight = new Set(next);
                requestRender();
            }
        }, 50);
    });

    // Leaving the editor clears the cursor emphasis so the canvas un-dims
    cmEditor.on('blur', () => {
        if (state.cursorHighlight.size > 0) {
            state.cursorHighlight = new Set();
            requestRender();
        }
    });

    // Clicking an error status cycles the cursor through the offending lines
    document.getElementById('status').addEventListener('click', () => {
        const errs = state.parsed.errors;
        if (errs.length === 0) return;
        const err = errs[errorCycleIdx % errs.length];
        errorCycleIdx = (errorCycleIdx + 1) % errs.length;
        cmEditor.setCursor(err.line - 1, 0);
        cmEditor.focus();
    });
}
