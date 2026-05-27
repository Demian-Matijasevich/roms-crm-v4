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
const log = (...a) => console.log(...a);

async function main() {
  log("=== 10 registros sin lead_id ni client_id ===");
  const { data: huerfanos } = await sb
    .from("payments")
    .select("id, numero_cuota, monto_usd, fecha_pago, fecha_vencimiento, estado, receptor, created_at, comprobante_url")
    .is("lead_id", null)
    .is("client_id", null);
  console.table(huerfanos);

  log("\n=== Monto 0 pendiente (Moni) ===");
  const { data: ceros } = await sb
    .from("payments")
    .select("id, lead_id, numero_cuota, monto_usd, fecha_vencimiento, estado, leads(nombre)")
    .or("monto_usd.eq.0,monto_usd.is.null")
    .eq("estado", "pendiente");
  ceros.forEach((r) => log(JSON.stringify(r)));

  log("\n=== Detalle de Moni - todas sus cuotas ===");
  const moni = ceros.find((r) => r.leads?.nombre?.toLowerCase().includes("moni"));
  if (moni) {
    const { data: moniAll } = await sb
      .from("payments")
      .select("id, numero_cuota, monto_usd, fecha_vencimiento, fecha_pago, estado")
      .eq("lead_id", moni.lead_id)
      .order("numero_cuota");
    console.table(moniAll);
  }

  log("\n=== Detalle Fernanda Márquez (duplicado) ===");
  const { data: ferDup } = await sb
    .from("payments")
    .select("id, numero_cuota, monto_usd, fecha_vencimiento, fecha_pago, estado, created_at, receptor, comprobante_url, leads(nombre)")
    .eq("lead_id", "066ee384-fd50-45da-aa11-253595a8b752" ? null : null);

  const { data: fer } = await sb
    .from("payments")
    .select("id, numero_cuota, monto_usd, fecha_vencimiento, fecha_pago, estado, created_at, lead_id, leads(nombre)")
    .in("id", ["448fe506-755b-453f-8987-a08ca7d0ddf4", "066ee384-fd50-45da-aa11-253595a8b752"]);
  console.table(fer);
  if (fer?.[0]?.lead_id) {
    const { data: ferAll } = await sb
      .from("payments")
      .select("id, numero_cuota, monto_usd, fecha_vencimiento, fecha_pago, estado, created_at")
      .eq("lead_id", fer[0].lead_id)
      .order("created_at");
    log("Todas las cuotas de Fernanda Márquez:");
    console.table(ferAll);
  }

  log("\n=== Detalle Leonardo Garcia (duplicado) ===");
  const { data: leo } = await sb
    .from("payments")
    .select("id, numero_cuota, monto_usd, fecha_vencimiento, fecha_pago, estado, created_at, lead_id, leads(nombre)")
    .in("id", ["6ef4cbb7-7d9a-4fb1-bca6-de539d24a857", "16d1ad27-86b0-4dc1-8e06-345cd7c22288"]);
  console.table(leo);
  if (leo?.[0]?.lead_id) {
    const { data: leoAll } = await sb
      .from("payments")
      .select("id, numero_cuota, monto_usd, fecha_vencimiento, fecha_pago, estado, created_at")
      .eq("lead_id", leo[0].lead_id)
      .order("created_at");
    log("Todas las cuotas de Leonardo Garcia:");
    console.table(leoAll);
  }
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
