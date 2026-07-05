import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "navoim",
  password: process.env.MYSQL_PASSWORD || "navoim",
  database: process.env.MYSQL_DATABASE || "navoim",
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
});

process.stdin.setEncoding("utf-8");
let buffer = "";

process.stdin.on("data", async (chunk: string) => {
  buffer += chunk;
  let newlineIdx: number;
  while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      const [result] = await pool.query(msg.sql, msg.params || []);
      process.stdout.write(JSON.stringify({ id: msg.id, result }) + "\n");
    } catch (err: any) {
      const msg = JSON.parse(line);
      process.stdout.write(JSON.stringify({ id: msg.id, result: null, error: err.message || String(err) }) + "\n");
    }
  }
});

process.stdin.on("end", async () => {
  await pool.end();
  process.exit(0);
});
