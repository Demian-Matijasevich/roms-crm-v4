"use client";

/**
 * Skeleton shimmer animado (gradiente que se mueve), no pulse plano.
 * Reemplazo para spinners y placeholders.
 *
 * Uso:
 *   <Shimmer width={120} height={16} />
 *   <Shimmer rounded width="100%" height={40} />
 */
export default function Shimmer({
  width = "100%",
  height = 12,
  rounded = false,
  circle = false,
  style,
}: {
  width?: number | string;
  height?: number | string;
  rounded?: boolean;
  circle?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <>
      <div
        style={{
          width,
          height,
          background: "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.04) 100%)",
          backgroundSize: "200% 100%",
          animation: "uiShimmer 1.4s linear infinite",
          borderRadius: circle ? "50%" : rounded ? 8 : 4,
          flexShrink: 0,
          ...style,
        }}
        aria-hidden
      />
      <style>{`@keyframes uiShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
    </>
  );
}
