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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const today = "2026-05-27";
const fiscalStart = "2026-05-01";
const fiscalEnd = "2026-05-31";

const log = (...a) => console.log(...a);
const hr = () => log("─".repeat(70));

async function main() {
  log("AUDITORÍA DE CUOTAS — payments");
  hr();

  const { count: total } = await sb.from("payments").select("*", { count: "exact", head: true });
  log("Total registros en payments:", total);

  const { data: byEstado } = await sb.rpc("execute_sql", {}).select().limit(0).maybeSingle().then(() => ({ data: null })).catch(() => ({ data: null }));

  const estados = ["pendiente", "pagado", "vencido", "refund", "cancelado"];
  log("\nPor estado:");
  for (const e of estados) {
    const { count } = await sb.from("payments").select("*", { count: "exact", head: true }).eq("estado", e);
    if (count > 0) log(`  ${e.padEnd(12)} ${count}`);
  }

  hr();
  log("INTEGRIDAD");
  hr();

  const { count: sinFecha } = await sb
    .from("payments")
    .select("*", { count: "exact", head: true })
    .is("fecha_vencimiento", null)
    .eq("estado", "pendiente");
  log(`Pendientes sin fecha_vencimiento: ${sinFecha}`);

  const { count: sinLeadCliente } = await sb
    .from("payments")
    .select("*", { count: "exact", head: true })
    .is("lead_id", null)
    .is("client_id", null);
  log(`Sin lead_id NI client_id: ${sinLeadCliente}`);

  const { count: montoCero } = await sb
    .from("payments")
    .select("*", { count: "exact", head: true })
    .or("monto_usd.eq.0,monto_usd.is.null")
    .eq("estado", "pendiente");
  log(`Pendientes con monto_usd=0 o null: ${montoCero}`);

  const { count: montoNeg } = await sb
    .from("payments")
    .select("*", { count: "exact", head: true })
    .lt("monto_usd", 0)
    .neq("estado", "refund");
  log(`Monto negativo NO refund: ${montoNeg}`);

  hr();
  log("CUOTAS DEL MES VIGENTE (2026-05)");
  hr();

  const { data: mesVigente } = await sb
    .from("payments")
    .select("id, lead_id, client_id, numero_cuota, monto_usd, fecha_vencimiento, estado, leads(nombre)")
    .gte("fecha_vencimiento", fiscalStart)
    .lte("fecha_vencimiento", fiscalEnd)
    .eq("estado", "pendiente")
    .order("fecha_vencimiento");
  const totalMes = (mesVigente || []).reduce((s, r) => s + Number(r.monto_usd || 0), 0);
  log(`Pendientes ${fiscalStart} → ${fiscalEnd}: ${mesVigente?.length || 0} cuotas, total $${totalMes.toLocaleString()}`);
  (mesVigente || []).forEach((r) => {
    const nombre = r.leads?.nombre || "(sin nombre)";
    log(`  ${r.fecha_vencimiento}  c${r.numero_cuota}  $${Number(r.monto_usd).toLocaleString().padStart(8)}  ${nombre}`);
  });

  hr();
  log("ATRASADAS (fecha < " + fiscalStart + ")");
  hr();

  const { data: atrasadas } = await sb
    .from("payments")
    .select("id, lead_id, numero_cuota, monto_usd, fecha_vencimiento, estado, leads(nombre)")
    .lt("fecha_vencimiento", fiscalStart)
    .eq("estado", "pendiente")
    .order("fecha_vencimiento");
  const totalAtras = (atrasadas || []).reduce((s, r) => s + Number(r.monto_usd || 0), 0);
  log(`Atrasadas: ${atrasadas?.length || 0} cuotas, total $${totalAtras.toLocaleString()}`);
  (atrasadas || []).slice(0, 30).forEach((r) => {
    const nombre = r.leads?.nombre || "(sin nombre)";
    log(`  ${r.fecha_vencimiento}  c${r.numero_cuota}  $${Number(r.monto_usd).toLocaleString().padStart(8)}  ${nombre}`);
  });
  if ((atrasadas?.length || 0) > 30) log(`  … +${atrasadas.length - 30} más`);

  hr();
  log("FUTUROS MESES (> " + fiscalEnd + ")");
  hr();

  const { data: futuros } = await sb
    .from("payments")
    .select("id, lead_id, numero_cuota, monto_usd, fecha_vencimiento, leads(nombre)")
    .gt("fecha_vencimiento", fiscalEnd)
    .eq("estado", "pendiente")
    .order("fecha_vencimiento");

  const porMes = new Map();
  (futuros || []).forEach((r) => {
    const ym = r.fecha_vencimiento.slice(0, 7);
    if (!porMes.has(ym)) porMes.set(ym, { count: 0, total: 0, items: [] });
    const m = porMes.get(ym);
    m.count++;
    m.total += Number(r.monto_usd || 0);
    m.items.push(r);
  });
  [...porMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([ym, info]) => {
      log(`  ${ym}: ${info.count} cuotas, $${info.total.toLocaleString()}`);
      info.items.forEach((r) => {
        const nombre = r.leads?.nombre || "(sin nombre)";
        log(`     ${r.fecha_vencimiento}  c${r.numero_cuota}  $${Number(r.monto_usd).toLocaleString().padStart(8)}  ${nombre}`);
      });
    });

  hr();
  log("DUPLICADOS POTENCIALES (mismo lead + numero_cuota)");
  hr();

  const { data: allPend } = await sb
    .from("payments")
    .select("id, lead_id, numero_cuota, monto_usd, fecha_vencimiento, leads(nombre)")
    .eq("estado", "pendiente")
    .not("lead_id", "is", null);
  const keyMap = new Map();
  (allPend || []).forEach((r) => {
    const k = `${r.lead_id}::${r.numero_cuota}`;
    if (!keyMap.has(k)) keyMap.set(k, []);
    keyMap.get(k).push(r);
  });
  let dupCount = 0;
  for (const [k, arr] of keyMap) {
    if (arr.length > 1) {
      dupCount++;
      const nombre = arr[0].leads?.nombre || "(sin nombre)";
      log(`  ${nombre} c${arr[0].numero_cuota}: ${arr.length} registros`);
      arr.forEach((r) => log(`     ${r.id}  ${r.fecha_vencimiento}  $${r.monto_usd}`));
    }
  }
  if (!dupCount) log("  (ninguno)");

  hr();
  log("CUOTAS SIN FECHA — pendientes huérfanas");
  hr();

  const { data: huerfanas } = await sb
    .from("payments")
    .select("id, lead_id, numero_cuota, monto_usd, leads(nombre)")
    .is("fecha_vencimiento", null)
    .eq("estado", "pendiente")
    .limit(30);
  (huerfanas || []).forEach((r) => {
    const nombre = r.leads?.nombre || "(sin nombre)";
    log(`  ${r.id}  c${r.numero_cuota}  $${r.monto_usd}  ${nombre}`);
  });
  if (!huerfanas?.length) log("  (ninguna)");

  hr();
  log("RECONCILIACIÓN");
  hr();
  log(`Atrasadas:       $${totalAtras.toLocaleString().padStart(10)}`);
  log(`Mes vigente:     $${totalMes.toLocaleString().padStart(10)}`);
  const totalFuturos = [...porMes.values()].reduce((s, m) => s + m.total, 0);
  log(`Futuros:         $${totalFuturos.toLocaleString().padStart(10)}`);
  log(`────────────────────────────`);
  log(`TOTAL pendiente: $${(totalAtras + totalMes + totalFuturos).toLocaleString().padStart(10)}`);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
