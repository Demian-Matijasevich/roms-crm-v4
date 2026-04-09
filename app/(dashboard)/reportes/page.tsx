import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchDailyReports, fetchReportsByMember, fetchSetters } from "@/lib/queries/daily-reports";
import ReportesClient from "./ReportesClient";

export const dynamic = "force-dynamic";

export default async function ReportesPage() {
  const auth = await requireAdmin();
  if ("error" in auth) redirect("/login");

  const [reports, aggregates, setters] = await Promise.all([
    fetchDailyReports(),
    fetchReportsByMember(),
    fetchSetters(),
  ]);

  return (
    <ReportesClient
      reports={reports}
      aggregates={aggregates}
      setters={setters}
    />
  );
}
