const fs = require("fs");
const path = require("path");
const { getClient } = require("../db/neonDb");

async function runMigrations() {
  console.log("🚀 Running SQL migrations on Neon PostgreSQL...");
  let client;
  try {
    client = await getClient();
    const sqlPath = path.join(__dirname, "001_init_neon_schema.sql");
    const sql = fs.readFileSync(sqlPath, "utf-8");

    await client.query("BEGIN;");
    await client.query(sql);
    await client.query(fs.readFileSync(path.join(__dirname, "002_transcript_quality.sql"), "utf8"));
    await client.query("COMMIT;");

    console.log("✅ SQL migrations applied successfully.");
  } catch (err) {
    if (client) await client.query("ROLLBACK;");
    console.error("❌ SQL Migration failed:", err.message);
    throw err;
  } finally {
    if (client) client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigrations };
