/* ═══ Icon assets ═══
   Vite-imported URLs for the isometric node icons (used for <img> tags),
   plus the Image objects the canvas renderer draws from. */

import { NODE_TYPES } from './config.js';

import cloudUrl    from './assets/icons/cloud-isometric.png';
import databaseUrl from './assets/icons/database-isometric.png';
import firewallUrl from './assets/icons/firewall-isometric.png';
import laptopUrl   from './assets/icons/laptop-isometric.png';
import routerUrl   from './assets/icons/router-isometric.png';
import serverUrl   from './assets/icons/server-isometric.png';
import switchUrl   from './assets/icons/switch-isometric.png';
import userUrl     from './assets/icons/user-isometric.png';

export const ICON_URLS = {
    cloud:    cloudUrl,
    database: databaseUrl,
    firewall: firewallUrl,
    laptop:   laptopUrl,
    router:   routerUrl,
    server:   serverUrl,
    switch:   switchUrl,
    user:     userUrl,
};

/* type → HTMLImageElement, drawn by the canvas renderer */
export const images = {};

export function loadIcons(onAllLoaded) {
    let loadedCount = 0;
    const done = () => { if (++loadedCount === NODE_TYPES.length) onAllLoaded(); };

    NODE_TYPES.forEach(t => {
        const img = new Image();
        images[t] = img;

        // Load via fetch → data URL so the canvas stays non-tainted (needed for
        // export) and so SVG export can embed the icons directly.
        // Falls back to direct loading when fetch is unavailable.
        fetch(ICON_URLS[t])
            .then(r => r.blob())
            .then(blob => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            }))
            .then(dataUrl => {
                img.onload = done;
                img.src = dataUrl;
            })
            .catch(() => {
                img.onload = done;
                img.src = ICON_URLS[t];
            });
    });
}
