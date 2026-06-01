import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SeleccionarVistaClient from "./SeleccionarVistaClient";

export const dynamic = "force-dynamic";

export default async function SeleccionarVistaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Solo admins ven el selector. Cualquier otro role va directo al home.
  if (!session.is_admin) redirect("/");

  return <SeleccionarVistaClient nombre={session.nombre} />;
}
