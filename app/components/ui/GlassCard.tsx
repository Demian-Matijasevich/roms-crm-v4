"use client";

import { useState } from "react";
import { GLASS, SPRING } from "./tokens";

/**
 * Card con efecto glass + frosted blur. Reemplazo gradual de las cards
 * planas actuales. Acepta `hover` opcional para que haga lift al hover.
 *
 * Uso:
 *   <GlassCard padding={20} hover>...</GlassCard>
 *
 * Convive con las cards viejas — no las reemplaza globalmente.
 */
interface Props extends React.HTMLAttributes<HTMLDivElement> {
  padding?: number | string;
  hover?: boolean;
  noBorder?: boolean;
  children: React.ReactNode;
}

export default function GlassCard({
  padding,
  hover = false,
  noBorder = false,
  style,
  children,
  ...rest
}: Props) {
  const [hovered, setHovered] = useState(false);

  const base: React.CSSProperties = {
    ...GLASS.card,
    ...(noBorder ? { border: "none" } : null),
    ...(padding != null ? { padding } : null),
    transition: `transform 250ms ${SPRING}, box-shadow 250ms`,
    ...(hover && hovered ? GLASS.cardHover : null),
    ...style,
  };

  return (
    <div
      {...rest}
      style={base}
      onMouseEnter={(e) => { if (hover) setHovered(true); rest.onMouseEnter?.(e); }}
      onMouseLeave={(e) => { if (hover) setHovered(false); rest.onMouseLeave?.(e); }}
    >
      {children}
    </div>
  );
}
