const { Pool } = require("pg");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

let pool = null;

function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return null;
  }

  if (!pool) {
    const isLocalhost = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
    
    pool = new Pool({
      connectionString,
      ...(process.env.NODE_ENV === 'development' && !isLocalhost
        ? { stream: require('./developmentDns').createDevelopmentSocket } : {}),
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      max: parseInt(process.env.PG_MAX_CONNECTIONS || "25", 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on("error", (err) => {
      console.error("⚠️ Unexpected Neon PostgreSQL client error:", err.message);
    });
  }

  return pool;
}

async function query(text, params) {
  const p = getPool();
  if (!p) {
    throw new Error("DATABASE_URL is not set in environment.");
  }
  return p.query(text, params);
}

async function getClient() {
  const p = getPool();
  if (!p) {
    throw new Error("DATABASE_URL is not set in environment.");
  }
  return p.connect();
}

async function checkConnection() {
  try {
    const p = getPool();
    if (!p) return false;
    const res = await p.query("SELECT NOW() as current_time");
    return !!res.rows[0]?.current_time;
  } catch (err) {
    console.warn("⚠️ Neon connection check failed:", err.message);
    return false;
  }
}

module.exports = {
  getPool,
  query,
  getClient,
  checkConnection,
};
