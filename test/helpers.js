// Utilidades compartidas por los tests. Corren contra la base del .env:
// usar SIEMPRE una base de prueba, nunca la de producción.
require('dotenv').config({ quiet: true });
process.env.COOKIE_SECURE = 'false'; // supertest usa http

const request = require('supertest');
const bcrypt = require('bcryptjs');
const pool = require('../src/db');
const { crearApp } = require('../src/server');

// Mismo formato que password_hash() de PHP ($2y$).
const hashPhp = (clave) => bcrypt.hashSync(clave, 10).replace(/^\$2b\$/, '$2y$');
const CLAVE = 'Clave123';
const HASH = hashPhp(CLAVE);

let cuil = 0;
async function crearEmpleado({ email, tipo, activo = 1, pendiente = 0, objetivo = null, hash = HASH }) {
    cuil += 1;
    const [r] = await pool.query(
        `INSERT INTO empleados (nombre, fecha_nac, est_civil, domicilio, CUIL, telefono, email, contrasena,
                                activo, pendiente, tipo, objetivo_id)
         VALUES (?, '1990-01-01', 'Soltero/a', 'Test', ?, '0', ?, ?, ?, ?, ?, ?)`,
        [`Test ${email}`, `98${process.pid}${cuil}`, email, hash, activo, pendiente, tipo, objetivo]
    );
    return r.insertId;
}

async function borrarEmpleadosTest() {
    await pool.query("DELETE FROM empleados WHERE email LIKE '%@test.tdv'");
}

/** Devuelve un agente de supertest ya logueado. */
async function agenteLogueado(app, email) {
    const agent = request.agent(app);
    const res = await agent.post('/api/login').send({ usuario: email, contrasena: CLAVE });
    if (res.status !== 200) throw new Error(`No se pudo loguear ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    return agent;
}

async function cerrar(app) {
    await pool.query('DELETE FROM sessions');
    await app.locals.sessionStore.close();
    await pool.end();
}

module.exports = { request, pool, crearApp, hashPhp, CLAVE, crearEmpleado, borrarEmpleadosTest, agenteLogueado, cerrar };
