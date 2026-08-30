/* ═══ Starter Templates ═══
   Ready-made topologies, reachable from the Templates dialog (header button)
   and as cards in the canvas empty state. Loading goes through loadDiagram
   (undoable). */

import { ICON_URLS } from './icons.js';
import { cmEditor } from './editor/editor.js';
import { loadDiagram } from './diagram.js';
import { parse } from './dsl/parser.js';
import { openModal, closeTopModal } from './ui/modal.js';

const TEMPLATES = [
    {
        name: '3-Tier Web App',
        icons: ['user', 'server', 'database'],
        dsl: `# 3-Tier Web Application
users:user --- lb:switch
lb:switch --- web-01:server
lb:switch --- web-02:server
web-01:server --- app-01:server
web-02:server --- app-02:server
app-01:server --- db-primary:database
app-02:server --- db-primary:database
db-primary:database --- db-replica:database`,
    },
    {
        name: 'Office Network',
        icons: ['router', 'switch', 'laptop'],
        dsl: `# Office Network
internet:cloud --- edge-fw:firewall
edge-fw:firewall --- core-rtr:router
core-rtr:router --- sw-floor1:switch
core-rtr:router --- sw-floor2:switch
sw-floor1:switch --- pc-alice:laptop
sw-floor1:switch --- pc-bob:laptop
sw-floor2:switch --- pc-carol:laptop
sw-floor2:switch --- print-srv:server`,
    },
    {
        name: 'Cloud Hybrid',
        icons: ['cloud', 'firewall', 'server'],
        dsl: `# Cloud Hybrid
hq-users:user --- vpn-fw:firewall
vpn-fw:firewall --- edge-rtr:router
edge-rtr:router --- aws:cloud
edge-rtr:router --- azure:cloud
aws:cloud --- api-gw:server
api-gw:server --- db-cloud:database
azure:cloud --- backup:database`,
    },
    {
        name: 'Home Lab',
        icons: ['router', 'server', 'laptop'],
        dsl: `# Home Lab
isp:cloud --- modem:router
modem:router --- fw:firewall
fw:firewall --- sw-main:switch
sw-main:switch --- nas:database
sw-main:switch --- proxmox:server
sw-main:switch --- pi-hole:server
sw-main:switch --- desktop:laptop`,
    },
];

function loadTemplate(tpl) {
    const hadContent = cmEditor.getValue().trim().length > 0;
    const undoKey = /Mac|iP/.test(navigator.platform) ? 'Cmd' : 'Ctrl';
    loadDiagram(tpl.dsl, hadContent
        ? `Loaded "${tpl.name}" — press ${undoKey}+Z to undo`
        : `Loaded "${tpl.name}"`);
}

export function initTemplates() {
    // Templates dialog (header button)
    const grid = document.getElementById('templatesGrid');

    TEMPLATES.forEach(tpl => {
        const { nodes, edges } = parse(tpl.dsl);

        const card = document.createElement('button');
        card.className = 'modal-tpl-card';

        const icons = document.createElement('div');
        icons.className = 'tpl-icons';
        tpl.icons.forEach(t => {
            const img = document.createElement('img');
            img.src = ICON_URLS[t];
            img.alt = t;
            icons.appendChild(img);
        });

        const name = document.createElement('span');
        name.className = 'tpl-name';
        name.textContent = tpl.name;

        const stats = document.createElement('span');
        stats.className = 'tpl-stats';
        stats.textContent = `${nodes.size} nodes · ${edges.length} links`;

        card.append(icons, name, stats);
        card.addEventListener('click', () => {
            closeTopModal();
            loadTemplate(tpl);
        });
        grid.appendChild(card);
    });

    document.getElementById('templatesBtn').addEventListener('click', () => {
        document.getElementById('exportMenu').classList.remove('open');
        openModal('templatesModal');
    });

    // Empty-state cards
    const container = document.getElementById('emptyTemplates');
    TEMPLATES.forEach(tpl => {
        const card = document.createElement('div');
        card.className = 'tpl-card';

        const icons = document.createElement('div');
        icons.className = 'tpl-icons';
        tpl.icons.forEach(t => {
            const img = document.createElement('img');
            img.src = ICON_URLS[t];
            img.alt = t;
            icons.appendChild(img);
        });

        const label = document.createElement('span');
        label.textContent = tpl.name;

        card.appendChild(icons);
        card.appendChild(label);
        card.addEventListener('click', () => loadTemplate(tpl));
        container.appendChild(card);
    });
}
