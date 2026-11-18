# TDV SRL — versión Node

Migración del sistema de presencias y administración de personal (`tdv_presencias_v2`, PHP) a Node.js.
Usa **la misma base MySQL** que el sistema PHP; se migra módulo por módulo y los dos pueden convivir.

## Estado de la migración

| Módulo | Estado |
|---|---|
| Conexión a la base | ✅ |
| Login / logout / sesión | ✅ |
| Menú del backoffice (según rol) | ✅ |
| Postulantes: listado, filtros, paginación, detalle | ✅ |
| Postulantes: eliminar, mails, exportar Excel | ⏳ |
| Dashboard vigilador (marcar entrada/salida) | ⏳ |
| Supervisor | ⏳ |
| Resto del backoffice (entrevistas, legajos, liquidación…) | ⏳ |
| Registro de cuentas | ⏳ |

Las secciones no migradas muestran una página provisoria (con el menú y el permiso de rol correspondiente).
En el menú, las secciones pendientes llevan un punto `·` al lado del nombre.

## Requisitos

- Node.js 18 o superior
- MySQL / MariaDB (la base del sistema actual)

## Puesta en marcha

```bash
npm install
cp .env.example .env   # completar DB_* y SESSION_SECRET
npm start              # o: npm run dev (se reinicia al guardar)
```

Abrir `http://localhost:3000`. Con `GET /api/health` se verifica la conexión a la base.

### En el hosting (cPanel → Setup Node.js App)

1. **Application root**: carpeta donde está este repo.
2. **Application startup file**: `app.js`.
3. Cargar las variables de `.env.example` en el panel (o crear `.env` en el servidor).
   `SESSION_SECRET` aleatorio de 48+ caracteres:
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
4. **Run NPM Install** y reiniciar la app.

La primera vez que arranca crea la tabla `sessions` en la base (no toca ninguna otra).

## Autenticación

- **Claves**: se validan con `bcryptjs`, compatible con los hashes `$2y$` que genera `password_hash()` de PHP.
  Los usuarios entran con la misma clave en los dos sistemas. (No usar el paquete nativo `bcrypt`: rechaza `$2y$`.)
- **Mismas reglas que `api/login.php`**: cuenta pendiente, desactivada, tipo inválido o vigilador sin objetivo → no entra.
- **Sesiones en MySQL** (`express-session` + `express-mysql-session`): sobreviven a reinicios de la app.
  En la sesión solo se guarda el `id_empleado`; el usuario se relee en cada pedido, así una baja o
  cambio de rol se aplica en el momento.
- Duración por inactividad según rol: `SESSION_HORAS_VIGILADOR`, `SESSION_HORAS_SUPERVISOR`, `SESSION_HORAS_BACKOFFICE`.
- Cookie `httpOnly`, `SameSite=Lax`, `secure` en producción; id de sesión nuevo al loguear;
  límite de 20 intentos fallidos cada 15 minutos por IP.

Roles (`empleados.tipo`): 1 vigilador, 2 supervisor, 3 oficinista, 4 administrador.

## Tests

```bash
npm test
```

Corren contra la base configurada en `.env`: crean usuarios `@test.tdv` y los borran al terminar.
**Usar una base de prueba, no la de producción.**

## Estructura

```
app.js                  arranque (startup file del hosting)
src/config.js           variables de entorno
src/db.js               pool MySQL
src/session.js          sesiones en MySQL
src/usuarios.js         roles, reglas de acceso y consultas de empleados
src/middleware/auth.js  carga del usuario y requireLogin / requireBackoffice / requireAdmin / requireSupervisor
src/routes/auth.js      POST /api/login, POST|GET /api/logout, GET /api/me
src/routes/postulantes.js  GET /api/postulantes (filtros + paginación)
src/vistas.js           menú lateral del backoffice y armado de páginas de views/
views/admin/            páginas del backoffice (requieren sesión; no se sirven directo)
public/                 páginas y archivos públicos (login, css, js)
test/                   tests
```
