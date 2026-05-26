import { Shimmer } from "@/app/components/ui";

export default function DashboardLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <Shimmer width={120} height={11} style={{ marginBottom: 8 }} />
          <Shimmer width={220} height={26} rounded />
        </div>
        <div className="flex gap-2">
          <Shimmer width={120} height={32} rounded />
          <Shimmer width={100} height={32} rounded />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: 20,
              padding: 20,
              backdropFilter: "blur(40px)",
              WebkitBackdropFilter: "blur(40px)",
            }}
          >
            <Shimmer width="60%" height={11} style={{ marginBottom: 12 }} />
            <Shimmer width="80%" height={26} rounded style={{ marginBottom: 6 }} />
            <Shimmer width="40%" height={10} />
          </div>
        ))}
      </div>

      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: 20,
          padding: 20,
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Shimmer circle width={32} height={32} />
            <div className="flex-1">
              <Shimmer width="50%" height={12} rounded style={{ marginBottom: 4 }} />
              <Shimmer width="30%" height={10} />
            </div>
            <Shimmer width={60} height={14} rounded />
          </div>
        ))}
      </div>
    </div>
  );
}
