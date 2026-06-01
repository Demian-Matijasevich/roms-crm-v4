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

// Test settings table
const { data, error } = await sb.from("settings").select("*").limit(5);
console.log("settings error:", error?.message);
console.log("settings data:", data);

// Other possible names
for (const t of ["app_settings", "config", "kv_store"]) {
  const { error } = await sb.from(t).select("*").limit(1);
  console.log(`${t}: ${error ? error.message : "EXISTS"}`);
}

// Search for usd_rate setting (it must be stored somewhere)
const { data: rates } = await sb.from("usd_rates").select("*").limit(2);
console.log("usd_rates:", rates);
