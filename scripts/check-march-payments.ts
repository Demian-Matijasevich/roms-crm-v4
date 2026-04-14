import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // 1) What does v_monthly_cash say about Marzo?
  const { data: mc } = await sb.from("v_monthly_cash").select("*").order("mes_fiscal");
  console.log("v_monthly_cash (todos):");
  for (const m of mc || []) console.log("  ", m);

  // 2) Raw payments with fecha_pago in Feb vs Mar
  const { data: feb } = await sb.from("payments").select("id,lead_id,monto_usd,fecha_pago,estado").eq("estado","pagado").gte("fecha_pago","2026-02-01").lte("fecha_pago","2026-02-28").range(0,4999);
  const { data: mar } = await sb.from("payments").select("id,lead_id,monto_usd,fecha_pago,estado").eq("estado","pagado").gte("fecha_pago","2026-03-01").lte("fecha_pago","2026-03-31").range(0,4999);
  console.log(`\nFEB raw: ${feb?.length} pagos = $${(feb||[]).reduce((s,p)=>s+p.monto_usd,0)}`);
  console.log(`MAR raw: ${mar?.length} pagos = $${(mar||[]).reduce((s,p)=>s+p.monto_usd,0)}`);

  // 3) Check how v_monthly_cash is defined — query its source
  const { data: viewDef } = await sb.rpc("pg_get_viewdef" as any, { view_name: "v_monthly_cash" }).single();
  console.log("\nView definition:", viewDef);
}

main().catch(console.error);
