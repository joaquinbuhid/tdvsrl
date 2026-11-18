// Tests del login contra una base MySQL real (usa las variables DB_* del .env).
// Crea usuarios de prueba con email @test.tdv y los borra al terminar.
// Correr: npm test   (NO apuntar a la base de producción)
require('dotenv').config({ quiet: true });
process.env.COOKIE_SECURE = 'false'; // supertest usa http

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const pool = require('../src/db');
const { crearApp } = require('../src/server');

const app = crearApp();

// Hash generado por PHP: password_hash('Clave123', PASSWORD_DEFAULT)
const HASH_PHP = '$2y$10$MPcc7b7CSXGMsGBpM0Zl.OJgjQMwriTkkAAPWEQCxoaS/45tbXrim';
// Mismo formato que PHP ($2y$) para el resto de los usuarios de prueba.
const hashPhp = (clave) => bcrypt.hashSync(clave, 10).replace(/^\$2b\$/, '$2y$');

let objetivoId;
const ids = {};

async function crearEmpleado(clave, { email, tipo, activo = 1, pendiente = 0, objetivo = null, hash }) {
    const [r] = await pool.query(
        `INSERT INTO empleados (nombre, fecha_nac, est_civil, domicilio, CUIL, telefono, email, contrasena,
                                activo, pendiente, tipo, objetivo_id)
         VALUES (?, '1990-01-01', 'Soltero/a', 'Test', ?, '0', ?, ?, ?, ?, ?, ?)`,
        [`Test ${clave}`, `99${Date.now() % 1e9}${tipo}`, email, hash || hashPhp('Clave123'), activo, pendiente, tipo, objetivo]
    );
    return r.insertId;
}

async function limpiar() {
    await pool.query("DELETE FROM empleados WHERE email LIKE '%@test.tdv'");
    await pool.query("DELETE FROM objetivos WHERE nombre = 'Objetivo Test'");
}

before(async () => {
    await limpiar();
    const [r] = await pool.query("INSERT INTO objetivos (nombre) VALUES ('Objetivo Test')");
    objetivoId = r.insertId;
    ids.admin = await crearEmpleado('admin', { email: 'admin@test.tdv', tipo: 4 });
    ids.oficinista = await crearEmpleado('ofi', { email: 'ofi@test.tdv', tipo: 3 });
    ids.supervisor = await crearEmpleado('sup', { email: 'sup@test.tdv', tipo: 2 });
    ids.vigilador = await crearEmpleado('vig', { email: 'vig@test.tdv', tipo: 1, objetivo: objetivoId, hash: HASH_PHP });
    ids.sinObjetivo = await crearEmpleado('sinobj', { email: 'sinobj@test.tdv', tipo: 1 });
    ids.pendiente = await crearEmpleado('pend', { email: 'pend@test.tdv', tipo: 1, objetivo: objetivoId, pendiente: 1 });
    ids.inactivo = await crearEmpleado('inact', { email: 'inact@test.tdv', tipo: 1, objetivo: objetivoId, activo: 0 });
});

after(async () => {
    await limpiar();
    await pool.query('DELETE FROM sessions');
    await app.locals.sessionStore.close();
    await pool.end();
});

const login = (agent, usuario, contrasena = 'Clave123') =>
    agent.post('/api/login').send({ usuario, contrasena });

test('health: la app llega a la base', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, db: true });
});

test('acepta la clave generada por PHP ($2y$) y manda al vigilador a /dashboard', async () => {
    const res = await login(request(app), 'vig@test.tdv');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.destino, '/dashboard');
    assert.equal(res.body.objetivo, 'Objetivo Test');
    assert.equal(res.body.contrasena, undefined, 'nunca devuelve el hash');
});

test('destino según el rol (igual que index.php)', async () => {
    const casos = [
        ['admin@test.tdv', '/admin/dashboard'],
        ['ofi@test.tdv', '/admin/postulantes'],
        ['sup@test.tdv', '/supervisor/dashboard'],
    ];
    for (const [email, destino] of casos) {
        const res = await login(request(app), email);
        assert.equal(res.status, 200, email);
        assert.equal(res.body.destino, destino, email);
    }
});

test('clave incorrecta o email inexistente: 401 con el mismo mensaje', async () => {
    const a = await login(request(app), 'vig@test.tdv', 'otra');
    const b = await login(request(app), 'noexiste@test.tdv');
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error, b.body.error);
});

test('campos vacíos: 400', async () => {
    const res = await login(request(app), '', '');
    assert.equal(res.status, 400);
});

test('bloqueos: pendiente, desactivado y vigilador sin objetivo', async () => {
    const pend = await login(request(app), 'pend@test.tdv');
    assert.equal(pend.status, 403);
    assert.match(pend.body.error, /pendiente/);

    const inact = await login(request(app), 'inact@test.tdv');
    assert.equal(inact.status, 403);
    assert.match(inact.body.error, /desactivada/);

    const sinObj = await login(request(app), 'sinobj@test.tdv');
    assert.equal(sinObj.status, 403);
    assert.match(sinObj.body.error, /objetivo/);
});

test('sesión: /api/me, páginas protegidas y logout', async () => {
    const agent = request.agent(app);
    assert.equal((await agent.get('/api/me')).status, 401);
    assert.equal((await agent.get('/admin/dashboard')).headers.location, '/');

    await login(agent, 'admin@test.tdv');
    const me = await agent.get('/api/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.email, 'admin@test.tdv');
    assert.equal((await agent.get('/admin/dashboard')).status, 200);
    // Con sesión, "/" lleva a la página de su rol.
    assert.equal((await agent.get('/')).headers.location, '/admin/dashboard');

    assert.equal((await agent.post('/api/logout')).status, 200);
    assert.equal((await agent.get('/api/me')).status, 401);
});

test('un vigilador no entra a páginas de admin', async () => {
    const agent = request.agent(app);
    await login(agent, 'vig@test.tdv');
    const res = await agent.get('/admin/dashboard');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/dashboard');
});

test('el id de sesión cambia al loguear (session fixation)', async () => {
    const agent = request.agent(app);
    const cookieDe = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('tdv.sid='));
    // Dos logins seguidos con el mismo navegador: el segundo debe recibir un id nuevo.
    const primero = cookieDe(await login(agent, 'sup@test.tdv'));
    const segundo = cookieDe(await login(agent, 'sup@test.tdv'));
    assert.ok(primero && segundo);
    assert.notEqual(primero.split(';')[0], segundo.split(';')[0]);
});

test('si se desactiva al usuario, la sesión abierta se corta en el próximo pedido', async () => {
    const agent = request.agent(app);
    await login(agent, 'sup@test.tdv');
    assert.equal((await agent.get('/api/me')).status, 200);

    await pool.query('UPDATE empleados SET activo = 0 WHERE id_empleado = ?', [ids.supervisor]);
    try {
        assert.equal((await agent.get('/api/me')).status, 401);
    } finally {
        await pool.query('UPDATE empleados SET activo = 1 WHERE id_empleado = ?', [ids.supervisor]);
    }
});

test('la cookie de sesión es httpOnly y SameSite=Lax', async () => {
    const res = await login(request(app), 'admin@test.tdv');
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('tdv.sid='));
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
});
