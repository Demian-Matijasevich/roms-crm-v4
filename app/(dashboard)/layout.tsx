import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getVista } from "@/lib/vista";
import Sidebar from "@/app/components/Sidebar";
import { RealtimeProvider } from "@/app/components/RealtimeProvider";
import SaleBanner from "@/app/components/SaleBanner";
import CommandPalette from "@/app/components/CommandPalette";
import QuickCallLog from "@/app/components/QuickCallLog";
import { ToastProvider, ConfirmProvider } from "@/app/components/Toast";
import { MeshBackground } from "@/app/components/ui";
import VistaBadge from "@/app/components/VistaBadge";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    const session = await getSession();
    if (!session) redirect("/login");

    const vista = await getVista();

    return (
      <ToastProvider>
        <ConfirmProvider>
          <MeshBackground />
          <div className="min-h-screen relative" style={{ zIndex: 1 }}>
            <Sidebar session={session} vista={vista} />
            <CommandPalette />
            <QuickCallLog session={session} />
            <RealtimeProvider>
              <SaleBanner />
              <main className="lg:ml-64 pt-14 lg:pt-0 p-4 lg:p-6 animate-fade-in">
                {session.is_admin && <VistaBadge />}
                {children}
              </main>
            </RealtimeProvider>
          </div>
        </ConfirmProvider>
      </ToastProvider>
    );
  } catch {
    redirect("/login");
  }
}
