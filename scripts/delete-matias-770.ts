import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data } = await sb.from("leads").select("id,sheets_row_index").ilike("nombre", "Matias Randazzo").eq("sheets_row_index", 770);
  if (!data?.length) { console.log("no lead"); return; }
  for (const l of data) {
    await sb.from("payments").delete().eq("lead_id", l.id);
    await sb.from("leads").delete().eq("id", l.id);
    console.log(`✓ deleted lead row 770 ${l.id}`);
  }
}
main().catch(console.error);
