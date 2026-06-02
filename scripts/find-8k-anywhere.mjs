import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const e = Object.fromEntries(
  readFileSync(".env.production.tmp","utf8").split("\n").filter(l=>l.includes("="))
    .map(l=>{const[k,...v]=l.split("=");return[k.trim(),v.join("=").trim().replace(/^"/,"").replace(/"$/,"").replace(/\\n$/,"")];})
);
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Stats generales de pagos
const { data: lastDay } = await sb.from("payments")
  .select("id, monto_usd, estado, fecha_pago, created_at, cobrador_id, receptor, lead:leads(nombre, nicho)")
  .gte("created_at", new Date(Date.now() - 5 * 86400000).toISOString())
  .order("created_at", { ascending: false });

console.log(`Total pagos cargados últimos 5 días: ${lastDay?.length || 0}`);
console.log("");

let sinCobrador = 0;
let conCobrador = 0;
const porCobrador = {};
const porNicho = {};

for (const p of lastDay || []) {
  if (p.cobrador_id) conCobrador++;
  else sinCobrador++;
  const ln = Array.isArray(p.lead) ? p.lead[0] : p.lead;
  const nicho = ln?.nicho || 'sin_lead';
  porNicho[nicho] = (porNicho[nicho] || 0) + 1;
}
console.log(`Con cobrador_id: ${conCobrador}, sin cobrador_id: ${sinCobrador}`);
console.log("Por nicho:", porNicho);

// Pagos políticos
const { data: politica } = await sb.from("payments")
  .select("id, monto_usd, estado, fecha_pago, created_at, receptor, lead:leads!inner(nombre, nicho)")
  .eq("lead.nicho", "politica")
  .order("created_at", { ascending: false })
  .limit(20);

console.log(`\nPagos de leads políticos: ${politica?.length || 0}`);
for (const p of politica || []) {
  const ln = Array.isArray(p.lead) ? p.lead[0] : p.lead;
  console.log(`${p.created_at?.slice(0,16)}  $${p.monto_usd}  ${p.estado}  receptor=${p.receptor}  → ${ln?.nombre}`);
}

// Buscar leads políticos con sus payments
const { data: leadsPol } = await sb.from("leads").select("id, nombre, ticket_total, estado").eq("nicho", "politica");
console.log(`\nLeads políticos en DB: ${leadsPol?.length || 0}`);
for (const l of leadsPol || []) {
  console.log(`  ${l.nombre} — ticket=$${l.ticket_total} estado=${l.estado}`);
}
