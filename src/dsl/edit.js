/* ═══ DSL Editing ═══
   Structured edits applied back to the DSL text (rename / retype / delete
   nodes), used by the node drawer and keyboard shortcuts. */

import { NODE_TYPES } from '../config.js';
import { parseNodeStr } from './parser.js';
import { cmEditor, setDslText } from '../editor/editor.js';

function replaceNodeInPart(part, oldName, newName, newType) {
    const trimmed = part.trim();
    const ref = parseNodeStr(trimmed);
    if (!ref || ref.name !== oldName) return part;

    const hasType = trimmed.lastIndexOf(':') > 0 &&
        NODE_TYPES.includes(trimmed.substring(trimmed.lastIndexOf(':') + 1).trim().toLowerCase());

    // Preserve leading/trailing whitespace from the original part
    const leading = part.match(/^\s*/)[0];
    const trailing = part.match(/\s*$/)[0];
    const name = newName ?? oldName;
    const type = newType ?? (hasType ? trimmed.substring(trimmed.lastIndexOf(':') + 1).trim() : ref.type);

    return leading + name + ':' + type + trailing;
}

export function editNodeInDSL(oldName, { newName, newType }) {
    const text = cmEditor.getValue();
    const lines = text.split('\n');
    const result = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
            result.push(line);
            continue;
        }
        const parts = line.split('---');
        const edited = parts.map(p => replaceNodeInPart(p, oldName, newName, newType));
        result.push(edited.join('---'));
    }

    setDslText(result.join('\n'));
}

export function deleteNodesFromDSL(names) {
    const doomed = names instanceof Set ? names : new Set([names]);
    const text = cmEditor.getValue();
    const lines = text.split('\n');
    const result = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
            result.push(line);
            continue;
        }
        const parts = trimmed.split('---');
        const mentions = parts.some(p => {
            const ref = parseNodeStr(p.trim());
            return ref && doomed.has(ref.name);
        });
        if (!mentions) result.push(line);
    }

    setDslText(result.join('\n'));
}
