import { fetchClients } from "@/lib/queries/clients";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import ClientesClient from "./ClientesClient";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createServerClient();
  const [clients, notesCountRes] = await Promise.all([
    fetchClients(),
    supabase.rpc("get_client_notes_counts").then((r) => r),
  ]);

  // Fallback: if RPC doesn't exist, just use empty map
  const notesCountMap: Record<string, number> = {};
  if (notesCountRes.data && Array.isArray(notesCountRes.data)) {
    for (const row of notesCountRes.data as { client_id: string; count: number }[]) {
      notesCountMap[row.client_id] = row.count;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Base de Clientes</h1>
        <span className="text-sm text-[var(--muted)]">{clients.length} clientes</span>
      </div>
      <ClientesClient clients={clients} notesCounts={notesCountMap} />
    </div>
  );
}
