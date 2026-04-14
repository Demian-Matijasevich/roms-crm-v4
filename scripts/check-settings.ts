import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: sample, error } = await sb.from("settings").select("*").limit(5);
  console.log("settings:", sample, "error:", error?.message);
}
main().catch(console.error);
