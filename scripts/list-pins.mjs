import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const e = Object.fromEntries(
  readFileSync(".env.production.tmp", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const [k, ...v] = l.split("=");
      return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
    })
);
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await sb
  .from("team_members")
  .select("nombre, rol, pin, is_admin, is_jefe_ventas, is_closer, is_setter, is_cobranzas, activo")
  .eq("activo", true)
  .not("pin", "is", null)
  .order("pin");
for (const m of data || []) {
  const roles = [
    m.is_admin && "ADMIN",
    m.is_jefe_ventas && "JEFE_VENTAS",
    m.is_closer && "closer",
    m.is_setter && "setter",
    m.is_cobranzas && "cobranzas",
  ].filter(Boolean).join(", ");
  console.log(`${m.pin}  ${(m.nombre || "").padEnd(15)} ${roles}`);
}
