// Sesiones guardadas en MySQL (tabla `sessions`, se crea sola la primera vez).
// Sobreviven a reinicios de la app y se pueden cortar desde el servidor.
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const pool = require('./db');
const config = require('./config');

function crearSesion() {
    const store = new MySQLStore(
        {
            createDatabaseTable: true,
            clearExpired: true,
            checkExpirationInterval: 15 * 60 * 1000, // limpia sesiones vencidas cada 15 min
            schema: { tableName: 'sessions' },
        },
        pool
    );

    const middleware = session({
        name: 'tdv.sid',
        secret: config.session.secret,
        store,
        resave: false,
        saveUninitialized: false,
        // Cada pedido renueva el vencimiento: la sesión vence por inactividad.
        rolling: true,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: config.session.cookieSecure,
            maxAge: config.session.horasBackoffice * 3600 * 1000,
        },
    });

    return { middleware, store };
}

module.exports = { crearSesion };
