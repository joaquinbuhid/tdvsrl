const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { request, pool, crearApp, crearEmpleado, borrarEmpleadosTest, agenteLogueado, cerrar } = require('./helpers');

const app = crearApp();
const MARCA = 'ZZTestPostulante';
let admin, oficinista, vigilador;
let idEntrevistado;

async function crearPostulante(n, extra = {}) {
    const p = {
        nombre_completo: `${MARCA} ${String(n).padStart(3, '0')}`,
        dni: `T${process.pid}${n}`,
        fecha_nacimiento: '1995-06-15',
        telefono: '111',
        email: `p${n}@test.tdv`,
        localidad_residencia: 'Test',
        experiencia_seguridad: n % 2 ? 'si' : 'no',
        curso_habilitante: n % 3 === 0 ? 'si' : 'no',
        credencial_vigente: 'no',
        disponibilidad_horaria: 'Full Time',
        puesto_postula: 'Vigilador',
        parte_track_seguridad: 'no',
        monotributista: 'no',
        es_monotributista: 0,
        genero: n % 4 === 0 ? null : '1',
        ...extra,
    };
    const [r] = await pool.query('INSERT INTO postulantes SET ?', [p]);
    return r.insertId;
}

async function limpiar() {
    await pool.query(`DELETE FROM entrevistas WHERE nombre_completo LIKE '${MARCA}%'`);
    await pool.query(`DELETE FROM postulantes WHERE nombre_completo LIKE '${MARCA}%'`);
    await borrarEmpleadosTest();
}

before(async () => {
    await limpiar();
    await crearEmpleado({ email: 'admin-p@test.tdv', tipo: 4 });
    await crearEmpleado({ email: 'ofi-p@test.tdv', tipo: 3 });
    const [o] = await pool.query("INSERT INTO objetivos (nombre) VALUES ('Objetivo Test P')");
    await crearEmpleado({ email: 'vig-p@test.tdv', tipo: 1, objetivo: o.insertId });
    for (let n = 1; n <= 60; n++) await crearPostulante(n);
    // Uno ya entrevistado: no tiene que aparecer en el listado.
    idEntrevistado = await crearPostulante(61);
    await pool.query('INSERT INTO entrevistas (postulante_id, nombre_completo, dni) VALUES (?, ?, ?)',
        [idEntrevistado, `${MARCA} 061`, 'x']);

    admin = await agenteLogueado(app, 'admin-p@test.tdv');
    oficinista = await agenteLogueado(app, 'ofi-p@test.tdv');
    vigilador = await agenteLogueado(app, 'vig-p@test.tdv');
});

after(async () => {
    await limpiar();
    await pool.query("DELETE FROM objetivos WHERE nombre = 'Objetivo Test P'");
    await cerrar(app);
});

const listar = (agent, params = {}) =>
    agent.get('/api/postulantes').query({ q: MARCA, ...params });

test('permisos de la API: sin sesión 401, vigilador 403, oficinista y admin 200', async () => {
    assert.equal((await request(app).get('/api/postulantes')).status, 401);
    assert.equal((await vigilador.get('/api/postulantes')).status, 403);
    assert.equal((await oficinista.get('/api/postulantes')).status, 200);
    assert.equal((await admin.get('/api/postulantes')).status, 200);
});

test('paginación: total real, páginas y última página incompleta', async () => {
    const p1 = await listar(admin, { per_page: 25, page: 1 });
    assert.equal(p1.status, 200);
    assert.equal(p1.body.total, 60, 'el entrevistado no cuenta');
    assert.equal(p1.body.pages, 3);
    assert.equal(p1.body.items.length, 25);

    const p3 = await listar(admin, { per_page: 25, page: 3 });
    assert.equal(p3.body.items.length, 10);

    // Página fuera de rango: devuelve la última.
    const p99 = await listar(admin, { per_page: 25, page: 99 });
    assert.equal(p99.body.page, 3);

    // Sin repetidos entre páginas.
    const p2 = await listar(admin, { per_page: 25, page: 2 });
    const ids = [...p1.body.items, ...p2.body.items, ...p3.body.items].map((p) => p.id);
    assert.equal(new Set(ids).size, 60);
});

test('no lista postulantes que ya tienen entrevista', async () => {
    const res = await listar(admin, { per_page: 200 });
    assert.ok(!res.body.items.some((p) => p.id === idEntrevistado));
});

test('filtros: curso, experiencia, género no especificado y edad', async () => {
    const curso = await listar(admin, { curso_habilitante: 'si', per_page: 200 });
    assert.equal(curso.body.total, 20); // múltiplos de 3 entre 1 y 60
    assert.ok(curso.body.items.every((p) => p.curso_habilitante === 'si'));

    const exp = await listar(admin, { experiencia_seguridad: 'no', per_page: 200 });
    assert.equal(exp.body.total, 30);

    const sinGenero = await listar(admin, { genero: 'vacio', per_page: 200 });
    assert.equal(sinGenero.body.total, 15);
    assert.ok(sinGenero.body.items.every((p) => p.genero === 'No especificado'));

    const edad = await listar(admin, { edad_desde: 200 });
    assert.equal(edad.body.total, 0);
});

test('validaciones devuelven 400 con el mismo mensaje que PHP', async () => {
    const r1 = await listar(admin, { edad_desde: 'abc' });
    assert.equal(r1.status, 400);
    assert.match(r1.body.error, /edad desde/);

    const r2 = await listar(admin, { edad_desde: 40, edad_hasta: 20 });
    assert.equal(r2.status, 400);

    const r3 = await listar(admin, { desde: '2026-12-01', hasta: '2026-01-01' });
    assert.equal(r3.status, 400);
});

test('búsqueda con comillas y caracteres raros no rompe la consulta', async () => {
    const res = await admin.get('/api/postulantes').query({ q: `' OR 1=1 -- "%_` });
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 0);
});

test('página: menú según el rol y permisos de las secciones', async () => {
    const pagAdmin = await admin.get('/admin/postulantes');
    assert.equal(pagAdmin.status, 200);
    assert.match(pagAdmin.text, /href="\/admin\/postulantes" class="active"/);
    assert.match(pagAdmin.text, /href="\/admin\/usuarios"/, 'admin ve Usuarios');

    const pagOfi = await oficinista.get('/admin/postulantes');
    assert.equal(pagOfi.status, 200);
    assert.doesNotMatch(pagOfi.text, /href="\/admin\/usuarios"/, 'oficinista no ve Usuarios');

    // Sección solo admin: el oficinista vuelve a su inicio; el admin ve la provisoria.
    const usuOfi = await oficinista.get('/admin/usuarios');
    assert.equal(usuOfi.status, 302);
    assert.equal(usuOfi.headers.location, '/admin/postulantes');
    assert.equal((await admin.get('/admin/usuarios')).status, 200);

    // Vigilador no entra al backoffice.
    const pagVig = await vigilador.get('/admin/postulantes');
    assert.equal(pagVig.headers.location, '/dashboard');
});

test('el nombre en el menú se escapa (no inyecta HTML)', async () => {
    await pool.query("UPDATE empleados SET nombre = '<b>x</b>' WHERE email = 'ofi-p@test.tdv'");
    const res = await oficinista.get('/admin/postulantes');
    assert.match(res.text, /&lt;b&gt;x&lt;\/b&gt;/);
    assert.doesNotMatch(res.text, /<strong><b>x<\/b><\/strong>/);
});

test('acentos y ñ se leen correctamente (utf8mb4)', async () => {
    await crearPostulante(99, { nombre_completo: `${MARCA} Ñandú Pérez` });
    const res = await listar(admin, { q: 'Ñandú' });
    assert.equal(res.body.total, 1);
    assert.equal(res.body.items[0].nombre_completo, `${MARCA} Ñandú Pérez`);
});
