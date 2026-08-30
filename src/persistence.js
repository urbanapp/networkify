/* ═══ Persistence & Share Links ═══
   Saves the DSL text + custom node positions to localStorage on every model
   update, restores them on boot, and encodes the DSL into a shareable URL
   hash (#d=<base64url(deflate)> with #t=<base64url(utf8)> as fallback).

   Import rule: this module must not import editor.js (editor.js imports it) —
   callers pass the DSL text in. */

import { state } from './state.js';
import { toast } from './ui/toast.js';

/* When the diagram was loaded from a share URL, don't overwrite the visitor's
   stored diagram until they actually edit something. */
let suppress = false;

export function setSuppressPersist(v) { suppress = v; }

export function persistState(dslText) {
    if (suppress) return;
    try {
        localStorage.setItem('iso-dsl', dslText);
        const pos = {};
        for (const [name, p] of state.customPositions) pos[name] = { col: p.col, row: p.row };
        localStorage.setItem('iso-positions', JSON.stringify(pos));
    } catch (e) { /* storage unavailable (private mode) — diagram just won't persist */ }
}

/* ── base64url + deflate helpers ────────────────────────────────────────────── */
function bytesToB64url(bytes) {
    let s = '';
    bytes.forEach(b => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function deflateToB64url(text) {
    const stream = new Blob([new TextEncoder().encode(text)]).stream()
        .pipeThrough(new CompressionStream('deflate-raw'));
    return bytesToB64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function inflateFromB64url(str) {
    const stream = new Blob([b64urlToBytes(str)]).stream()
        .pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
}

export async function buildShareURL(dslText) {
    let hash;
    try {
        hash = 'd=' + await deflateToB64url(dslText);
    } catch (e) {
        // CompressionStream unavailable — plain base64url of the UTF-8 text
        hash = 't=' + bytesToB64url(new TextEncoder().encode(dslText));
    }
    return location.origin + location.pathname + location.search + '#' + hash;
}

/* ── Boot state: URL hash > localStorage > caller's default ─────────────────── */
export async function loadInitialState(defaultDsl) {
    const m = location.hash.match(/^#(d|t)=([A-Za-z0-9\-_]+)$/);
    if (m) {
        try {
            const dsl = m[1] === 'd'
                ? await inflateFromB64url(m[2])
                : new TextDecoder().decode(b64urlToBytes(m[2]));
            if (dsl) return { dsl, fromHash: true };
        } catch (e) { /* malformed hash — fall through to stored/default */ }
    }

    let saved = null;
    try { saved = localStorage.getItem('iso-dsl'); } catch (e) { /* storage unavailable */ }
    if (saved !== null) {
        let positions = null;
        try { positions = JSON.parse(localStorage.getItem('iso-positions')); } catch (e) { /* corrupt — ignore */ }
        return { dsl: saved, positions };
    }

    return { dsl: defaultDsl };
}

/* ── Share button ───────────────────────────────────────────────────────────── */
export function initShare(getDslText) {
    document.getElementById('shareBtn').addEventListener('click', async () => {
        const dsl = getDslText();
        if (dsl.trim() === '') { toast('Nothing to share yet', true); return; }
        const url = await buildShareURL(dsl);
        try {
            await navigator.clipboard.writeText(url);
            toast('Link copied');
        } catch (e) {
            // Clipboard API unavailable (http, permissions) — legacy fallback
            const ta = document.createElement('textarea');
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            toast(ok ? 'Link copied' : 'Could not copy link', !ok);
        }
    });
}
