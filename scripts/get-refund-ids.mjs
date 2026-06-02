import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const envFile = readFileSync(".env.production.tmp", "utf8");
const env = Object.fromEntries(
  envFile.split("\n").filter((l) => l.includes("=")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const start = process.argv[2];
const end = process.argv[3];
const { data } = await sb
  .from("payments")
  .select("id, lead:leads(nombre)")
  .eq("estado", "refund")
  .gte("fecha_pago", start)
  .lte("fecha_pago", end);
console.log((data || []).map((d) => d.id).join(","));
