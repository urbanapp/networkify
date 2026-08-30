/* ═══ Settings Drawer ═══
   Grid / snap / animation toggles, persisted via state.saveSettings(). */

import { DEFAULT_DSL } from '../config.js';
import { state, saveSettings } from '../state.js';
import { requestRender, scheduleRender, startAnim, stopAnim } from '../render/renderer.js';
import { loadDiagram } from '../diagram.js';
import { closeDrawer } from './drawer.js';

const settingsDrawer = document.getElementById('settingsDrawer');

export function isSettingsOpen() {
    return settingsDrawer.classList.contains('open');
}

export function closeSettings() {
    settingsDrawer.classList.remove('open');
}

export function initSettings() {
    document.getElementById('settingsToggle').addEventListener('click', () => {
        const isOpen = settingsDrawer.classList.toggle('open');
        if (isOpen) { closeDrawer(); }
    });

    document.getElementById('settingsClose').addEventListener('click', closeSettings);

    // Reflect persisted settings in the checkboxes
    const s = state.settings;
    document.getElementById('settingGrid').checked = s.showGrid;
    document.getElementById('settingSnap').checked = s.snapToGrid;
    document.getElementById('settingAnim').checked = s.animEnabled;

    document.getElementById('settingGrid').addEventListener('change', e => {
        s.showGrid = e.target.checked;
        saveSettings();
        requestRender();
    });

    document.getElementById('settingSnap').addEventListener('change', e => {
        s.snapToGrid = e.target.checked;
        saveSettings();
    });

    document.getElementById('settingAnim').addEventListener('change', e => {
        s.animEnabled = e.target.checked;
        saveSettings();
        if (s.animEnabled) startAnim();
        else { stopAnim(); scheduleRender(); }
    });

    // Reset to the demo topology (undoable via Cmd/Ctrl+Z — goes through setDslText)
    document.getElementById('settingResetDemo').addEventListener('click', () => {
        closeSettings();
        // A stale share-URL hash would resurrect the old diagram on reload
        history.replaceState(null, '', location.pathname + location.search);
        loadDiagram(DEFAULT_DSL, 'Demo topology restored');
    });
}
