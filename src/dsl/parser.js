/* ═══ DSL Parser ═══
   Pure functions: DSL text → { nodes, edges, errors }. No app state. */

import { NODE_TYPES } from '../config.js';

export function parse(text) {
    const nodes = new Map();   // name → { name, type, conns: Set<string>, lines: Set<number> }
    const edges = [];
    const edgeSet = new Set();
    const errors = [];
    const lineRefs = new Map(); // 1-based line number → { nodes: [names] } — editor↔canvas linking

    text.split('\n').forEach((raw, idx) => {
        const line = raw.trim();
        const ln = idx + 1;
        if (!line || line.startsWith('#') || line.startsWith('//')) return;

        const parts = line.split('---');

        if (parts.length === 1) {
            // Standalone node declaration: name:type
            if (line.includes(':')) {
                const n = parseNodeStr(line);
                if (n) {
                    if (!nodes.has(n.name))
                        nodes.set(n.name, { name: n.name, type: n.type, conns: new Set(), lines: new Set() });
                    nodes.get(n.name).lines.add(ln);
                    lineRefs.set(ln, { nodes: [n.name] });
                }
            } else {
                errors.push({ line: ln, msg: 'Expected: name:type --- name:type' });
            }
            return;
        }

        if (parts.length > 2) {
            errors.push({ line: ln, msg: 'Only one --- per line' });
            return;
        }

        const left  = parseNodeStr(parts[0].trim());
        const right = parseNodeStr(parts[1].trim());

        if (!left || !right) {
            errors.push({ line: ln, msg: 'Invalid node format' });
            return;
        }
        if (left.name === right.name) return;

        ensureNode(nodes, left, ln);
        ensureNode(nodes, right, ln);
        lineRefs.set(ln, { nodes: [left.name, right.name] });

        nodes.get(left.name).conns.add(right.name);
        nodes.get(right.name).conns.add(left.name);

        const key = [left.name, right.name].sort().join('\0');
        if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push([left.name, right.name]);
        }
    });

    return { nodes, edges, errors, lineRefs };
}

export function parseNodeStr(s) {
    if (!s) return null;
    const i = s.lastIndexOf(':');
    if (i > 0) {
        const name = s.substring(0, i).trim();
        const type = s.substring(i + 1).trim().toLowerCase();
        if (name && NODE_TYPES.includes(type)) return { name, type, explicit: true };
    }
    return { name: s.trim(), type: 'server', explicit: false };
}

function ensureNode(nodes, ref, ln) {
    if (!nodes.has(ref.name)) {
        nodes.set(ref.name, { name: ref.name, type: ref.type, conns: new Set(), lines: new Set() });
    } else if (ref.explicit) {
        nodes.get(ref.name).type = ref.type;
    }
    if (ln !== undefined) nodes.get(ref.name).lines.add(ln);
}
