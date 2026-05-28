import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envFile = readFileSync(".env.production.tmp", "utf8");
const env = Object.fromEntries(
  envFile
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const [k, ...v] = l.split("=");
      return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
    })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await sb.from("v_monthly_cash").select("*").order("mes_fiscal", { ascending: false }).limit(5);
console.log("v_monthly_cash error:", error);
console.log("v_monthly_cash data:", JSON.stringify(data, null, 2));
console.log("");
console.log("Verificación: cash_total debería ser pagados − refunds. Si refunds=1200 y mayo tiene un cash_total que NO descuenta los 1200, la view está mal.");
