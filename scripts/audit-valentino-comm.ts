import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const valeId = "1fa97581-745d-4097-bf2d-84a0650ccd63";

  // All payments in April where lead's closer_id = Valentino
  const { data: closerLeads } = await sb.from("leads").select("id, nombre").eq("closer_id", valeId).range(0, 4999);
  const closerLeadIds = (closerLeads || []).map((l) => l.id);
  const { data: pays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago")
    .eq("estado", "pagado")
    .gte("fecha_pago", "2026-04-01")
    .lte("fecha_pago", "2026-04-30")
    .in("lead_id", closerLeadIds)
    .range(0, 4999);
  const total = (pays || []).reduce((s, p) => s + p.monto_usd, 0);
  console.log(`Pagos abril donde Valentino es CLOSER: ${pays?.length} = $${total}`);
  console.log(`Comisión esperada (10%): $${Math.round(total * 0.10)}`);
  console.log(`Comisión reportada por view: $9400\n`);
  const leadById = Object.fromEntries((closerLeads || []).map((l) => [l.id, l.nombre]));
  for (const p of pays || []) console.log(`  ${leadById[p.lead_id!] || "?"} $${p.monto_usd} ${p.fecha_pago?.split("T")[0]}`);

  // Check April KPIs: total_agendas 357, presentadas 12, calificadas 69, cerradas 1
  const { data: aprilLeads } = await sb
    .from("leads")
    .select("id,nombre,estado,fecha_llamada,lead_calificado")
    .eq("closer_id", valeId)
    .gte("fecha_llamada", "2026-04-01")
    .lte("fecha_llamada", "2026-04-30")
    .range(0, 4999);
  console.log(`\nLeads con closer=Valentino y fecha_llamada en abril: ${aprilLeads?.length}`);
  const byEstado: Record<string, number> = {};
  for (const l of aprilLeads || []) byEstado[l.estado] = (byEstado[l.estado] || 0) + 1;
  console.log("Por estado:", byEstado);
  const presentadas = (aprilLeads || []).filter((l) => !["pendiente", "cancelada", "no_show"].includes(l.estado)).length;
  const calificadas = (aprilLeads || []).filter((l) => l.lead_calificado === "calificado").length;
  const cerradas = (aprilLeads || []).filter((l) => ["cerrado", "adentro_seguimiento"].includes(l.estado)).length;
  console.log(`presentadas:${presentadas} calificadas:${calificadas} cerradas:${cerradas}`);
}
main().catch(console.error);
