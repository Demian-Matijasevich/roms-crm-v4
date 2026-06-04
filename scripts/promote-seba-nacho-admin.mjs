/**
 * Promueve Seba y Nacho a admin (mismo perfil que Juanma/Fran).
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

for (const nombre of ["Seba", "Nacho"]) {
  const { data, error } = await sb.from("team_members").update({
    rol: "admin",
    is_admin: true,
    is_closer: true,        // mantiene closer (cierran ventas)
    observaciones: "Socio política — admin + closer",
  }).eq("nombre", nombre).select("nombre, rol, is_admin, is_closer, pin").single();
  if (error) {
    console.log(`✗ ${nombre}: ${error.message}`);
  } else {
    console.log(`✓ ${data.nombre} → rol=${data.rol} admin=${data.is_admin} closer=${data.is_closer} pin=${data.pin}`);
  }
}
