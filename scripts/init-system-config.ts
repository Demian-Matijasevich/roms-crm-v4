import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: existing } = await sb.from("team_members").select("id, observaciones").eq("nombre", "__SYSTEM_CONFIG__").maybeSingle();
  if (existing) {
    console.log("Already exists:", existing);
    return;
  }
  const { data, error } = await sb
    .from("team_members")
    .insert({
      nombre: "__SYSTEM_CONFIG__",
      etiqueta: "__system__",
      rol: "admin",
      is_admin: false,
      is_closer: false,
      is_setter: false,
      activo: false,
      pin: "0000",
      observaciones: JSON.stringify({ usd_ars_rate: 1250 }),
    })
    .select()
    .single();
  console.log("Created:", data, error?.message);
}
main().catch(console.error);
