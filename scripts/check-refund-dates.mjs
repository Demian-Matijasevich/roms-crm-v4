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
const { data } = await sb
  .from("payments")
  .select("id, monto_usd, fecha_pago, created_at, descuento_comision_closer_usd, descuento_comision_setter_usd, lead:leads(nombre, programa_pitcheado)")
  .eq("estado", "refund")
  .order("fecha_pago", { ascending: false });
for (const r of data || []) {
  console.log(`${r.fecha_pago}  $${r.monto_usd}  ${r.lead?.nombre || "(s/n)"}  prog=${r.lead?.programa_pitcheado || "—"}  desc_closer=$${r.descuento_comision_closer_usd || 0}  desc_setter=$${r.descuento_comision_setter_usd || 0}  (created ${r.created_at?.slice(0,10)})`);
}
