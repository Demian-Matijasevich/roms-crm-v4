import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teamMemberId, subscription } = body;

    if (!teamMemberId || !subscription) {
      return NextResponse.json({ error: "Missing teamMemberId or subscription" }, { status: 400 });
    }

    const supabase = createServerClient();

    const { error } = await supabase
      .from("team_members")
      .update({ push_subscription: subscription })
      .eq("id", teamMemberId);

    if (error) {
      console.error("Failed to store subscription:", error);
      return NextResponse.json({ error: "Failed to store subscription" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Subscribe error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
