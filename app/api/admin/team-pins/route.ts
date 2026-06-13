import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createServerClient();
  const { data, error } = await sb
    .from("team_members")
    .select("id, nombre, pin, rol, is_admin, is_closer, is_setter, is_cobranzas, is_seguimiento, activo")
    .eq("activo", true)
    .order("is_admin", { ascending: false })
    .order("nombre");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    count: data?.length || 0,
    team: (data || []).map((t) => ({
      nombre: t.nombre,
      pin: t.pin,
      rol: t.rol,
      permisos: [
        t.is_admin && "admin",
        t.is_closer && "closer",
        t.is_setter && "setter",
        t.is_cobranzas && "cobranzas",
        t.is_seguimiento && "seguimiento",
      ].filter(Boolean).join(", "),
    })),
  });
}
