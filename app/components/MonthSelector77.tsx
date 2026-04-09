"use client";

import { getFiscalMonthOptions } from "@/lib/date-utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function MonthSelector77({ value, onChange }: Props) {
  const options = getFiscalMonthOptions(12);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
