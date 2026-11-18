// Pool de conexiones a la misma base MySQL que usa el sistema PHP.
const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
    ...config.db,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    // Fechas como texto ('2026-11-18', '2026-11-18 14:00:00'), igual que PDO en PHP.
    // Evita corrimientos de zona horaria al convertir a Date.
    dateStrings: true,
});

module.exports = pool;
