/* ═══ Ad Slot ═══
   Optional ad placeholder in the bottom-left corner of the editor pane.
   Disabled by default; enabled only when the build/dev environment sets
   VITE_ADS=1 (e.g. `VITE_ADS=1 npm run build`). No ad script is ever
   loaded — this renders a static mock slot only. */

export function initAdSlot() {
    if (import.meta.env.VITE_ADS !== '1') return;

    const pane = document.getElementById('editorPane');
    if (!pane) return;

    const slot = document.createElement('div');
    slot.className = 'ad-slot';
    slot.setAttribute('aria-label', 'Advertisement (mock)');
    slot.title = 'Mock ad — AdSense placeholder';
    slot.innerHTML = `
        <div class="ad-top">
            <span class="ad-chip">Ad</span>
            <span class="ad-url">cloudgrid.example</span>
            <span class="ad-info">&#9432;</span>
        </div>
        <div class="ad-title">CloudGrid Pro &mdash; Virtual Labs for Network Engineers</div>
        <div class="ad-desc">Spin up isometric test topologies in your browser. Free tier available.</div>`;
    pane.appendChild(slot);
}
