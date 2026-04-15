import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const valeId = "1fa97581-745d-4097-bf2d-84a0650ccd63";

  // Leads of Valen in April (by fecha_llamada)
  const { data: aprilLlamada } = await sb
    .from("leads")
    .select("nombre,estado,fecha_llamada,fecha_agendado,ticket_total")
    .eq("closer_id", valeId)
    .gte("fecha_llamada", "2026-04-01")
    .lte("fecha_llamada", "2026-04-30")
    .in("estado", ["cerrado", "adentro_seguimiento"])
    .range(0, 4999);
  console.log(`\n1) Leads Valen con fecha_llamada en abril Y estado cerrado/adentro_seguimiento: ${aprilLlamada?.length}`);
  for (const l of aprilLlamada || []) console.log(`  ${l.nombre} | ${l.estado} | llamada:${l.fecha_llamada?.split("T")[0]}`);

  // Leads of Valen in April (by fecha_agendado)
  const { data: aprilAgenda } = await sb
    .from("leads")
    .select("nombre,estado,fecha_llamada,fecha_agendado")
    .eq("closer_id", valeId)
    .gte("fecha_agendado", "2026-04-01")
    .lte("fecha_agendado", "2026-04-30")
    .in("estado", ["cerrado", "adentro_seguimiento"])
    .range(0, 4999);
  console.log(`\n2) Leads Valen con fecha_agendado en abril Y estado cerrado/adentro_seg: ${aprilAgenda?.length}`);
  for (const l of aprilAgenda || []) console.log(`  ${l.nombre} | ${l.estado} | agenda:${l.fecha_agendado?.split("T")[0]} llamada:${l.fecha_llamada?.split("T")[0]}`);

  // All "cerradas" of Valen across all time
  const { data: all } = await sb
    .from("leads")
    .select("nombre,estado,fecha_llamada,fecha_agendado")
    .eq("closer_id", valeId)
    .in("estado", ["cerrado", "adentro_seguimiento"])
    .range(0, 4999);
  console.log(`\n3) Todas las cerradas de Valen (cualquier mes): ${all?.length}`);
  const byMonth: Record<string, number> = {};
  for (const l of all || []) {
    const m = l.fecha_llamada?.substring(0, 7) || "sin-fecha";
    byMonth[m] = (byMonth[m] || 0) + 1;
  }
  console.log("  Por mes (fecha_llamada):", byMonth);

  // Also check "seguimiento" state in abril (different from adentro_seguimiento)
  const { data: seg } = await sb
    .from("leads")
    .select("nombre,estado,fecha_llamada")
    .eq("closer_id", valeId)
    .eq("estado", "seguimiento")
    .gte("fecha_llamada", "2026-04-01")
    .lte("fecha_llamada", "2026-04-30");
  console.log(`\n4) Leads Valen en abril con estado "seguimiento" (NO adentro_seguimiento): ${seg?.length}`);
  for (const l of seg || []) console.log(`  ${l.nombre}`);
}
main().catch(console.error);
