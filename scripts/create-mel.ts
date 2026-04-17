import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: existing } = await sb.from("team_members").select("id,nombre,pin").ilike("nombre", "%mel%");
  console.log("Mel existing:", existing);

  if (existing && existing.length > 0 && existing[0].nombre?.toLowerCase() === "mel") {
    console.log("Mel already exists. Updating role flags...");
    const { error } = await sb
      .from("team_members")
      .update({ is_cobranzas: true, is_seguimiento: true, rol: "cobranzas", activo: true })
      .eq("id", existing[0].id);
    if (error) console.error(error);
    else console.log("Updated Mel:", existing[0].id, "pin:", existing[0].pin);
    return;
  }

  const { data: pins } = await sb.from("team_members").select("pin");
  const used = new Set((pins || []).map((p) => p.pin).filter(Boolean));
  let pin = 1100;
  while (used.has(String(pin))) pin++;

  const { data, error } = await sb
    .from("team_members")
    .insert({
      nombre: "Mel",
      etiqueta: "mel",
      rol: "cobranzas",
      is_admin: false,
      is_closer: false,
      is_setter: false,
      is_cobranzas: true,
      is_seguimiento: true,
      activo: true,
      pin: String(pin),
      comision_pct: 0,
    })
    .select()
    .single();
  console.log("Created:", data, error?.message);
  if (data) console.log(`\n✅ Mel creada — PIN: ${pin}`);
}
main().catch(console.error);
