"use client";

import { ACCENTS, AccentKey } from "./tokens";

/**
 * Dot semaforizado con glow + animación pulse opcional.
 * Usar para indicar estados (online, vencido urgente, etc).
 *
 * Uso:
 *   <StatusDot color="red" pulse />
 *   <StatusDot color="#ff0000" size={12} />
 */
interface Props {
  color: AccentKey | string;
  size?: number;
  pulse?: boolean;
  glow?: boolean;
}

export default function StatusDot({ color, size = 10, pulse = false, glow = true }: Props) {
  const c = color in ACCENTS ? ACCENTS[color as AccentKey] : color;
  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
      aria-hidden
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: c,
          boxShadow: glow ? `0 0 8px ${c}80` : undefined,
        }}
      />
      {pulse && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: c,
            animation: "uiPulseRing 1.6s ease-out infinite",
          }}
        />
      )}
      <style>{`@keyframes uiPulseRing { 0% { transform: scale(1); opacity: 0.7; } 100% { transform: scale(2.5); opacity: 0; } }`}</style>
    </div>
  );
}
