/* ═══ Auto-Layout ═══
   BFS tree layers, centred around the origin. Pure: nodes Map → positions Map. */

export function layoutNodes(nodes) {
    if (nodes.size === 0) return new Map();

    const pos = new Map();
    const visited = new Set();
    const order = Array.from(nodes.keys());  // document order
    let globalColOff = 0;

    while (visited.size < nodes.size) {
        const root = order.find(n => !visited.has(n));
        if (!root) break;

        // BFS levels
        const levels = [];
        const queue = [root];
        visited.add(root);
        const depth = new Map([[root, 0]]);

        while (queue.length > 0) {
            const cur = queue.shift();
            const d = depth.get(cur);
            if (!levels[d]) levels[d] = [];
            levels[d].push(cur);

            for (const nb of (nodes.get(cur)?.conns || [])) {
                if (!visited.has(nb)) {
                    visited.add(nb);
                    depth.set(nb, d + 1);
                    queue.push(nb);
                }
            }
        }

        // Assign positions per level with spacing
        const maxW = Math.max(...levels.map(l => l.length));
        levels.forEach((lv, row) => {
            const off = (maxW - lv.length) / 2;
            lv.forEach((name, col) => {
                pos.set(name, {
                    col: (off + col) * 2 + globalColOff,
                    row: row * 2
                });
            });
        });

        globalColOff += maxW * 2 + 3;
    }

    // Centre layout around origin
    let cMin = Infinity, cMax = -Infinity, rMin = Infinity, rMax = -Infinity;
    for (const p of pos.values()) {
        cMin = Math.min(cMin, p.col); cMax = Math.max(cMax, p.col);
        rMin = Math.min(rMin, p.row); rMax = Math.max(rMax, p.row);
    }
    const cc = (cMin + cMax) / 2, rc = (rMin + rMax) / 2;
    for (const p of pos.values()) { p.col -= cc; p.row -= rc; }

    // Snap to grid cell centres
    for (const p of pos.values()) {
        p.col = Math.floor(p.col) + 0.5;
        p.row = Math.floor(p.row) + 0.5;
    }

    return pos;
}
