import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envFile = readFileSync(".env.production.tmp", "utf8");
const env = Object.fromEntries(
  envFile.split("\n").filter((l) => l.includes("=")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
  })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Como no tenemos exec_sql RPC, vamos a aplicar la migración paso a paso vía API.

// 1. Agregar columna is_jefe_ventas (si no existe). Esto solo se puede hacer via SQL.
// Alternativa: si ya está la columna en producción, solo insertamos Mati.

// Intentamos insertar Mati directamente. Si la columna no existe, falla.
console.log("Intentando insertar a Mati directamente...");
const { data: existing } = await sb.from("team_members").select("id, nombre").eq("nombre", "Mati").maybeSingle();
if (existing) {
  console.log("Mati ya existe:", existing);
  // Update flags
  const { error: upd } = await sb
    .from("team_members")
    .update({ is_admin: true, is_jefe_ventas: true, pin: "1003", activo: true })
    .eq("id", existing.id);
  console.log("Update result:", upd?.message || "ok");
} else {
  const { data, error } = await sb
    .from("team_members")
    .insert({
      nombre: "Mati",
      etiqueta: "mati",
      rol: "jefe_ventas",
      is_admin: true,
      is_jefe_ventas: true,
      is_closer: false,
      is_setter: false,
      is_cobranzas: false,
      is_seguimiento: false,
      comision_pct: 0,
      pin: "1003",
      activo: true,
    })
    .select()
    .single();
  if (error) {
    console.error("Error insertando Mati:", error.message);
    console.log("\n⚠️ Probablemente falta correr la migración SQL para crear la columna is_jefe_ventas.");
    console.log("Hace esto en el SQL editor de Supabase:");
    console.log("ALTER TABLE team_members ADD COLUMN IF NOT EXISTS is_jefe_ventas boolean DEFAULT false;");
  } else {
    console.log("✓ Mati creado:", data);
  }
}
