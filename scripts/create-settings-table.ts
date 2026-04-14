import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Create settings table via RPC (raw SQL)
  const sql = `
    create table if not exists public.settings (
      key text primary key,
      value text,
      updated_at timestamptz default now()
    );
    insert into public.settings (key, value) values ('usd_ars_rate', '1250') on conflict (key) do nothing;
  `;
  const { data, error } = await sb.rpc("exec_sql" as any, { sql });
  console.log("result:", data, error?.message);

  // If RPC not available, try direct insert (the table must exist)
  const { data: check, error: err2 } = await sb.from("settings").select("*");
  console.log("check:", check, err2?.message);
}
main().catch(console.error);
