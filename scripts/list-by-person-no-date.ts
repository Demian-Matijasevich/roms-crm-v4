import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: pays } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, numero_cuota")
    .eq("estado", "pagado")
    .is("fecha_pago", null)
    .range(0, 4999);

  const leadIds = [...new Set((pays || []).map((p) => p.lead_id).filter(Boolean))];
  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, estado, fecha_llamada, sheets_row_index, ticket_total")
    .in("id", leadIds);
  const leadMap = Object.fromEntries((leads || []).map((l) => [l.id, l]));

  // Also fetch ALL payments for these leads to give full context
  const { data: allPays } = await sb
    .from("payments")
    .select("lead_id, monto_usd, numero_cuota, fecha_pago, estado")
    .in("lead_id", leadIds)
    .order("numero_cuota");

  // Group by lead
  const byLead: Record<string, typeof pays> = {};
  for (const p of pays || []) {
    if (!p.lead_id) continue;
    (byLead[p.lead_id] ||= []).push(p);
  }

  const sorted = Object.entries(byLead).sort(([a], [b]) => {
    const na = leadMap[a]?.nombre || "";
    const nb = leadMap[b]?.nombre || "";
    return na.localeCompare(nb);
  });

  for (const [leadId, leadPays] of sorted) {
    const lead = leadMap[leadId];
    if (!lead) continue;
    const all = (allPays || []).filter((p) => p.lead_id === leadId);
    console.log(`\n── ${lead.nombre} ──  row:${lead.sheets_row_index || "—"} | estado:${lead.estado} | llamada:${lead.fecha_llamada?.split("T")[0] || "—"} | ticket:$${lead.ticket_total || 0}`);
    console.log(`   TODOS los pagos del lead:`);
    for (const p of all.sort((a, b) => a.numero_cuota - b.numero_cuota)) {
      const mark = !p.fecha_pago ? " ⚠ SIN FECHA" : "";
      console.log(`     cuota ${p.numero_cuota}: $${String(p.monto_usd).padStart(7)} | ${p.estado} | ${p.fecha_pago?.split("T")[0] || "—"}${mark}`);
    }
  }

  console.log(`\n\n${Object.keys(byLead).length} personas · ${pays?.length} pagos sin fecha · $${(pays || []).reduce((s, p) => s + p.monto_usd, 0)}`);
}

main().catch(console.error);
