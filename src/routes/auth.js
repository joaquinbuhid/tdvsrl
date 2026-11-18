const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const usuarios = require('../usuarios');
const config = require('../config');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// Freno a intentos de adivinar claves: 20 intentos fallidos cada 15 minutos por IP.
const limiteLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Espere unos minutos y vuelva a intentar.' },
});

// Hash ficticio para comparar cuando el email no existe y tardar lo mismo
// (no revela qué emails están registrados).
const HASH_FICTICIO = bcrypt.hashSync('no-existe', 10);

function horasSesion(u) {
    if (usuarios.esBackoffice(u)) return config.session.horasBackoffice;
    if (usuarios.esSupervisor(u)) return config.session.horasSupervisor;
    return config.session.horasVigilador;
}

router.post('/login', limiteLogin, async (req, res, next) => {
    const email = String(req.body?.usuario ?? '').trim();
    const clave = String(req.body?.contrasena ?? '');

    if (!email || !clave) {
        return res.status(400).json({ error: 'Email y contrasena son requeridos' });
    }

    try {
        const u = await usuarios.buscarPorEmail(email);
        // bcryptjs valida los hashes $2y$ que genera password_hash() de PHP.
        const ok = await bcrypt.compare(clave, u ? u.contrasena : HASH_FICTICIO);
        if (!u || !ok) {
            return res.status(401).json({ error: 'Email o contrasena incorrectos' });
        }

        const bloqueo = usuarios.motivoBloqueo(u);
        if (bloqueo) {
            return res.status(bloqueo.status).json({ error: bloqueo.error });
        }

        // Nuevo id de sesión al loguear (evita session fixation).
        req.session.regenerate((err) => {
            if (err) return next(err);
            req.session.empleadoId = u.id;
            req.session.cookie.maxAge = horasSesion(u) * 3600 * 1000;
            req.session.save((err2) => {
                if (err2) return next(err2);
                res.json({ success: true, ...usuarios.publico(u) });
            });
        });
    } catch (err) {
        next(err);
    }
});

function cerrarSesion(req, res, next, responder) {
    if (!req.session) return responder();
    req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie('tdv.sid');
        responder();
    });
}

router.post('/logout', (req, res, next) => {
    cerrarSesion(req, res, next, () => res.json({ success: true }));
});

// Los links "Cerrar sesión" del sistema actual son GET.
router.get('/logout', (req, res, next) => {
    cerrarSesion(req, res, next, () => res.redirect('/'));
});

router.get('/me', requireLogin, (req, res) => {
    res.json(usuarios.publico(req.usuario));
});

module.exports = router;
