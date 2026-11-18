// Configuración leída de variables de entorno (.env en desarrollo).
const entorno = process.env.NODE_ENV || 'development';
const produccion = entorno === 'production';

function requerida(nombre) {
    const valor = process.env[nombre];
    if (!valor) {
        throw new Error(`Falta la variable de entorno ${nombre} (ver .env.example)`);
    }
    return valor;
}

function numero(nombre, porDefecto) {
    const n = Number(process.env[nombre]);
    return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

const sessionSecret = process.env.SESSION_SECRET || '';
if (produccion && sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET debe tener al menos 32 caracteres en producción');
}

module.exports = {
    entorno,
    produccion,
    port: numero('PORT', 3000),
    db: {
        host: process.env.DB_HOST || 'localhost',
        port: numero('DB_PORT', 3306),
        user: requerida('DB_USER'),
        password: process.env.DB_PASS || '',
        database: requerida('DB_NAME'),
    },
    session: {
        secret: sessionSecret || 'solo-desarrollo-cambiar-en-produccion',
        // Cookie solo por HTTPS. En producción siempre; en local se puede apagar.
        cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : produccion,
        // Duración de la sesión sin actividad, según el rol.
        horasVigilador: numero('SESSION_HORAS_VIGILADOR', 12),
        horasSupervisor: numero('SESSION_HORAS_SUPERVISOR', 12),
        horasBackoffice: numero('SESSION_HORAS_BACKOFFICE', 8),
    },
};
