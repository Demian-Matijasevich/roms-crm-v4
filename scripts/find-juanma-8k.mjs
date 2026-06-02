import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const e = Object.fromEntries(
  readFileSync(".env.production.tmp","utf8").split("\n").filter(l=>l.includes("="))
    .map(l=>{const[k,...v]=l.split("=");return[k.trim(),v.join("=").trim().replace(/^"/,"").replace(/"$/,"").replace(/\\n$/,"")];})
);
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Buscar a Juanma
const { data: juanma } = await sb.from("team_members").select("id, nombre").eq("nombre", "Juanma").maybeSingle();
console.log("Juanma:", juanma);

// Todos los pagos donde Juanma es cobrador, últimos 14 días
const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
const { data: pays } = await sb.from("payments")
  .select("id, monto_usd, fecha_pago, estado, numero_cuota, receptor, created_at, cobrador_id, lead:leads(nombre, nicho, estado, programa_pitcheado)")
  .eq("cobrador_id", juanma?.id || "00")
  .gte("created_at", cutoff)
  .order("created_at", { ascending: false });

console.log(`\nPagos cargados por Juanma (últimos 14d): ${pays?.length || 0}`);
for (const p of pays || []) {
  const ln = Array.isArray(p.lead) ? p.lead[0] : p.lead;
  console.log(`${p.created_at?.slice(0,16)}  $${p.monto_usd}  ${p.estado}  c#${p.numero_cuota}  receptor=${p.receptor || '—'}  → ${ln?.nombre || '(s/n)'} (nicho=${ln?.nicho || 'general'})`);
}

// Pagos con receptor "Juanma" o "JUANMA"
const { data: receptor } = await sb.from("payments")
  .select("id, monto_usd, fecha_pago, estado, numero_cuota, receptor, created_at, lead:leads(nombre, nicho)")
  .ilike("receptor", "%juanma%")
  .gte("created_at", cutoff)
  .order("created_at", { ascending: false });

console.log(`\nPagos con receptor Juanma (últimos 14d): ${receptor?.length || 0}`);
for (const p of receptor || []) {
  const ln = Array.isArray(p.lead) ? p.lead[0] : p.lead;
  console.log(`${p.created_at?.slice(0,16)}  $${p.monto_usd}  ${p.estado}  c#${p.numero_cuota}  receptor=${p.receptor}  → ${ln?.nombre || '(s/n)'} (nicho=${ln?.nicho || 'general'})`);
}

// Buscar todos los pagos cargados con monto EXACTO de 8000
const { data: ochok } = await sb.from("payments")
  .select("id, monto_usd, fecha_pago, estado, numero_cuota, receptor, created_at, cobrador_id, cobrador:team_members!payments_cobrador_id_fkey(nombre), lead:leads(nombre, nicho)")
  .eq("monto_usd", 8000)
  .gte("created_at", cutoff)
  .order("created_at", { ascending: false });

console.log(`\nPagos de EXACTAMENTE $8000 últimos 14d: ${ochok?.length || 0}`);
for (const p of ochok || []) {
  const ln = Array.isArray(p.lead) ? p.lead[0] : p.lead;
  const cb = Array.isArray(p.cobrador) ? p.cobrador[0] : p.cobrador;
  console.log(`${p.created_at?.slice(0,16)}  $${p.monto_usd}  ${p.estado}  c#${p.numero_cuota}  receptor=${p.receptor}  cobrador=${cb?.nombre || '—'}  → ${ln?.nombre || '(s/n)'} (nicho=${ln?.nicho || 'general'})`);
}

// También buscar montos con error de carga: fecha_pago null pero estado=pagado
const { data: weirdos } = await sb.from("payments")
  .select("id, monto_usd, fecha_pago, estado, numero_cuota, receptor, created_at, lead:leads(nombre)")
  .eq("estado", "pagado")
  .is("fecha_pago", null)
  .gte("created_at", cutoff);

console.log(`\nPagos PAGADOS sin fecha_pago (raros) últimos 14d: ${weirdos?.length || 0}`);
for (const p of weirdos || []) {
  const ln = Array.isArray(p.lead) ? p.lead[0] : p.lead;
  console.log(`${p.created_at?.slice(0,16)}  $${p.monto_usd}  c#${p.numero_cuota}  → ${ln?.nombre || '(s/n)'}`);
}
