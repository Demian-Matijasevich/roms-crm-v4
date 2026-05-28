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
const hr = () => log("─".repeat(70));

async function main() {
  log("=== AUDITORÍA REFUNDS ===");
  hr();

  // 1. Todos los refunds
  const { data: refunds, error } = await sb
    .from("payments")
    .select(
      "id, lead_id, client_id, numero_cuota, monto_usd, monto_ars, fecha_pago, fecha_vencimiento, estado, metodo_pago, receptor, cobrador_id, created_at, leads(nombre, ticket_total, plan_pago), clients(nombre)"
    )
    .eq("estado", "refund")
    .order("fecha_pago", { ascending: false });

  if (error) {
    log("ERROR:", error.message);
    return;
  }

  log(`Total refunds: ${refunds.length}`);
  log("");
  for (const r of refunds) {
    const nombre = r.leads?.nombre || r.clients?.nombre || "(s/n)";
    const ticket = r.leads?.ticket_total ?? "—";
    log(`• ${nombre}`);
    log(`    fecha_pago: ${r.fecha_pago || "—"}   numero_cuota: ${r.numero_cuota}`);
    log(`    monto_usd: $${r.monto_usd}   monto_ars: $${r.monto_ars}`);
    log(`    ticket_total: ${ticket}   plan_pago: ${r.leads?.plan_pago || "—"}`);
    log(`    metodo: ${r.metodo_pago || "—"}   receptor: ${r.receptor || "—"}`);
    log(`    cobrador_id: ${r.cobrador_id || "—"}`);
    log(`    created_at: ${r.created_at}`);
    log("");

    // Ver el contexto completo del lead: todos sus pagos
    if (r.lead_id) {
      const { data: pagosLead } = await sb
        .from("payments")
        .select("numero_cuota, monto_usd, fecha_pago, fecha_vencimiento, estado, created_at")
        .eq("lead_id", r.lead_id)
        .order("created_at", { ascending: true });
      log("    Historial completo de pagos del lead:");
      console.table(pagosLead);
      log("");
    }
  }

  hr();
  log("RECONCILIACIÓN — efecto del refund en métricas");
  hr();

  const sumRefunds = refunds.reduce((s, r) => s + Number(r.monto_usd || 0), 0);
  log(`Total refundeado (USD): $${sumRefunds.toLocaleString()}`);
  log(`Total refundeado (ARS): $${refunds.reduce((s, r) => s + Number(r.monto_ars || 0), 0).toLocaleString()}`);

  // ¿Está siendo tomado por la vista monthly_metrics?
  hr();
  log("DETECCIÓN DE PROBLEMAS POTENCIALES");
  hr();

  // 1. Refunds con monto POSITIVO (vs negativo)
  const positivos = refunds.filter((r) => Number(r.monto_usd) > 0);
  const negativos = refunds.filter((r) => Number(r.monto_usd) < 0);
  const ceros = refunds.filter((r) => Number(r.monto_usd) === 0);
  log(`Refunds con monto POSITIVO: ${positivos.length}  (esperado — la view los resta)`);
  log(`Refunds con monto NEGATIVO: ${negativos.length}  (alarma — doble resta)`);
  log(`Refunds con monto CERO: ${ceros.length}`);

  // 2. Refund sin fecha_pago
  const sinFecha = refunds.filter((r) => !r.fecha_pago);
  log(`Refunds sin fecha_pago: ${sinFecha.length}  (no aparecen en cash mensual)`);

  // 3. Refund sin lead_id ni client_id
  const sinDueno = refunds.filter((r) => !r.lead_id && !r.client_id);
  log(`Refunds huérfanos (sin lead_id ni client_id): ${sinDueno.length}`);

  // 4. Refund con metodo_pago null
  const sinMetodo = refunds.filter((r) => !r.metodo_pago);
  log(`Refunds sin método de pago: ${sinMetodo.length}`);

  // 5. Refund con receptor null
  const sinReceptor = refunds.filter((r) => !r.receptor);
  log(`Refunds sin receptor: ${sinReceptor.length}`);

  // 6. ¿Hay leads con TODOS sus pagos refundeados pero estado del lead sigue cerrado?
  hr();
  log("LEADS CON REFUND — ¿estado del lead actualizado?");
  hr();
  const leadIds = [...new Set(refunds.map((r) => r.lead_id).filter(Boolean))];
  for (const lid of leadIds) {
    const { data: leadRow } = await sb
      .from("leads")
      .select("id, nombre, estado, ticket_total")
      .eq("id", lid)
      .maybeSingle();
    const { data: pagos } = await sb
      .from("payments")
      .select("monto_usd, estado")
      .eq("lead_id", lid);
    const pagado = pagos.filter((p) => p.estado === "pagado").reduce((s, p) => s + Number(p.monto_usd || 0), 0);
    const refundeado = pagos.filter((p) => p.estado === "refund").reduce((s, p) => s + Number(p.monto_usd || 0), 0);
    const neto = pagado - refundeado;
    log(`${leadRow?.nombre}  estado=${leadRow?.estado}  ticket=${leadRow?.ticket_total}  pagado=$${pagado}  refund=$${refundeado}  neto=$${neto}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
