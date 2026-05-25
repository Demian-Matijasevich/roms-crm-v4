export default function DashboardLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-[var(--card-border)] rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl" />
        ))}
      </div>
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-10 bg-[var(--card-border)]/40 rounded" />
        ))}
      </div>
    </div>
  );
}
