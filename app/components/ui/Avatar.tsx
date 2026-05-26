/**
 * Avatar circular con gradiente único determinístico por nombre.
 * Las iniciales se calculan desde el nombre. El gradiente HSL se deriva
 * del hash del nombre — el mismo nombre siempre tiene el mismo color.
 *
 * Uso:
 *   <Avatar name="Juan Martín" />
 *   <Avatar name="Mati" size={28} />
 */
export default function Avatar({
  name,
  size = 32,
  online,
}: {
  name: string;
  size?: number;
  online?: boolean | null;
}) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 60) % 360;
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: `linear-gradient(135deg, hsl(${h1}, 70%, 60%), hsl(${h2}, 70%, 50%))`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.4,
          fontWeight: 700,
          color: "#fff",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 8px rgba(0,0,0,0.3)",
        }}
        aria-label={name}
      >
        {initials}
      </div>
      {online != null && (
        <div
          style={{
            position: "absolute",
            bottom: -1,
            right: -1,
            width: size * 0.32,
            height: size * 0.32,
            borderRadius: "50%",
            background: online ? "#34D399" : "#52525b",
            border: "1.5px solid var(--background, #0a0a14)",
            boxShadow: online ? "0 0 6px #34D39980" : "none",
          }}
          aria-label={online ? "online" : "offline"}
        />
      )}
    </div>
  );
}
