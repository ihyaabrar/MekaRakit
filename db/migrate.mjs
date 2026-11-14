// Applies db/schema.sql to the Neon database. Run: npm run db:migrate (reads .env.local).
// Statements are idempotent (create ... if not exists), so re-running is safe.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_DATABASE_URL missing: run `vercel env pull .env.local` first");

const sql = neon(url);
const statements = readFileSync(new URL("./schema.sql", import.meta.url), "utf8")
  .split(/;\s*$/m)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

for (const s of statements) await sql.query(s);
const tables = await sql.query("select table_name from information_schema.tables where table_schema = 'public' order by 1");
console.log("public tables:", tables.map((t) => t.table_name).join(", "));
