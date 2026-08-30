/* ═══ Shared constants ═══ */

export const NODE_TYPES = ['cloud', 'database', 'firewall', 'laptop', 'router', 'server', 'switch', 'user'];

/* Isometric grid metrics (screen px at zoom 1) */
export const TILE_W = 220;
export const TILE_H = 130;
export const ICON_SZ = 90;

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;

/* Content loaded into the editor on startup */
export const DEFAULT_DSL = `# Network Topology
#
# Syntax: name:type --- name:type
# Types:  server, database, cloud, switch, router, firewall, laptop, user

users:user --- loadbalancer:switch
loadbalancer:switch --- web-01:server
loadbalancer:switch --- web-02:server
web-01:server --- db-primary:database
web-02:server --- db-replica:database
web-01:server --- fw-main:firewall
fw-main:firewall --- cloud-api:cloud
admin:laptop --- fw-main:firewall`;

/* Text appended by the autotype demo button */
export const AUTOTYPE_TEXT = '\nloadbalancer --- web-02:server\nweb-02 --- db-replica:database';
