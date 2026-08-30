/* ═══ Import Formats ═══
   Pure format registry: each entry converts foreign text into DSL (plus an
   optional position map) — no DOM, no app state (see IMPORT-IDEAS.md).
   A new importer is one more FORMATS entry: { id, label, desc, match, parse }.
   parse() returns { dsl, posMap? } or throws an Error with a user message. */

import { parse as parseDsl } from '../dsl/parser.js';

/* ── Shared helpers ─────────────────────────────────────────────────────────── */

/* Imported ids may contain whitespace/':'/'---' (or start like a comment),
   all of which would break the generated DSL. */
function sanitizeName(raw) {
    const n = String(raw).trim()
        .replace(/^[#/]+/, '')
        .replace(/[:\s]+/g, '-')
        .replace(/-{3,}/g, '--');
    return n || 'node';
}

/* Keyword-based node type inference from a name ("db-primary" → database). */
export function guessType(name) {
    const n = name.toLowerCase();
    if (/(^|[-_.])(db|database|postgres|mysql|maria|mongo|redis|sql|rds|dynamo)/.test(n)) return 'database';
    if (/(^|[-_.])(fw|firewall|waf|security)/.test(n)) return 'firewall';
    if (/(^|[-_.])(router|rtr|gw|gateway|nat|modem)/.test(n)) return 'router';
    if (/(^|[-_.])(switch|sw\d|lb|balancer)/.test(n)) return 'switch';
    if (/(^|[-_.])(cloud|internet|aws|azure|gcp|vpc|cdn|s3)/.test(n)) return 'cloud';
    if (/(^|[-_.])(laptop|desktop|workstation|pc\d)/.test(n)) return 'laptop';
    if (/(^|[-_.])(user|users|client|person)/.test(n)) return 'user';
    return 'server';
}

/* Builds DSL text from a node map + edge list, deduping sanitized names. */
function graphToDsl(comment, nodeTypes /* Map raw → type */, edges /* [rawA, rawB][] */) {
    const names = new Map(); // raw → unique sanitized
    const used = new Set();
    for (const raw of nodeTypes.keys()) {
        let n = sanitizeName(raw), i = 2;
        while (used.has(n)) n = `${sanitizeName(raw)}-${i++}`;
        used.add(n);
        names.set(raw, n);
    }

    const lines = [`# ${comment}`];
    for (const [raw, type] of nodeTypes) lines.push(`${names.get(raw)}:${type}`);
    if (edges.length) lines.push('');
    const seen = new Set();
    for (const [a, b] of edges) {
        const na = names.get(a), nb = names.get(b);
        if (!na || !nb || na === nb) continue;
        const key = [na, nb].sort().join('\0');
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(`${na} --- ${nb}`);
    }
    return lines.join('\n') + '\n';
}

/* ── nmap / masscan XML ─────────────────────────────────────────────────────── */

/* nmap gives hosts, not topology — every up host hangs off a synthetic
   `scanner` node. Types come from open ports, then from the hostname. */
function typeFromPorts(ports) {
    const has = p => ports.includes(p);
    if ([1433, 1521, 3306, 5432, 6379, 27017].some(has)) return 'database';
    if (has(53) || has(67) || has(179)) return 'router';
    if ((has(445) || has(3389)) && !has(80) && !has(443)) return 'laptop';
    return null;
}

function parseNmap(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('not well-formed XML');
    if (doc.documentElement.nodeName !== 'nmaprun') throw new Error('missing <nmaprun> root element');

    const nodeTypes = new Map([['scanner', 'laptop']]);
    const edges = [];
    for (const host of doc.querySelectorAll('host')) {
        const status = host.querySelector('status');
        if (status && status.getAttribute('state') !== 'up') continue;

        const name = host.querySelector('hostnames > hostname')?.getAttribute('name')
            || host.querySelector('address[addrtype="ipv4"], address[addrtype="ipv6"]')?.getAttribute('addr');
        if (!name || nodeTypes.has(name)) continue;

        const ports = [...host.querySelectorAll('ports > port')]
            .filter(p => p.querySelector('state')?.getAttribute('state') === 'open')
            .map(p => Number(p.getAttribute('portid')));
        nodeTypes.set(name, typeFromPorts(ports) || guessType(name));
        edges.push(['scanner', name]);
    }
    if (edges.length === 0) throw new Error('no live hosts in the scan');

    const scanner = doc.documentElement.getAttribute('scanner') || 'nmap';
    return { dsl: graphToDsl(`Imported from ${scanner} scan (${edges.length} hosts)`, nodeTypes, edges) };
}

/* ── Graphviz DOT (subset) ──────────────────────────────────────────────────── */

/* Regex-level subset: node/edge statements, quoted or bare ids, chained edges.
   Attributes are dropped except shape= as a type hint. `terraform graph`
   output is DOT, so Terraform lands here — its "[root] x (expand)" ids get
   cleaned and provider/meta nodes skipped. */
const DOT_KEYWORDS = new Set(['graph', 'digraph', 'subgraph', 'node', 'edge', 'strict']);

function cleanDotId(id) {
    return id.replace(/^\[root\]\s*/, '').replace(/\s+\((expand|close)\)$/, '');
}

function isDotMetaNode(id) {
    return /^provider(\[|\.)/.test(id) || /^meta\./.test(id) || id === 'root';
}

function typeFromShape(shape) {
    if (shape === 'cylinder' || shape === 'database') return 'database';
    if (shape === 'diamond' || shape === 'Mdiamond') return 'router';
    return null;
}

function parseDot(text) {
    let src = text
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*(\/\/|#).*$/gm, '');
    const brace = src.indexOf('{');
    if (!/\b(strict\s+)?(di)?graph\b/.test(src) || brace === -1) {
        throw new Error('missing graph/digraph declaration');
    }
    src = src.slice(brace + 1);

    const nodeTypes = new Map();
    const edges = [];
    const ID = /"((?:[^"\\]|\\.)*)"|([\w.$/-]+)/g; // quoted or bare id
    const addNode = (raw, hint) => {
        if (isDotMetaNode(raw)) return false;
        if (!nodeTypes.has(raw)) nodeTypes.set(raw, hint || guessType(raw));
        else if (hint) nodeTypes.set(raw, hint);
        return true;
    };

    for (let stmt of src.split(/[;\n]/)) {
        const shape = /\bshape\s*=\s*"?(\w+)/.exec(stmt)?.[1];
        stmt = stmt.replace(/\[[^\]]*\]/g, ' ').replace(/[{}]/g, ' ').trim();
        if (!stmt) continue;

        if (/--|->/.test(stmt)) {
            // Edge statement: split on the arrow op, may chain a -> b -> c
            // (bare ids may contain single hyphens — web-01 — but never -- / ->)
            const parts = stmt.split(/\s*(?:--|->)\s*/).map(p => {
                ID.lastIndex = 0;
                const m = ID.exec(p);
                return m ? cleanDotId((m[1] ?? m[2]).replace(/\\"/g, '"')) : null;
            }).filter(Boolean);
            for (let i = 0; i + 1 < parts.length; i++) {
                if (addNode(parts[i]) & addNode(parts[i + 1])) edges.push([parts[i], parts[i + 1]]);
            }
        } else {
            // Node statement: a single id (skip keywords and attr assignments)
            ID.lastIndex = 0;
            const m = ID.exec(stmt);
            if (!m) continue;
            const id = (m[1] ?? m[2]).replace(/\\"/g, '"');
            if (DOT_KEYWORDS.has(id.toLowerCase())) continue;
            if (m[2] && stmt.includes('=')) continue; // rankdir=LR etc.
            addNode(cleanDotId(id), typeFromShape(shape));
        }
    }

    if (nodeTypes.size === 0) throw new Error('no nodes found in the graph');
    return { dsl: graphToDsl(`Imported from Graphviz DOT (${nodeTypes.size} nodes)`, nodeTypes, edges) };
}

/* ── networkify JSON export ─────────────────────────────────────────────────── */

function parseAppJson(text) {
    let data = null;
    try { data = JSON.parse(text); } catch (e) { throw new Error('not valid JSON'); }
    if (!data || typeof data.dsl !== 'string') {
        throw new Error('missing "dsl" field — not a networkify export');
    }
    let posMap = null;
    if (Array.isArray(data.nodes)) {
        posMap = new Map();
        for (const n of data.nodes) {
            if (n && typeof n.name === 'string' && n.position &&
                typeof n.position.col === 'number' && typeof n.position.row === 'number') {
                posMap.set(n.name, { col: n.position.col, row: n.position.row });
            }
        }
    }
    return { dsl: data.dsl, posMap };
}

/* ── Native DSL text ────────────────────────────────────────────────────────── */

function parseDslText(text) {
    const { nodes, errors } = parseDsl(text);
    if (errors.length) throw new Error(`line ${errors[0].line}: ${errors[0].msg}`);
    if (nodes.size === 0) throw new Error('no nodes found');
    return { dsl: text };
}

/* ── Registry ───────────────────────────────────────────────────────────────── */

export const FORMATS = [
    {
        id: 'nmap',
        label: 'nmap scan',
        desc: 'nmap / masscan XML output (nmap -oX scan.xml) — hosts linked to a scanner node',
        match: (filename, text) => /<nmaprun[\s>]/.test(text),
        parse: parseNmap,
    },
    {
        id: 'dot',
        label: 'Graphviz DOT',
        desc: 'Edge lists from .dot / .gv files — Terraform works too, via terraform graph > infra.dot',
        match: (filename, text) =>
            /\.(dot|gv)$/i.test(filename) || /\b(strict\s+)?(di)?graph\b[^{]*\{/.test(text),
        parse: parseDot,
    },
    {
        id: 'json',
        label: 'networkify JSON',
        desc: 'A diagram exported from this app — restores the layout as well',
        match: (filename, text) => {
            if (!text.trimStart().startsWith('{')) return false;
            try { return typeof JSON.parse(text).dsl === 'string'; } catch (e) { return /\.json$/i.test(filename); }
        },
        parse: parseAppJson,
    },
    {
        id: 'dsl',
        label: 'DSL text',
        desc: 'Plain topology text — name:type --- name:type',
        match: () => true, // fallback
        parse: parseDslText,
    },
];

/* First matching format wins; the DSL fallback always matches. */
export function detectFormat(filename, text) {
    return FORMATS.find(f => f.match(filename, text));
}

export function getFormat(id) {
    return FORMATS.find(f => f.id === id);
}

/* Quick summary for the import preview line ("12 nodes, 15 edges"). */
export function summarizeDsl(dsl) {
    const { nodes, edges } = parseDsl(dsl);
    return { nodes: nodes.size, edges: edges.length };
}
