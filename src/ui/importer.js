/* ═══ Import ═══
   Import dialog: a dropped/chosen file is staged, its format auto-detected
   from the registry (src/import/formats.js) and pre-selected, a preview line
   shows what would load, and Import applies it via loadDiagram (undoable).
   Drag-and-drop anywhere onto the canvas opens this dialog. */

import { loadDiagram } from '../diagram.js';
import { FORMATS, detectFormat, getFormat, summarizeDsl } from '../import/formats.js';
import { openModal, closeTopModal } from './modal.js';

let staged = null;      // { text, filename } waiting in the dialog
let selectedId = null;  // id of the selected format row
let result = null;      // { dsl, posMap? } when the selected format parses

let formatRows, statusEl, fileLabel, confirmBtn;

/* ── Dialog state ───────────────────────────────────────────────────────────── */
function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = 'import-status ' + cls;
}

function reparse() {
    result = null;
    confirmBtn.disabled = true;

    if (!staged) {
        setStatus('Choose or drop a file to import.', 'idle');
        return;
    }
    const fmt = getFormat(selectedId);
    if (!fmt) {
        setStatus('Pick a format for this file.', 'idle');
        return;
    }
    try {
        result = fmt.parse(staged.text);
        const s = summarizeDsl(result.dsl);
        setStatus(`✓ ${s.nodes} nodes, ${s.edges} connections — ready to import.`, 'ok');
        confirmBtn.disabled = false;
    } catch (err) {
        setStatus(`✗ Cannot read this file as ${fmt.label}: ${err.message}.`, 'error');
    }
}

function selectFormat(id) {
    selectedId = id;
    formatRows.forEach(row => row.classList.toggle('selected', row.dataset.format === id));
    reparse();
}

function stageText(text, filename) {
    fileLabel.textContent = filename;
    fileLabel.classList.add('filename');

    // Binary sniff — a dropped PNG/zip decodes to null bytes / replacement chars
    if (/[\u0000\uFFFD]/.test(text)) {
        staged = null;
        selectFormat(null);
        setStatus(`✗ ${filename} is not a text file.`, 'error');
        return;
    }
    staged = { text, filename };
    selectFormat(detectFormat(filename, text).id); // DSL fallback always matches
}

function resetDialog() {
    staged = null;
    fileLabel.textContent = 'Drop a file here, or';
    fileLabel.classList.remove('filename');
    selectFormat(null);
}

/* Opens the dialog and stages `file` once read (drag-drop / file picker). */
function stageFile(file) {
    if (!file) return;
    openModal('importModal');
    const reader = new FileReader();
    reader.onload = () => stageText(String(reader.result), file.name);
    reader.onerror = () => { staged = null; setStatus(`✗ Could not read ${file.name}.`, 'error'); };
    reader.readAsText(file);
}

/* ── Init ───────────────────────────────────────────────────────────────────── */
export function initImporter() {
    statusEl = document.getElementById('importStatus');
    fileLabel = document.getElementById('importFileLabel');
    confirmBtn = document.getElementById('importConfirmBtn');
    const input = document.getElementById('importFile');
    const dropzone = document.getElementById('importDropzone');

    // Format rows from the registry
    const formatsBox = document.getElementById('importFormats');
    formatRows = FORMATS.map(fmt => {
        const row = document.createElement('button');
        row.className = 'import-format';
        row.dataset.format = fmt.id;

        const label = document.createElement('span');
        label.className = 'fmt-label';
        label.textContent = fmt.label;

        const desc = document.createElement('span');
        desc.className = 'fmt-desc';
        // Render `code` spans in descriptions (e.g. the terraform graph hint)
        fmt.desc.split(/`([^`]+)`/).forEach((part, i) => {
            if (!part) return;
            const node = i % 2 ? document.createElement('code') : document.createTextNode(part);
            if (i % 2) node.textContent = part;
            desc.appendChild(node);
        });

        row.append(label, desc);
        row.addEventListener('click', () => selectFormat(fmt.id));
        formatsBox.appendChild(row);
        return row;
    });

    // Header button opens a fresh dialog; in-dialog buttons
    document.getElementById('importBtn').addEventListener('click', () => {
        resetDialog();
        openModal('importModal');
    });
    document.getElementById('importChooseBtn').addEventListener('click', () => input.click());
    document.getElementById('importCancelBtn').addEventListener('click', () => closeTopModal());
    confirmBtn.addEventListener('click', () => {
        if (!result || !staged) return;
        const { filename } = staged;
        closeTopModal();
        loadDiagram(result.dsl, `Imported ${filename}`, result.posMap);
        resetDialog();
    });

    input.addEventListener('change', () => {
        stageFile(input.files[0]);
        input.value = ''; // allow re-importing the same file
    });

    // Drag-and-drop: canvas pane opens the dialog; the dialog restages
    const pane = document.querySelector('.canvas-pane');
    const overlay = document.getElementById('importModal');

    pane.addEventListener('dragover', e => {
        if (e.dataTransfer?.types.includes('Files')) {
            e.preventDefault();
            pane.classList.add('droptarget');
        }
    });
    pane.addEventListener('dragleave', e => {
        // Ignore leave events fired when moving over the pane's children
        if (!e.relatedTarget || !pane.contains(e.relatedTarget)) {
            pane.classList.remove('droptarget');
        }
    });
    pane.addEventListener('drop', e => {
        e.preventDefault();
        pane.classList.remove('droptarget');
        stageFile(e.dataTransfer.files[0]);
    });

    overlay.addEventListener('dragover', e => {
        if (e.dataTransfer?.types.includes('Files')) {
            e.preventDefault();
            dropzone.classList.add('dragging');
        }
    });
    overlay.addEventListener('dragleave', e => {
        if (!e.relatedTarget || !overlay.contains(e.relatedTarget)) {
            dropzone.classList.remove('dragging');
        }
    });
    overlay.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('dragging');
        stageFile(e.dataTransfer.files[0]);
    });

    resetDialog();
}
