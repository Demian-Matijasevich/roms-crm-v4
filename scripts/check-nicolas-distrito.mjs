import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const e = Object.fromEntries(
  readFileSync(".env.production.tmp", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
  })
);
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: leads } = await sb.from("leads").select("*").ilike("nombre", "%distrito%");
console.log(`Leads encontrados: ${leads?.length || 0}\n`);

for (const l of leads || []) {
  console.log(`═══ ${l.nombre} (id=${l.id.slice(0,8)}) ═══`);
  console.log(`  nicho: ${l.nicho}`);
  console.log(`  estado: ${l.estado}`);
  console.log(`  closer_id: ${l.closer_id}`);
  console.log(`  setter_id: ${l.setter_id}`);
  console.log(`  fuente: ${l.fuente}`);
  console.log(`  ticket_total: $${l.ticket_total}`);
  console.log(`  programa_pitcheado: ${l.programa_pitcheado}`);
  console.log(`  created_at: ${l.created_at}`);
  console.log(`  updated_at: ${l.updated_at}`);
  console.log(`  fecha_agenda: ${l.fecha_agenda}`);
  console.log(`  fecha_llamada: ${l.fecha_llamada}`);

  // Payments
  const { data: pays } = await sb.from("payments").select("*").eq("lead_id", l.id).order("numero_cuota");
  console.log(`\n  Payments (${pays?.length || 0}):`);
  for (const p of pays || []) {
    console.log(`    c#${p.numero_cuota} $${p.monto_usd} ${p.estado}`);
    console.log(`       fecha_pago=${p.fecha_pago || "—"} venc=${p.fecha_vencimiento || "—"}`);
    console.log(`       receptor=${p.receptor || "—"} verificado=${p.verificado}`);
    console.log(`       created_at=${p.created_at} updated_at=${p.updated_at}`);
  }
  console.log("");
}

// También buscar en activity_log si existe
try {
  const { data: logs } = await sb.from("activity_log").select("*").or(leads.map(l => `lead_id.eq.${l.id}`).join(",")).order("created_at", { ascending: false }).limit(20);
  if (logs && logs.length > 0) {
    console.log("\n═══ Activity Log ═══");
    for (const log of logs) {
      console.log(`  [${log.created_at}] ${log.action} | user=${log.user_email || log.user_id} | ${JSON.stringify(log.details || {}).slice(0, 100)}`);
    }
  }
} catch (err) {
  console.log("(no activity_log table)");
}
