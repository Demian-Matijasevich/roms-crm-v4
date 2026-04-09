/**
 * Combine SQL migrations into a single file for Supabase SQL Editor.
 * Usage: npx tsx scripts/run-migrations.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

async function main() {
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`\nFound ${files.length} migration files\n`);

  // Since we can't run DDL via REST API easily, we'll output instructions
  // and also try the direct approach

  let allSQL = "";
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    allSQL += `-- ========== ${file} ==========\n${sql}\n\n`;
    console.log(`  📄 ${file} (${sql.split("\n").length} lines)`);
  }

  // Write combined SQL for manual paste
  const outPath = join(process.cwd(), "supabase", "combined-migration.sql");
  writeFileSync(outPath, allSQL);
  console.log(`\n📋 Combined SQL written to: supabase/combined-migration.sql`);
  console.log(`\n👉 Go to Supabase Dashboard → SQL Editor → paste the contents and click Run.\n`);
  console.log(`   URL: ${SUPABASE_URL.replace('.supabase.co', '')}/dashboard/project/sql/new\n`);
}

main().catch(console.error);
