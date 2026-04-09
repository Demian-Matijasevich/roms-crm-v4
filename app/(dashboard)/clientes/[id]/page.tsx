import { fetchClientById } from "@/lib/queries/clients";
import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import ClientDetailClient from "./ClientDetailClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const client = await fetchClientById(id);
  if (!client) notFound();

  return <ClientDetailClient client={client} session={session} />;
}
