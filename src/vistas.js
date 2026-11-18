// Páginas del backoffice: HTML en views/ (no se sirve directo) con el menú lateral
// inyectado según el rol del usuario, como hacía admin/nav.php.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const usuarios = require('./usuarios');

const VIEWS = path.join(__dirname, '..', 'views');

// `ruta`: dirección en Node. `migrado: false` → lleva a la página provisoria.
const NAV_GRUPOS = [
    ['Operación', [
        { ruta: '/admin/dashboard', icono: '\u{1F7E2}', texto: 'En vivo', soloAdmin: true },
        { ruta: '/admin/objetivos', icono: '\u{1F3AF}', texto: 'Objetivos', soloAdmin: true },
        { ruta: '/admin/supervisores', icono: '\u{1F4BC}', texto: 'Supervisores' },
        { ruta: '/admin/liquidacion', icono: '\u{23F1}', texto: 'Horas' },
        { ruta: '/admin/reportes', icono: '\u{26A0}', texto: 'Reportes', soloAdmin: true },
    ]],
    ['Personal', [
        { ruta: '/admin/vigiladores', icono: '\u{1F464}', texto: 'Empleados' },
        { ruta: '/admin/legajos', icono: '\u{1F4C1}', texto: 'Legajos' },
        { ruta: '/admin/usuarios', icono: '\u{2795}', texto: 'Usuarios', soloAdmin: true },
    ]],
    ['Selección', [
        { ruta: '/admin/postulantes', icono: '\u{1F4CB}', texto: 'Postulantes', migrado: true },
        { ruta: '/admin/entrevistas', icono: '\u{1F4DD}', texto: 'Entrevistas' },
        { ruta: '/admin/convocados', icono: '\u{1F4DE}', texto: 'Convocados' },
        { ruta: '/admin/contratados', icono: '\u{2705}', texto: 'Contratados' },
    ]],
    ['Sistemas', [
        { ruta: '/admin/dispositivos', icono: '\u{1F4BB}', texto: 'Dispositivos', soloAdmin: true },
        { ruta: '/admin/tickets', icono: '\u{1F3AB}', texto: 'Tickets' },
    ]],
    ['Comunicación', [
        { ruta: '/admin/mails', icono: '\u{2709}', texto: 'Mails' },
    ]],
];

/** Rutas del menú que todavía no se migraron, con el rol que exigen. */
const RUTAS_PENDIENTES = NAV_GRUPOS.flatMap(([, items]) => items)
    .filter((i) => !i.migrado)
    .map((i) => ({ ruta: i.ruta, soloAdmin: !!i.soloAdmin }));

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderNav(usuario, rutaActual) {
    const esAdmin = usuarios.esAdmin(usuario);
    const grupos = NAV_GRUPOS.map(([grupo, items]) => {
        const visibles = items.filter((i) => !i.soloAdmin || esAdmin);
        if (!visibles.length) return '';
        const links = visibles.map((i) => {
            const activo = i.ruta === rutaActual ? ' class="active" aria-current="page"' : '';
            const pendiente = i.migrado ? '' : ' <span class="nav-pendiente" title="Todavía no migrado">·</span>';
            return `<a href="${i.ruta}"${activo}>
                    <span class="side-icon">${i.icono}</span>
                    <span class="side-text">${esc(i.texto)}${pendiente}</span>
                </a>`;
        }).join('\n');
        return `<div class="side-group">${esc(grupo)}</div>\n${links}`;
    }).join('\n');

    return `
<header class="side-topbar">
    <button type="button" class="side-toggle" id="sideToggle" aria-label="Abrir menú" aria-controls="sideNav" aria-expanded="false">
        <span></span><span></span><span></span>
    </button>
    <div class="brand">&#x1F6E1; TDV Seguridad</div>
</header>
<div class="side-backdrop" id="sideBackdrop"></div>
<nav class="side-nav" id="sideNav" aria-label="Menú principal">
    <div class="brand">&#x1F6E1; TDV Seguridad</div>
    <div class="side-links">
${grupos}
    </div>
    <div class="side-user">
        <strong>${esc(usuario.nombre)}</strong>
        <a href="/api/logout">Cerrar sesión</a>
    </div>
</nav>
<style>.nav-pendiente { opacity:.5; margin-left:.2rem; }</style>
<script>
(function () {
    const nav = document.getElementById('sideNav');
    const toggle = document.getElementById('sideToggle');
    const backdrop = document.getElementById('sideBackdrop');
    function setOpen(open) {
        document.body.classList.toggle('side-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    }
    toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('side-open')));
    backdrop.addEventListener('click', () => setOpen(false));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
})();
</script>`;
}

const cache = new Map();
function leerVista(archivo) {
    if (config.produccion && cache.has(archivo)) return cache.get(archivo);
    const html = fs.readFileSync(path.join(VIEWS, archivo), 'utf8');
    if (config.produccion) cache.set(archivo, html);
    return html;
}

/** Envía views/<archivo> reemplazando <!--NAV--> por el menú del usuario. */
function paginaAdmin(archivo) {
    return (req, res) => {
        const html = leerVista(archivo).replace('<!--NAV-->', renderNav(req.usuario, req.path));
        res.type('html').send(html);
    };
}

module.exports = { paginaAdmin, renderNav, RUTAS_PENDIENTES, esc };
