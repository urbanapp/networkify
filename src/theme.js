/* ═══ Theme ═══
   Canvas colour palettes plus the light/dark toggle. DOM theming is CSS
   (`body.light` for app chrome, `.canvas-pane.light` kept for compatibility,
   see styles/light.css); canvas drawing reads the live `themeColors` binding.
   The CodeMirror theme swap is injected by main.js (editor ↔ theme would
   otherwise be an import cycle). */

const themes = {
    dark: {
        canvasBg:       '#12141f',
        gridLine:       '#1a1e30',
        hoveredFill:    'rgba(155, 109, 255, 0.08)',
        hoveredStroke:  'rgba(155, 109, 255, 0.25)',
        edgeGlow:       'rgba(120, 90, 210, 0.10)',
        edgeDash:       'rgba(140, 115, 235, 0.40)',
        edgeCore:       'rgba(170, 140, 255, 0.18)',
        edgeDashHi:     'rgba(165, 135, 255, 0.90)',
        edgeCoreHi:     'rgba(195, 170, 255, 0.55)',
        labelBg:        'rgba(12, 14, 22, 0.88)',
        labelBorder:    'rgba(100, 80, 180, 0.22)',
        labelText:      '#b8bede',
        labelBgHi:      'rgba(44, 32, 80, 0.95)',
        labelBorderHi:  'rgba(155, 109, 255, 0.65)',
        labelTextHi:    '#e6dcff',
        marqueeFill:    'rgba(124, 92, 191, 0.08)',
        marqueeStroke:  'rgba(155, 109, 255, 0.6)',
        selectionRing:  'rgba(155, 109, 255, 0.6)',
        selectionGlow:  'rgba(155, 109, 255, 0.5)',
        linkPreview:    'rgba(155, 109, 255, 0.7)',
    },
    light: {
        canvasBg:       '#f0f1f5',
        gridLine:       '#d8dae4',
        hoveredFill:    'rgba(124, 92, 191, 0.06)',
        hoveredStroke:  'rgba(124, 92, 191, 0.20)',
        edgeGlow:       'rgba(120, 90, 210, 0.06)',
        edgeDash:       'rgba(120, 90, 210, 0.35)',
        edgeCore:       'rgba(120, 90, 210, 0.12)',
        edgeDashHi:     'rgba(110, 80, 200, 0.80)',
        edgeCoreHi:     'rgba(110, 80, 200, 0.45)',
        labelBg:        'rgba(255, 255, 255, 0.92)',
        labelBorder:    'rgba(100, 80, 180, 0.18)',
        labelText:      '#3a3e50',
        labelBgHi:      'rgba(240, 235, 255, 0.97)',
        labelBorderHi:  'rgba(124, 92, 191, 0.55)',
        labelTextHi:    '#452a85',
        marqueeFill:    'rgba(124, 92, 191, 0.06)',
        marqueeStroke:  'rgba(124, 92, 191, 0.5)',
        selectionRing:  'rgba(124, 92, 191, 0.65)',
        selectionGlow:  'rgba(124, 92, 191, 0.45)',
        linkPreview:    'rgba(124, 92, 191, 0.75)',
    }
};

/* Explicit user choice wins; otherwise default to dark */
function initialTheme() {
    let saved = null;
    try { saved = localStorage.getItem('iso-theme'); } catch (e) { /* storage unavailable */ }
    if (saved === 'dark' || saved === 'light') return saved;
    return 'dark';
}

export let currentTheme = initialTheme();
export let themeColors = themes[currentTheme];

/* Callbacks injected by main.js — avoids theme ↔ renderer/editor import cycles */
let onThemeChange = null;
let editorThemeHook = null;

export function applyTheme(name, skipRender = false) {
    currentTheme = name;
    themeColors = themes[name];
    try { localStorage.setItem('iso-theme', name); } catch (e) { /* private mode */ }
    document.body.classList.toggle('light', name === 'light');
    document.querySelector('.canvas-pane')?.classList.toggle('light', name === 'light');
    document.getElementById('themeIconMoon').style.display = name === 'dark' ? '' : 'none';
    document.getElementById('themeIconSun').style.display  = name === 'light' ? '' : 'none';
    editorThemeHook?.(name);
    if (!skipRender) onThemeChange?.();
}

/* Wired by main.js after the editor exists; applies the current theme once */
export function bindEditorTheme(hook) {
    editorThemeHook = hook;
    editorThemeHook(currentTheme);
}

export function initTheme(renderCallback) {
    onThemeChange = renderCallback;

    // Apply saved theme on load (skip render — canvas not ready yet)
    applyTheme(currentTheme, true);

    document.getElementById('themeToggle').addEventListener('click', () => {
        applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
}
