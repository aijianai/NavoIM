import { parentPort, workerData } from "node:worker_threads";
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

const sab: SharedArrayBuffer = workerData.sab;
const flag = new Int32Array(sab, 0, 1);
const QUERY_BUF_SIZE = 64 * 1024;
const RESULT_BUF_SIZE = 512 * 1024;
const queryBuf = new Uint8Array(sab, 4, QUERY_BUF_SIZE);
const resultBuf = new Uint8Array(sab, 4 + QUERY_BUF_SIZE, RESULT_BUF_SIZE);

const decoder = new TextDecoder();
const encoder = new TextEncoder();

async function processQuery() {
  // Read query from shared buffer
  const queryJson = decoder.decode(queryBuf);
  const { sql, params } = JSON.parse(queryJson);

  try {
    const [result] = await pool.query(sql, params || []);
    const resultJson = JSON.stringify({ result });
    const encoded = encoder.encode(resultJson);
    if (encoded.length > RESULT_BUF_SIZE) throw new Error("Result too large");
    resultBuf.set(encoded);
    // Signal main thread: result is ready (set flag to 2)
    Atomics.store(flag, 0, 2);
    Atomics.notify(flag, 0);
  } catch (err: any) {
    const resultJson = JSON.stringify({ result: null, error: err.message || String(err) });
    const encoded = encoder.encode(resultJson);
    resultBuf.set(encoded);
    Atomics.store(flag, 0, 2);
    Atomics.notify(flag, 0);
  }
}

// Worker event loop: wait for query signal, process, repeat
function waitAndProcess() {
  // Wait for flag=1 (query ready) or wake on exit
  const result = Atomics.waitAsync(flag, 0, 1);
  if (result.async) {
    result.value.then(() => {
      if (Atomics.load(flag, 0) === 1) {
        processQuery().then(waitAndProcess);
      } else {
        waitAndProcess();
      }
    });
  } else {
    // Synchronous result already available
    if (Atomics.load(flag, 0) === 1) {
      processQuery().then(waitAndProcess);
    } else {
      waitAndProcess();
    }
  }
}

waitAndProcess();
