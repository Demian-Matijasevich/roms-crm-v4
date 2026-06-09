/**
 * Carga el pago de Sofía Dalia Vichich del 5/5/2026:
 *   $144 USD ($214.000 ARS) recibido por Fran.
 *   Comprobante Mercado Pago de Francisco Castro.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.production.tmp", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Usar el lead que tiene más pagos existentes
const LEAD_ID = "0bf1d5ce-67ea-467e-a1e3-7911b08c4b46";

// Chequear cuotas existentes
const { data: existing } = await sb.from("payments").select("numero_cuota, fecha_pago, monto_usd").eq("lead_id", LEAD_ID).order("numero_cuota");
console.log("Cuotas existentes:");
for (const p of existing || []) console.log(`  c#${p.numero_cuota} $${p.monto_usd} ${p.fecha_pago}`);
const maxCuota = (existing || []).reduce((m, p) => Math.max(m, p.numero_cuota), 0);
const nuevaCuota = maxCuota + 1;
console.log(`Próximo numero_cuota: ${nuevaCuota}`);

// Verificar no exista ya un pago igual
const dup = (existing || []).find((p) => p.fecha_pago === "2026-05-05" && Math.abs(p.monto_usd - 144) < 1);
if (dup) {
  console.log("⊘ ya existe, skip");
  process.exit(0);
}

const { data: inserted, error } = await sb.from("payments").insert({
  lead_id: LEAD_ID,
  client_id: null,
  numero_cuota: nuevaCuota,
  monto_usd: 144,
  monto_ars: 214000,
  fecha_pago: "2026-05-05",
  fecha_vencimiento: null,
  estado: "pagado",
  metodo_pago: "mercado_pago",
  receptor: "FRAN",
  comprobante_url: null,
  cobrador_id: null,
  verificado: false,
  es_renovacion: false,
}).select("id").single();

if (error) {
  console.log(`✗ ERROR: ${error.message}`);
  process.exit(1);
}
console.log(`✓ Cargado payment id=${inserted.id.slice(0,8)} — Sofía Vichich $144 USD ($214k ARS) receptor=FRAN`);
