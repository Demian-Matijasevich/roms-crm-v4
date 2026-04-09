import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;

    const q = req.nextUrl.searchParams.get("q") ?? "";
    if (q.length < 2) {
      return NextResponse.json({ clients: [] });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("clients")
      .select("id, nombre")
      .ilike("nombre", `%${q}%`)
      .eq("estado", "activo")
      .order("nombre")
      .limit(10);

    if (error) {
      console.error("[GET /api/clients/search]", error);
      return NextResponse.json({ clients: [] });
    }

    return NextResponse.json({ clients: data });
  } catch (err) {
    console.error("[GET /api/clients/search]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
