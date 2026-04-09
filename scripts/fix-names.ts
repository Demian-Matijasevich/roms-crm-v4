import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const r1 = await sb.from("team_members").update({ nombre: "Agustín" }).eq("id", "3f3d78a8-7061-4e70-a085-043119344d7f");
  console.log("Agustín fix:", r1.error ? r1.error.message : "OK");

  const r2 = await sb.from("team_members").update({ nombre: "Juan Martín" }).eq("id", "209839f4-5aca-4e74-a596-e2300f605bae");
  console.log("Juan Martín fix:", r2.error ? r2.error.message : "OK");

  const { data } = await sb.from("team_members").select("nombre").order("nombre");
  console.log("Names:", data?.map((t) => t.nombre));
}

main().catch(console.error);
