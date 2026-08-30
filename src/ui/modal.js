/* ═══ Modal ═══
   Shared dialog shell for the Templates and Import dialogs. Markup lives in
   index.html (.modal-overlay > .modal); this module only opens/closes them.
   Backdrop click closes; Escape is routed here from keyboard.js so it takes
   priority over drawer/link-drag handling. */

let openOverlay = null;

export function openModal(id) {
    closeTopModal(); // only one dialog at a time
    const overlay = document.getElementById(id);
    overlay.classList.add('open');
    openOverlay = overlay;
}

/* Returns true if a modal was open (so callers can stop an Escape cascade). */
export function closeTopModal() {
    if (!openOverlay) return false;
    openOverlay.classList.remove('open');
    openOverlay = null;
    return true;
}

export function isModalOpen(id) {
    return id ? openOverlay?.id === id : openOverlay !== null;
}

export function initModals() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        // Backdrop click closes — clicks inside the panel don't bubble to here
        overlay.addEventListener('mousedown', e => {
            if (e.target === overlay) closeTopModal();
        });
        overlay.querySelector('.modal-close')?.addEventListener('click', () => closeTopModal());
    });
}
