"use client";

import { ACCENTS } from "./tokens";

/**
 * Pill para categorías (programa, fuente, etiqueta, etc).
 * Color por programa pre-mapeado; cualquier otro string usa color neutral.
 *
 * Uso:
 *   <Pill label="Omnipresencia" />
 *   <Pill label="urgente" tone="red" />
 */

const PROGRAM_TONE: Record<string, [string, string]> = {
  omnipresencia: [`${ACCENTS.purple}25`, `${ACCENTS.purple}50`],
  multicuentas:  [`${ACCENTS.green}25`,  `${ACCENTS.green}50`],
  consultoria:   [`${ACCENTS.cyan}25`,   `${ACCENTS.cyan}50`],
  roms_7:        [`${ACCENTS.blue}25`,   `${ACCENTS.blue}50`],
};

const TONES: Record<string, [string, string]> = {
  purple: [`${ACCENTS.purple}25`, `${ACCENTS.purple}50`],
  green:  [`${ACCENTS.green}25`,  `${ACCENTS.green}50`],
  red:    [`${ACCENTS.red}25`,    `${ACCENTS.red}50`],
  yellow: [`${ACCENTS.yellow}25`, `${ACCENTS.yellow}50`],
  orange: [`${ACCENTS.orange}25`, `${ACCENTS.orange}50`],
  blue:   [`${ACCENTS.blue}25`,   `${ACCENTS.blue}50`],
  cyan:   [`${ACCENTS.cyan}25`,   `${ACCENTS.cyan}50`],
  pink:   [`${ACCENTS.pink}25`,   `${ACCENTS.pink}50`],
};

export default function Pill({
  label,
  tone,
}: {
  label: string;
  tone?: keyof typeof TONES;
}) {
  const key = label.toLowerCase().replace(/[^a-z0-9_]/g, "");
  const programTone = PROGRAM_TONE[key];
  const palette = tone ? TONES[tone] : (programTone || ["rgba(255,255,255,0.06)", "rgba(255,255,255,0.1)"]);
  const [bg, border] = palette;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 100,
        background: bg,
        border: `1px solid ${border}`,
        color: "var(--foreground)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
