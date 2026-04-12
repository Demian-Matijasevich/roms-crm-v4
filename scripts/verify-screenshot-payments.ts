import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const NAMES = [
  "Sofia Dalla",
  "Sofía Dalla",
  "Dalla Vicinli",
  "Dalla Vincini",
  "Giselle Juan Carlos",
  "Juan Carlos",
  "Luna Natalia",
  "Ornello",
  "Meloo",
  "Mostro",
  "Alan Gonzalez",
  "Alan González",
  "Gonzalez Milan",
  "Valentina Sanchero",
  "Valentina Sanchez",
  "Sanchero",
  "Noelia Conde",
  "Silvana Paje",
];

async function main() {
  const { data: leads, error } = await sb
    .from("leads")
    .select("id, nombre, estado, ticket_total, sheets_row_index, fecha_llamada, fecha_agendado")
    .range(0, 4999);

  console.log("error:", error);
  console.log("leads count:", leads?.length);
  if (!leads) return;

  for (const needle of NAMES) {
    const matches = leads.filter((l) => l.nombre?.toLowerCase().includes(needle.toLowerCase()));
    if (matches.length === 0) {
      console.log(`❌ ${needle} → NO MATCH`);
      continue;
    }
    for (const lead of matches) {
      const { data: pays } = await sb
        .from("payments")
        .select("monto_usd, fecha_pago, receptor, metodo_pago, estado")
        .eq("lead_id", lead.id)
        .order("fecha_pago");
      const paid = (pays || []).filter((p) => p.estado === "pagado");
      const total = paid.reduce((s, p) => s + p.monto_usd, 0);
      console.log(
        `✓ ${lead.nombre} | estado:${lead.estado} | row:${lead.sheets_row_index || "—"} | llamada:${lead.fecha_llamada?.split("T")[0] || "—"} | ticket:${lead.ticket_total || "—"} | pagos:${paid.length} total:$${total}`
      );
      for (const p of paid) {
        console.log(`    → $${p.monto_usd} ${p.fecha_pago?.split("T")[0]} ${p.receptor || "?"} ${p.metodo_pago || "?"}`);
      }
    }
  }
}

main().catch(console.error);
