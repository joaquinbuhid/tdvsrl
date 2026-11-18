// Postulantes (tabla compartida con el formulario público de postulación).
// Port de admin/api/get_postulantes.php. Por ahora solo lectura.
const express = require('express');
const pool = require('../db');
const { requireBackoffice } = require('../middleware/auth');

const router = express.Router();

const DISPONIBILIDADES = ['Full Time', 'Turno Diurno', 'Turno Nocturno', 'Rotativos'];
const CAMPOS_SI_NO = ['experiencia_seguridad', 'curso_habilitante', 'credencial_vigente', 'parte_track_seguridad', 'monotributista'];

const texto = (v) => String(v ?? '').trim();

function fechaValida(v) {
    const s = texto(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(s + 'T00:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

/** Arma el WHERE a partir de los filtros. Devuelve {where, params} o {error}. */
function filtros(q) {
    // Los postulantes que ya tienen una entrevista registrada no se listan.
    const where = ['NOT EXISTS (SELECT 1 FROM entrevistas ent WHERE ent.postulante_id = postulantes.id)'];
    const params = [];

    const edadDesde = texto(q.edad_desde);
    const edadHasta = texto(q.edad_hasta);
    if (edadDesde && !/^\d+$/.test(edadDesde)) {
        return { error: 'La edad desde debe ser un número entero válido y mayor o igual a 0' };
    }
    if (edadHasta && !/^\d+$/.test(edadHasta)) {
        return { error: 'La edad hasta debe ser un número entero válido y mayor o igual a 0' };
    }
    if (edadDesde && edadHasta && Number(edadDesde) > Number(edadHasta)) {
        return { error: 'La edad desde no puede ser mayor que la edad hasta' };
    }
    const desde = fechaValida(q.desde);
    const hasta = fechaValida(q.hasta);
    if (desde && hasta && desde > hasta) {
        return { error: 'La fecha desde no puede ser mayor que la fecha hasta' };
    }

    const busqueda = texto(q.q);
    if (busqueda) {
        where.push('(nombre_completo LIKE ? OR dni LIKE ? OR telefono LIKE ? OR email LIKE ? OR localidad_residencia LIKE ? OR puesto_postula LIKE ?)');
        params.push(...Array(6).fill(`%${busqueda}%`));
    }

    for (const campo of CAMPOS_SI_NO) {
        const v = texto(q[campo]);
        if (v === 'si' || v === 'no') {
            where.push(`${campo} = ?`);
            params.push(v);
        }
    }

    const disponibilidad = texto(q.disponibilidad_horaria);
    if (DISPONIBILIDADES.includes(disponibilidad)) {
        where.push('disponibilidad_horaria = ?');
        params.push(disponibilidad);
    }

    const puesto = texto(q.puesto_postula);
    if (puesto) {
        where.push('puesto_postula LIKE ?');
        params.push(`%${puesto}%`);
    }

    if (desde) {
        where.push('DATE(fecha_registro) >= ?');
        params.push(desde);
    }
    if (hasta) {
        where.push('DATE(fecha_registro) <= ?');
        params.push(hasta);
    }
    if (edadDesde) {
        where.push('TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) >= ?');
        params.push(Number(edadDesde));
    }
    if (edadHasta) {
        where.push('TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) <= ?');
        params.push(Number(edadHasta));
    }

    const genero = texto(q.genero);
    if (genero === 'vacio') {
        where.push("(genero IS NULL OR genero NOT IN ('1', '2'))");
    } else if (genero) {
        where.push('genero = ?');
        params.push(genero);
    }

    const tieneBaja = texto(q.tiene_baja);
    if (tieneBaja === 'si') {
        where.push("(COALESCE(NULLIF(baja_adjunta, ''), url_baja, '') != '')");
    } else if (tieneBaja === 'no') {
        where.push("(COALESCE(NULLIF(baja_adjunta, ''), url_baja, '') = '')");
    }

    return { where: where.join(' AND '), params };
}

const SELECT = `
    SELECT id, nombre_completo, dni, fecha_nacimiento, telefono, email,
           localidad_residencia, experiencia_seguridad, curso_habilitante,
           credencial_vigente, disponibilidad_horaria, puesto_postula,
           parte_track_seguridad, archivo_adjunto,
           monotributista, COALESCE(NULLIF(baja_adjunta, ''), NULLIF(url_baja, '')) AS baja_adjunta,
           CASE WHEN genero = '1' THEN 'Masculino'
                WHEN genero = '2' THEN 'Femenino'
                ELSE 'No especificado' END AS genero,
           TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad,
           DATE_FORMAT(fecha_registro, '%d/%m/%Y %H:%i') AS fecha_registro_fmt,
           fecha_registro
    FROM postulantes`;

// GET /api/postulantes?page=1&per_page=50&q=...&filtros...
// Responde {items, total, page, per_page, pages}.
router.get('/', requireBackoffice, async (req, res, next) => {
    const f = filtros(req.query);
    if (f.error) return res.status(400).json({ error: f.error });

    const perPage = Math.min(200, Math.max(1, parseInt(req.query.per_page, 10) || 50));
    let page = Math.max(1, parseInt(req.query.page, 10) || 1);

    try {
        const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM postulantes WHERE ${f.where}`, f.params);
        const pages = Math.max(1, Math.ceil(total / perPage));
        page = Math.min(page, pages);
        const [items] = await pool.query(
            `${SELECT} WHERE ${f.where} ORDER BY fecha_registro DESC, id DESC LIMIT ? OFFSET ?`,
            [...f.params, perPage, (page - 1) * perPage]
        );
        res.json({ items, total: Number(total), page, per_page: perPage, pages });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
module.exports.filtros = filtros;
