import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex < 1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(".env"));
loadEnvFile(resolve(".env.local"));

const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
const migrationPath = resolve("supabase/migrations/20260430000000_initial_schema.sql");

if (!databaseUrl) {
  console.error("Missing SUPABASE_DB_URL or DATABASE_URL. Use a Supabase Postgres connection string.");
  process.exit(1);
}

const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", migrationPath], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
