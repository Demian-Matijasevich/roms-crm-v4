import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const APPLY = process.argv.includes("--apply");

async function run(label: string, fn: () => Promise<void>) {
  console.log(`\n── ${label} ──`);
  await fn();
}

async function main() {
  // ═══ Matias Randazzo: borrar lead row 770 entero (duplicate del row 660) ═══
  await run("Matias Randazzo — borrar lead 770 y sus pagos", async () => {
    const { data } = await sb.from("leads").select("id, sheets_row_index").ilike("nombre", "Matias Randazzo");
    const row770 = data?.find((l) => l.sheets_row_index === 770);
    const row660 = data?.find((l) => l.sheets_row_index === 660);
    if (!row770 || !row660) { console.log("  no encontrados"); return; }
    const { data: pays770 } = await sb.from("payments").select("id, monto_usd, fecha_pago").eq("lead_id", row770.id);
    console.log(`  row 770 tiene ${pays770?.length} pagos a borrar`);
    if (APPLY) {
      await sb.from("payments").delete().eq("lead_id", row770.id);
      await sb.from("leads").delete().eq("id", row770.id);
      console.log(`  ✓ row 770 eliminado`);
    }
  });

  // ═══ Noelia Conde: borrar pago $1200 del 11/04 ═══
  await run("Noelia Conde — borrar pago $1200 del 11/04", async () => {
    const { data: lead } = await sb.from("leads").select("id").ilike("nombre", "noelia conde").eq("estado", "cerrado").single();
    if (!lead) { console.log("  no encontrado"); return; }
    const { data: pays } = await sb
      .from("payments")
      .select("id, monto_usd, fecha_pago")
      .eq("lead_id", lead.id)
      .eq("monto_usd", 1200)
      .gte("fecha_pago", "2026-04-11")
      .lte("fecha_pago", "2026-04-11");
    console.log(`  encontrados ${pays?.length} pagos`);
    if (APPLY && pays && pays.length > 0) {
      await sb.from("payments").delete().eq("id", pays[0].id);
      console.log("  ✓ borrado");
    }
  });

  // ═══ silvana paje: borrar pago $1200 del 11/04 ═══
  await run("Silvana paje — borrar pago $1200 del 11/04", async () => {
    const { data: lead } = await sb.from("leads").select("id").ilike("nombre", "silvana paje").single();
    if (!lead) { console.log("  no encontrado"); return; }
    const { data: pays } = await sb
      .from("payments")
      .select("id, monto_usd, fecha_pago")
      .eq("lead_id", lead.id)
      .eq("monto_usd", 1200)
      .gte("fecha_pago", "2026-04-11")
      .lte("fecha_pago", "2026-04-11");
    console.log(`  encontrados ${pays?.length} pagos`);
    if (APPLY && pays && pays.length > 0) {
      await sb.from("payments").delete().eq("id", pays[0].id);
      console.log("  ✓ borrado");
    }
  });

  // ═══ Luciano Molero: borrar pagos "basura" (sin fecha + $10k 07/04 que no existe en xlsx) ═══
  await run("Luciano Molero — borrar pagos sin fecha + $10k 07/04 (no existen en xlsx)", async () => {
    const { data: lead } = await sb.from("leads").select("id").ilike("nombre", "luciano molero").single();
    if (!lead) { console.log("  no encontrado"); return; }
    // Delete: sin fecha copies + the $10k 07/04
    const { data: sinFecha } = await sb.from("payments").select("id, monto_usd, numero_cuota").eq("lead_id", lead.id).is("fecha_pago", null);
    console.log(`  pagos sin fecha: ${sinFecha?.length}`);
    const { data: pay10k } = await sb.from("payments").select("id, monto_usd").eq("lead_id", lead.id).eq("monto_usd", 10000).eq("fecha_pago", "2026-04-07");
    console.log(`  pagos $10k 07/04: ${pay10k?.length}`);
    if (APPLY) {
      if (sinFecha) for (const p of sinFecha) await sb.from("payments").delete().eq("id", p.id);
      if (pay10k) for (const p of pay10k) await sb.from("payments").delete().eq("id", p.id);
      console.log("  ✓ limpiado");
    }
  });

  // ═══ Pagos con monto $1200 fantasma en abril (Ivan Barrera, Benjamin Barrios) ═══
  await run("Ivan Barrera + Benjamin Barrios — borrar pagos $1200 fantasma del 12/04", async () => {
    for (const name of ["Ivan Barrera", "Benjamin Barrios"]) {
      const { data: leads } = await sb.from("leads").select("id, nombre").ilike("nombre", name);
      if (!leads?.length) continue;
      for (const l of leads) {
        const { data: pays } = await sb
          .from("payments")
          .select("id, monto_usd, fecha_pago")
          .eq("lead_id", l.id)
          .eq("monto_usd", 1200)
          .gte("fecha_pago", "2026-04-12")
          .lte("fecha_pago", "2026-04-12");
        console.log(`  ${name} pagos a borrar: ${pays?.length}`);
        if (APPLY && pays) for (const p of pays) await sb.from("payments").delete().eq("id", p.id);
      }
    }
  });

  // ═══ Natalia $300 01/04 (fecha anterior a la llamada 06/04) — verificar ═══
  await run("Natalia $300 01/04 — verificar", async () => {
    const { data: leads } = await sb.from("leads").select("id, nombre, fecha_llamada").ilike("nombre", "%natalia%").not("fecha_llamada", "is", null);
    for (const l of leads || []) {
      const { data: pays } = await sb
        .from("payments")
        .select("id, monto_usd, fecha_pago")
        .eq("lead_id", l.id)
        .gte("fecha_pago", "2026-04-01")
        .lte("fecha_pago", "2026-04-01");
      if (pays?.length) console.log(`  ${l.nombre} llamada:${l.fecha_llamada?.split("T")[0]} pago_id:${pays[0].id.substring(0,8)} $${pays[0].monto_usd}`);
    }
  });

  console.log(APPLY ? "\n✅ Aplicado." : "\n(dry run — pasá --apply)");
}

main().catch(console.error);
