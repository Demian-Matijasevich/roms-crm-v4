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
  // 1. Leads en estado broke_cancelado u otros sospechosos sin refund cargado
  hr();
  log("LEADS EN ESTADO broke_cancelado (¿debería haber refund?)");
  hr();
  const { data: brokes } = await sb
    .from("leads")
    .select("id, nombre, estado, ticket_total")
    .in("estado", ["broke_cancelado"])
    .order("created_at", { ascending: false });
  for (const l of brokes || []) {
    const { data: pagos } = await sb.from("payments").select("estado, monto_usd").eq("lead_id", l.id);
    const pagado = (pagos || []).filter((p) => p.estado === "pagado").reduce((s, p) => s + Number(p.monto_usd || 0), 0);
    const refund = (pagos || []).filter((p) => p.estado === "refund").reduce((s, p) => s + Number(p.monto_usd || 0), 0);
    const hint = pagado > 0 && refund === 0 ? "⚠️ FALTA REFUND?" : "";
    log(`${l.nombre}  ticket=${l.ticket_total}  pagado=$${pagado}  refund=$${refund}  ${hint}`);
  }

  // 2. Clientes en estado 'inactivo' o 'no_termino_pagar' — ¿tienen refund?
  hr();
  log("CLIENTES inactivo / no_termino_pagar — ¿tienen refunds?");
  hr();
  const { data: clientes } = await sb
    .from("clients")
    .select("id, nombre, estado, lead_id")
    .in("estado", ["inactivo", "no_termino_pagar"]);
  log(`Total clientes inactivos/no_termino: ${clientes?.length || 0}`);
  let conRefund = 0;
  for (const c of clientes || []) {
    const { data: pagos } = await sb
      .from("payments")
      .select("estado, monto_usd")
      .or(`lead_id.eq.${c.lead_id || "00000000-0000-0000-0000-000000000000"},client_id.eq.${c.id}`);
    const refund = (pagos || []).filter((p) => p.estado === "refund").reduce((s, p) => s + Number(p.monto_usd || 0), 0);
    if (refund > 0) {
      conRefund++;
      log(`✓ ${c.nombre} (estado=${c.estado}): refund $${refund}`);
    }
  }
  log(`\nCon refund cargado: ${conRefund}`);

  // 3. Refunds nombrados en notas/reporte pero no como payment
  hr();
  log("LEADS con palabra 'refund' o 'devolución' en reporte_general / notas_internas");
  hr();
  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, estado, reporte_general, notas_internas, ticket_total")
    .or(
      "reporte_general.ilike.%refund%,reporte_general.ilike.%devolu%,reporte_general.ilike.%reembolso%,notas_internas.ilike.%refund%,notas_internas.ilike.%devolu%,notas_internas.ilike.%reembolso%"
    );
  for (const l of leads || []) {
    const { data: pagos } = await sb.from("payments").select("estado, monto_usd").eq("lead_id", l.id);
    const refund = (pagos || []).filter((p) => p.estado === "refund").reduce((s, p) => s + Number(p.monto_usd || 0), 0);
    const pagado = (pagos || []).filter((p) => p.estado === "pagado").reduce((s, p) => s + Number(p.monto_usd || 0), 0);
    const tag = refund > 0 ? "✓ refund cargado" : pagado > 0 ? "⚠️ menciona refund pero NO está cargado como payment" : "—";
    const notaTxt = ((l.reporte_general || "") + " " + (l.notas_internas || "")).toLowerCase();
    const found = notaTxt.match(/(refund|devolu\S*|reembolso\S*)/i)?.[0] || "?";
    log(`${l.nombre} (${l.estado})  pagado=$${pagado}  refund=$${refund}  [palabra: "${found}"]  ${tag}`);
  }

  // 4. Distribución temporal de refunds para ver tendencia
  hr();
  log("Distribución temporal de refunds");
  hr();
  const { data: refsByMonth } = await sb
    .from("payments")
    .select("fecha_pago, monto_usd")
    .eq("estado", "refund")
    .order("fecha_pago");
  const byMonth = new Map();
  for (const r of refsByMonth || []) {
    const ym = (r.fecha_pago || "?").slice(0, 7);
    byMonth.set(ym, (byMonth.get(ym) || 0) + Number(r.monto_usd));
  }
  for (const [m, t] of byMonth.entries()) log(`${m}: $${t.toLocaleString()}`);

  // 5. Confirmar vista monthly_metrics resta el refund
  hr();
  log("Vista monthly_metrics — mayo 2026");
  hr();
  const { data: month } = await sb
    .from("monthly_metrics")
    .select("*")
    .order("mes", { ascending: false })
    .limit(3);
  console.table(month);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
