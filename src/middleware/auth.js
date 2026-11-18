// En la sesión solo se guarda el id del empleado. En cada pedido se relee de la base,
// así un cambio de rol o una baja se aplica en el momento (en PHP recién al re-loguear).
const usuarios = require('../usuarios');

async function cargarUsuario(req, res, next) {
    req.usuario = null;
    const id = req.session && req.session.empleadoId;
    if (!id) return next();
    try {
        const u = await usuarios.buscarPorId(id);
        if (!u || usuarios.motivoBloqueo(u)) {
            // Dado de baja, desactivado o pendiente: se corta la sesión.
            return req.session.destroy(() => next());
        }
        req.usuario = u;
        next();
    } catch (err) {
        next(err);
    }
}

const esApi = (req) => req.originalUrl.startsWith('/api/');

function rechazar(req, res, status, mensaje) {
    if (esApi(req)) {
        return res.status(status).json({ error: mensaje });
    }
    // Páginas: sin sesión al login; sin permiso a su propia página de inicio.
    return res.redirect(req.usuario ? usuarios.destinoPorRol(req.usuario) : '/');
}

function exigir(condicion) {
    return (req, res, next) => {
        if (!req.usuario) return rechazar(req, res, 401, 'No autorizado');
        if (!condicion(req.usuario)) return rechazar(req, res, 403, 'No autorizado para este rol');
        next();
    };
}

module.exports = {
    cargarUsuario,
    requireLogin: exigir(() => true),
    requireBackoffice: exigir(usuarios.esBackoffice),
    requireAdmin: exigir(usuarios.esAdmin),
    requireSupervisor: exigir(usuarios.esSupervisor),
};
