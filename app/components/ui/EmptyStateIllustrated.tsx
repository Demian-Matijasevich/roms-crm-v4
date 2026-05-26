"use client";

/**
 * Empty state con SVG ilustrado en gradiente. Reemplaza el `EmptyState`
 * legacy en lugares donde queremos un look más premium.
 *
 * Uso:
 *   <EmptyStateIllustrated
 *     title="Sin prospectos"
 *     description="Cargá números nuevos para que aparezcan acá."
 *     actionLabel="Cargar números"
 *     onAction={() => ...}
 *   />
 */
export default function EmptyStateIllustrated({
  title,
  description,
  actionLabel,
  onAction,
  size = 80,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  size?: number;
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "40px 20px",
      textAlign: "center",
    }}>
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" style={{ opacity: 0.5 }} aria-hidden>
        <defs>
          <linearGradient id="emptyIllustGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <circle cx="40" cy="40" r="32" stroke="url(#emptyIllustGrad)" strokeWidth="2" strokeDasharray="4 4" opacity="0.5" />
        <circle cx="40" cy="40" r="20" stroke="url(#emptyIllustGrad)" strokeWidth="2" opacity="0.7" />
        <path d="M30 40h20M40 30v20" stroke="url(#emptyIllustGrad)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12, color: "var(--foreground)" }}>{title}</div>
      {description && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, maxWidth: 280, lineHeight: 1.5 }}>
          {description}
        </div>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            marginTop: 14,
            padding: "8px 16px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "linear-gradient(135deg, #c084fc, #06b6d4)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(192,132,252,0.3)",
            transition: "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.04)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
