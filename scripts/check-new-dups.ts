import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: pays } = await sb.from("payments").select("id,lead_id,monto_usd,fecha_pago,numero_cuota,estado,receptor").eq("estado","pagado").range(0,4999);
  const groups: Record<string, typeof pays> = {};
  for (const p of pays || []) {
    const k = `${p.lead_id || "null"}|${Math.round(p.monto_usd)}|${p.fecha_pago?.split("T")[0] || "—"}`;
    (groups[k] ||= []).push(p);
  }
  const leadIds = [...new Set((pays || []).map(p => p.lead_id).filter(Boolean))];
  const { data: leads } = await sb.from("leads").select("id,nombre").in("id", leadIds);
  const leadMap = Object.fromEntries((leads || []).map(l => [l.id, l.nombre]));
  for (const [k, g] of Object.entries(groups)) {
    if (g.length > 1) {
      const name = g[0].lead_id ? leadMap[g[0].lead_id] : "NO LEAD";
      console.log(`${name} | $${g[0].monto_usd} | ${g[0].fecha_pago?.split("T")[0]} | cuentas:${g.length}`);
      for (const p of g) console.log(`   id:${p.id.substring(0,8)} c${p.numero_cuota} ${p.receptor || "—"}`);
    }
  }
}
main().catch(console.error);
