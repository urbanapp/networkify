/* ═══ Autotype ═══
   Demo button that "types" AUTOTYPE_TEXT (see config.js) into the editor
   with a natural keystroke rhythm. Click again while running to cancel. */

import { AUTOTYPE_TEXT } from './config.js';
import { state } from './state.js';
import { cmEditor } from './editor/editor.js';

let autotypeRunning = false;
let autotypeAbort = null;

/* Editor↔canvas highlights pause while the demo types (state.autotypeRunning) */
function setRunning(v) {
    autotypeRunning = v;
    state.autotypeRunning = v;
}

export function initAutotype() {
    const btn = document.getElementById('autotypeBtn');

    btn.addEventListener('click', () => {
        if (autotypeRunning) {
            if (autotypeAbort) autotypeAbort();
            return;
        }

        const textToType = AUTOTYPE_TEXT;
        if (!textToType) return;

        setRunning(true);
        btn.classList.add('running');

        // Move cursor to end of current content
        const lastLine = cmEditor.lastLine();
        cmEditor.setCursor(lastLine, cmEditor.getLine(lastLine).length);
        cmEditor.focus();

        let i = 0;
        let cancelled = false;

        autotypeAbort = () => {
            cancelled = true;
            setRunning(false);
            btn.classList.remove('running');
            autotypeAbort = null;
        };

        function typeNext() {
            if (cancelled) return;
            if (i >= textToType.length) {
                setRunning(false);
                btn.classList.remove('running');
                autotypeAbort = null;
                return;
            }

            const ch = textToType[i];
            const cursor = cmEditor.getCursor();
            cmEditor.replaceRange(ch, cursor);
            i++;

            // Variable delay for natural feel
            let delay = 45;
            if (ch === '\n') delay = 500;
            else if (ch === ' ') delay = 100;
            else if (ch === '-') delay = 50;
            else if (ch === '#') delay = 60;

            setTimeout(typeNext, delay);
        }

        // Small initial pause before typing starts
        setTimeout(typeNext, 400);
    });
}
