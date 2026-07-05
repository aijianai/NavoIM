
import mysql from 'mysql2/promise';
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'navoim',
  password: process.env.MYSQL_PASSWORD || 'navoim',
  database: process.env.MYSQL_DATABASE || 'navoim',
  waitForConnections: true,
  connectionLimit: 2,
  charset: 'utf8mb4',
});
const input = JSON.parse(process.argv[2] || '{}');
try {
  const [result] = await pool.query(input.sql, input.params || []);
  process.stdout.write(JSON.stringify({ ok: true, result }));
} catch (err) {
  process.stdout.write(JSON.stringify({ ok: false, error: err.message }));
}
await pool.end();
