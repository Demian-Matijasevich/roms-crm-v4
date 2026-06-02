import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const e = Object.fromEntries(
  readFileSync(".env.production.tmp","utf8")
    .split("\n").filter(l=>l.includes("="))
    .map(l=>{const[k,...v]=l.split("=");return[k.trim(),v.join("=").trim().replace(/^"/,"").replace(/"$/,"").replace(/\\n$/,"")];})
);
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
const { data } = await sb.from("payments")
  .select("id, monto_usd, fecha_pago, estado, numero_cuota, receptor, created_at, cobrador_id, lead:leads(nombre, nicho, estado), cobrador:team_members!payments_cobrador_id_fkey(nombre)")
  .gte("created_at", cutoff)
  .order("created_at", { ascending: false });

console.log(`Total pagos cargados ultimas 72h: ${data?.length || 0}`);
console.log("");
for (const p of data || []) {
  const ln = Array.isArray(p.lead) ? p.lead[0] : p.lead;
  const cb = Array.isArray(p.cobrador) ? p.cobrador[0] : p.cobrador;
  console.log(`${p.created_at?.slice(0,16)}  $${p.monto_usd}  ${p.estado}  c#${p.numero_cuota}  fecha_pago=${p.fecha_pago || '—'}  receptor=${p.receptor || '—'}  cobrador=${cb?.nombre || '—'}  → ${ln?.nombre || '(s/n)'} (nicho=${ln?.nicho || 'general'})`);
}
