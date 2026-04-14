import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await sb.from("gastos").select("*").limit(3);
  console.log("gastos sample:", JSON.stringify(data, null, 2));
  console.log("error:", error);

  const { data: types } = await sb.from("gasto_categorias").select("*").limit(20);
  console.log("\ngasto_categorias:", types);
}

main().catch(console.error);
