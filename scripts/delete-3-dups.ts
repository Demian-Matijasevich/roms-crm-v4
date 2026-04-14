import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Delete: Nazareno c2 $30k (keep c1), Sinziana c3 $3k (keep c1), IRENO c2 $250 24/02 (keep c1)
  const prefixes = ["950e0eb8", "c25769d4", "3481e0fa"];
  for (const prefix of prefixes) {
    const { data: all } = await sb.from("payments").select("id").range(0, 4999);
    const match = (all || []).find((p) => p.id.startsWith(prefix));
    if (match) {
      const { error } = await sb.from("payments").delete().eq("id", match.id);
      console.log(match.id, error ? "err: " + error.message : "deleted");
    } else console.log(prefix, "not found");
  }
}
main().catch(console.error);
