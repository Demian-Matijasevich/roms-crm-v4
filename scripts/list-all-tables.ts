import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const candidates = ["settings", "config", "app_config", "meta", "system", "roms_config", "kv_store"];
  for (const t of candidates) {
    const { error } = await sb.from(t).select("*").limit(1);
    console.log(`${t}: ${error ? "❌ " + error.message : "✅ exists"}`);
  }
}
main().catch(console.error);
