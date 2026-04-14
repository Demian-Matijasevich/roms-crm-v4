import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: pays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, numero_cuota, estado")
    .eq("estado", "pagado")
    .not("fecha_pago", "is", null)
    .range(0, 4999);
  const leadIds = [...new Set((pays || []).map((p) => p.lead_id).filter(Boolean))];
  const { data: leads } = await sb.from("leads").select("id, nombre, fecha_llamada, fecha_agendado, estado").in("id", leadIds);
  const leadMap = Object.fromEntries((leads || []).map((l) => [l.id, l]));

  const bad: { id: string; nombre: string; cuota: number; monto: number; fecha_pago: string; fecha_llamada: string; diff_days: number }[] = [];
  for (const p of pays || []) {
    const lead = p.lead_id ? leadMap[p.lead_id] : null;
    if (!lead?.fecha_llamada) continue;
    const pFecha = p.fecha_pago!.split("T")[0];
    const lFecha = lead.fecha_llamada.split("T")[0];
    if (pFecha < lFecha) {
      const diff = Math.floor((new Date(lFecha).getTime() - new Date(pFecha).getTime()) / 86400000);
      bad.push({ id: p.id, nombre: lead.nombre, cuota: p.numero_cuota, monto: p.monto_usd, fecha_pago: pFecha, fecha_llamada: lFecha, diff_days: diff });
    }
  }
  console.log(`Pagos con fecha_pago ANTERIOR a fecha_llamada: ${bad.length}`);
  bad.sort((a, b) => b.diff_days - a.diff_days);
  for (const b of bad) {
    console.log(`  ${b.nombre.padEnd(32)} | c${b.cuota} $${String(b.monto).padStart(6)} | pago:${b.fecha_pago} llamada:${b.fecha_llamada} (${b.diff_days}d antes)`);
  }
  console.log(`\nTotal $: ${bad.reduce((s, b) => s + b.monto, 0)}`);
}

main().catch(console.error);
