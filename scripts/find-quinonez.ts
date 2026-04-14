import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  for (const q of ["%quinonez%", "%quiñonez%", "%jorge ignacio%"]) {
    const { data } = await sb.from("leads").select("id,nombre,sheets_row_index,estado").ilike("nombre", q);
    console.log(`${q}:`, data);
  }
}
main().catch(console.error);
