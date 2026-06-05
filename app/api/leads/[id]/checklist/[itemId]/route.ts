/**
 * DELETE /api/leads/[id]/checklist/[itemId] — elimina un item del checklist.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, itemId } = await params;
  const sb = createServerClient();
  const { error } = await sb
    .from("lead_checklist")
    .delete()
    .eq("id", itemId)
    .eq("lead_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
