// Local development database: a real PostgreSQL server run from node_modules,
// so no separate install is needed. Data is kept in web/.local-db between runs.
// Production uses Railway PostgreSQL instead; this script is never deployed.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(import.meta.dirname, "../.local-db");
const PORT = 54329;
const DB_NAME = "costdb";

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: true,
  onLog: () => {},
});

const firstRun = !existsSync(path.join(DATA_DIR, "PG_VERSION"));
if (firstRun) await pg.initialise();
await pg.start();

const client = pg.getPgClient();
await client.connect();
const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]);
if (rowCount === 0) await pg.createDatabase(DB_NAME);
await client.end();

console.log(`Local PostgreSQL running on port ${PORT} (database "${DB_NAME}"). Press Ctrl+C to stop.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
