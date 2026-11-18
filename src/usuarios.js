// Usuarios del sistema = filas de la tabla empleados.
const pool = require('./db');

// empleados.tipo
const TIPO = Object.freeze({
    VIGILADOR: 1,
    SUPERVISOR: 2,
    OFICINISTA: 3,
    ADMIN: 4,
});

const esBackoffice = (u) => !!u && (u.tipo === TIPO.ADMIN || u.tipo === TIPO.OFICINISTA);
const esAdmin = (u) => !!u && u.tipo === TIPO.ADMIN;
const esOficinista = (u) => !!u && u.tipo === TIPO.OFICINISTA;
const esSupervisor = (u) => !!u && u.tipo === TIPO.SUPERVISOR;
const esVigilador = (u) => !!u && u.tipo === TIPO.VIGILADOR;

const CAMPOS = `e.id_empleado, e.nombre, e.email, e.contrasena, e.activo, e.pendiente, e.tipo,
                o.id_objetivo, o.nombre AS objetivo_nombre`;

function normalizar(row) {
    if (!row) return null;
    return {
        id: Number(row.id_empleado),
        nombre: row.nombre,
        email: row.email,
        contrasena: row.contrasena,
        activo: Number(row.activo) === 1,
        pendiente: Number(row.pendiente) === 1,
        tipo: Number(row.tipo) || TIPO.VIGILADOR,
        objetivoId: row.id_objetivo ? Number(row.id_objetivo) : null,
        objetivoNombre: row.objetivo_nombre || null,
    };
}

async function buscarPorEmail(email) {
    const [rows] = await pool.query(
        `SELECT ${CAMPOS}
         FROM empleados e
         LEFT JOIN objetivos o ON e.objetivo_id = o.id_objetivo
         WHERE e.email = ?
         LIMIT 1`,
        [email]
    );
    return normalizar(rows[0]);
}

async function buscarPorId(id) {
    const [rows] = await pool.query(
        `SELECT ${CAMPOS}
         FROM empleados e
         LEFT JOIN objetivos o ON e.objetivo_id = o.id_objetivo
         WHERE e.id_empleado = ?
         LIMIT 1`,
        [id]
    );
    return normalizar(rows[0]);
}

/**
 * Mismas reglas que api/login.php. Devuelve null si puede entrar,
 * o {status, error} si no.
 */
function motivoBloqueo(u) {
    if (u.pendiente) {
        return { status: 403, error: 'Tu cuenta esta pendiente de aprobacion. Contacta al administrador.' };
    }
    if (!u.activo) {
        return { status: 403, error: 'Cuenta desactivada. Contacta al administrador.' };
    }
    if (!Object.values(TIPO).includes(u.tipo)) {
        return { status: 403, error: 'Tipo de usuario invalido. Contacta al administrador.' };
    }
    if (esVigilador(u) && !u.objetivoId) {
        return { status: 403, error: 'No tiene un objetivo asignado. Contacta al administrador.' };
    }
    return null;
}

/** Página de inicio de cada rol (mismas que el sistema PHP). */
function destinoPorRol(u) {
    if (esOficinista(u)) return '/admin/postulantes';
    if (esAdmin(u)) return '/admin/dashboard';
    if (esSupervisor(u)) return '/supervisor/dashboard';
    return '/dashboard';
}

/** Datos del usuario que se pueden mandar al navegador (sin la contraseña). */
function publico(u) {
    return {
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        tipo: u.tipo,
        es_backoffice: esBackoffice(u),
        es_admin: esAdmin(u),
        es_oficinista: esOficinista(u),
        es_supervisor: esSupervisor(u),
        objetivo: u.objetivoNombre,
        destino: destinoPorRol(u),
    };
}

module.exports = {
    TIPO,
    esBackoffice,
    esAdmin,
    esOficinista,
    esSupervisor,
    esVigilador,
    buscarPorEmail,
    buscarPorId,
    motivoBloqueo,
    destinoPorRol,
    publico,
};
