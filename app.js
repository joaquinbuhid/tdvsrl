// Punto de entrada. En el hosting (cPanel "Setup Node.js App" / Passenger)
// configurar "Application startup file" = app.js.
require('dotenv').config({ quiet: true });

// Misma zona horaria que el sistema PHP (date_default_timezone_set).
process.env.TZ = process.env.TZ || 'America/Argentina/Buenos_Aires';

const { crearApp } = require('./src/server');
const config = require('./src/config');

const app = crearApp();
app.listen(config.port, () => {
    console.log(`TDV escuchando en el puerto ${config.port} (${config.entorno})`);
});
