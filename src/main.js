/* ═══ Entry Point ═══
   Initializes every module and kicks off the first render. Styles load via
   <link> in index.html (see styles/index.css) so the first paint is styled.
   Module dependency graph is a DAG — where two modules would need each other
   (e.g. theme ↔ renderer, theme ↔ editor), main.js injects the callback instead. */

import { DEFAULT_DSL } from './config.js';
import { state } from './state.js';
import { initTheme, bindEditorTheme } from './theme.js';
import { loadIcons } from './icons.js';
import { resizeCanvas, scheduleRender, render, invalidateScene } from './render/renderer.js';
import { initEditor, setDslText, cmEditor } from './editor/editor.js';
import { initCamera, fitView, setZoom } from './camera.js';
import { initInteractions } from './ui/interactions.js';
import { initKeyboard } from './ui/keyboard.js';
import { initDrawer } from './ui/drawer.js';
import { initSettings } from './ui/settings.js';
import { initExport } from './export/exporters.js';
import { initAutotype } from './autotype.js';
import { initResizer } from './ui/resizer.js';
import { initModals } from './ui/modal.js';
import { initImporter } from './ui/importer.js';
import { initTemplates } from './templates.js';
import { initHelp } from './ui/help.js';
import { initAdSlot } from './ui/adslot.js';
import { initMotion, tidyLayout } from './motion.js';
import { loadInitialState, setSuppressPersist, initShare } from './persistence.js';
import { loadDiagram } from './diagram.js';

initTheme(scheduleRender);
loadIcons(scheduleRender);

initEditor();      // must run before modules that reference cmEditor
bindEditorTheme(name => cmEditor.setOption('theme', name === 'light' ? 'purple-day' : 'purple-night'));
initCamera();
initInteractions();
initKeyboard();
initDrawer();
initSettings();
initExport();
initAutotype();
initResizer();
initModals();      // must run before modules that open dialogs
initImporter();
initTemplates();
initHelp();
initAdSlot();
initMotion();
initShare(() => cmEditor.getValue());

window.addEventListener('resize', resizeCanvas);

resizeCanvas();

/* Boot content: share-URL hash > saved diagram > demo. A hash-loaded diagram
   doesn't overwrite the visitor's saved one until they edit (suppressPersist). */
(async () => {
    let boot = { dsl: DEFAULT_DSL };
    try { boot = await loadInitialState(DEFAULT_DSL); } catch (e) { /* fall back to demo */ }

    if (boot.positions) {
        for (const [name, p] of Object.entries(boot.positions)) {
            if (p && typeof p.col === 'number' && typeof p.row === 'number') {
                state.customPositions.set(name, { col: p.col, row: p.row });
            }
        }
    }
    setSuppressPersist(!!boot.fromHash);
    setDslText(boot.dsl);
    if (boot.fromHash) fitView(); // shared diagrams arrive at unknown sizes
})();

/* Debug handle for console poking and headless smoke tests */
window.__iso = { state, cmEditor, render, invalidateScene, fitView, setZoom, setDslText, loadDiagram, tidyLayout };
