const path = require('path');
const express = require('express');
const pool = require('./db');
const { crearSesion } = require('./session');
const { cargarUsuario, requireLogin, requireBackoffice, requireAdmin, requireSupervisor } = require('./middleware/auth');
const usuarios = require('./usuarios');
const authRoutes = require('./routes/auth');
const postulantesRoutes = require('./routes/postulantes');
const { paginaAdmin, RUTAS_PENDIENTES } = require('./vistas');

const PUBLIC = path.join(__dirname, '..', 'public');

function crearApp() {
    const app = express();
    app.disable('x-powered-by');
    // Detrás del proxy del hosting: necesario para cookies "secure" e IP real.
    app.set('trust proxy', 1);

    app.use(express.json({ limit: '1mb' }));

    const { middleware: sesion, store } = crearSesion();
    // Para poder cerrarlo (tests / apagado ordenado).
    app.locals.sessionStore = store;
    app.use(sesion);
    app.use(cargarUsuario);

    // ---- API ------------------------------------------------------------
    app.use('/api', authRoutes);
    app.use('/api/postulantes', postulantesRoutes);

    // Verifica que la app llegue a la base (no expone datos).
    app.get('/api/health', async (req, res) => {
        try {
            await pool.query('SELECT 1');
            res.json({ ok: true, db: true });
        } catch (err) {
            console.error('Health DB:', err.message);
            res.status(503).json({ ok: false, db: false });
        }
    });

    // ---- Páginas --------------------------------------------------------
    // Login: si ya hay sesión, a la página de inicio de su rol (como index.php).
    app.get('/', (req, res) => {
        if (req.usuario) return res.redirect(usuarios.destinoPorRol(req.usuario));
        res.sendFile(path.join(PUBLIC, 'index.html'));
    });

    // ---- Backoffice: módulos migrados ----
    app.get('/admin/postulantes', requireBackoffice, paginaAdmin('admin/postulantes.html'));

    // ---- Backoffice: secciones del menú todavía no migradas (con su permiso) ----
    const adminEnMigracion = paginaAdmin('admin/en-migracion.html');
    for (const { ruta, soloAdmin } of RUTAS_PENDIENTES) {
        app.get(ruta, soloAdmin ? requireAdmin : requireBackoffice, adminEnMigracion);
    }

    // Vigilador y supervisor todavía no migrados: página provisoria con el usuario logueado.
    const enMigracion = (req, res) => res.sendFile(path.join(PUBLIC, 'en-migracion.html'));
    app.get('/dashboard', requireLogin, enMigracion);
    app.get('/supervisor/dashboard', requireSupervisor, enMigracion);
    app.get('/registro', (req, res) => res.sendFile(path.join(PUBLIC, 'en-migracion.html')));

    app.use(express.static(PUBLIC, { index: false }));

    // ---- Errores --------------------------------------------------------
    app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        console.error(err);
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
        res.status(500).send('Error interno del servidor');
    });

    return app;
}

module.exports = { crearApp };
