import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const e = Object.fromEntries(
  readFileSync(".env.production.tmp","utf8").split("\n").filter(l=>l.includes("="))
    .map(l=>{const[k,...v]=l.split("=");return[k.trim(),v.join("=").trim().replace(/^"/,"").replace(/"$/,"").replace(/\n$/,"")];})
);
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await sb.from("payments")
  .select("id, monto_usd, fecha_pago, estado, numero_cuota, receptor, created_at, lead:leads(nombre, nicho, estado)")
  .eq("monto_usd", 8000)
  .order("created_at", { ascending: false });
console.log(`Pagos exactos $8000: ${data?.length || 0}\n`);
for (const p of data || []) {
  const ln = Array.isArray(p.lead) ? p.lead[0] : p.lead;
  console.log(`${p.created_at?.slice(0,16)}  $${p.monto_usd}  ${p.estado}  c#${p.numero_cuota}  receptor=${p.receptor || '—'}  → ${ln?.nombre || '(s/n)'} (nicho=${ln?.nicho || '—'} estado=${ln?.estado || '—'})`);
}
