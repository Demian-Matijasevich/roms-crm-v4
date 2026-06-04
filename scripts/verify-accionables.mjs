import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const e = Object.fromEntries(
  readFileSync(".env.production.tmp","utf8").split("\n").filter(l=>l.includes("="))
    .map(l=>{const[k,...v]=l.split("=");return[k.trim(),v.join("=").trim().replace(/^"/,"").replace(/"$/,"").replace(/\\n$/,"")];})
);
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const nombres = ["German Pinteño", "Arevalo Arevalo", "Mariano Forastieri", "Tony Zagan"];

for (const nombre of nombres) {
  console.log(`\n=== ${nombre} ===`);
  const { data: leads } = await sb.from("leads").select("id, nombre, estado, ticket_total, programa_pitcheado").ilike("nombre", `%${nombre}%`);
  for (const l of leads || []) {
    console.log(`Lead: ${l.nombre} (id=${l.id.slice(0,8)}) estado=${l.estado} ticket=$${l.ticket_total} programa=${l.programa_pitcheado}`);
    const { data: pays } = await sb.from("payments").select("numero_cuota, monto_usd, estado, fecha_pago, fecha_vencimiento, es_renovacion, receptor").eq("lead_id", l.id).order("numero_cuota");
    for (const p of pays || []) {
      console.log(`   c#${p.numero_cuota} $${p.monto_usd} ${p.estado} fecha_pago=${p.fecha_pago || '—'} venc=${p.fecha_vencimiento || '—'} renov=${p.es_renovacion} receptor=${p.receptor || '—'}`);
    }
  }
}
