"use client";

import { useState, useMemo, useEffect } from "react";

interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  /** Show this column in mobile card view (first 3 by default) */
  mobileVisible?: boolean;
}

interface Props<T> {
  data: T[];
  columns: Column<T>[];
  searchKey?: keyof T;
  searchPlaceholder?: string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export default function DataTable<T extends Record<string, unknown>>({
  data, columns, searchKey, searchPlaceholder = "Buscar...", pageSize = 20, onRowClick,
}: Props<T>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const isMobile = useIsMobile();

  const filtered = useMemo(() => {
    let result = data;
    if (search && searchKey) {
      const q = search.toLowerCase();
      result = result.filter((row) =>
        String(row[searchKey] ?? "").toLowerCase().includes(q)
      );
    }
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = a[sortKey] ?? "";
        const bv = b[sortKey] ?? "";
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [data, search, searchKey, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleExpand(i: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // Determine which columns to show on mobile summary vs expanded
  const mobileVisibleCols = columns.filter((c, i) => c.mobileVisible !== false && i < 3);
  const mobileHiddenCols = columns.filter((c, i) => !(c.mobileVisible !== false && i < 3));

  return (
    <div className="space-y-3">
      {searchKey && (
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="w-full max-w-sm px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
        />
      )}

      {/* Mobile card layout */}
      {isMobile ? (
        <div className="space-y-2">
          {paged.map((row, i) => {
            const globalIndex = page * pageSize + i;
            const isExpanded = expandedRows.has(globalIndex);
            return (
              <div
                key={i}
                className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-3 animate-fade-in"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? "cursor-pointer" : ""}
                >
                  {mobileVisibleCols.map((col) => (
                    <div key={col.key} className="flex items-center justify-between py-1">
                      <span className="text-xs text-[var(--muted)] uppercase">{col.label}</span>
                      <span className="text-sm text-[var(--foreground)] text-right max-w-[60%]">
                        {col.render ? col.render(row) : String(row[col.key] ?? "\u2014")}
                      </span>
                    </div>
                  ))}
                </div>
                {isExpanded && mobileHiddenCols.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[var(--card-border)] animate-fade-in">
                    {mobileHiddenCols.map((col) => (
                      <div key={col.key} className="flex items-center justify-between py-1">
                        <span className="text-xs text-[var(--muted)] uppercase">{col.label}</span>
                        <span className="text-sm text-[var(--foreground)] text-right max-w-[60%]">
                          {col.render ? col.render(row) : String(row[col.key] ?? "\u2014")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {mobileHiddenCols.length > 0 && (
                  <button
                    onClick={() => toggleExpand(globalIndex)}
                    className="w-full text-center text-xs text-[var(--purple-light)] mt-2 py-1 min-h-[36px]"
                  >
                    {isExpanded ? "Ver menos" : "Ver mas"}
                  </button>
                )}
              </div>
            );
          })}
          {paged.length === 0 && (
            <div className="text-center py-8 text-[var(--muted)]">Sin resultados</div>
          )}
        </div>
      ) : (
        /* Desktop table layout */
        <div className="overflow-x-auto rounded-lg border border-[var(--card-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--card-bg)]">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                    className={`px-3 py-2 text-left text-xs text-[var(--muted)] font-medium uppercase ${
                      col.sortable ? "cursor-pointer hover:text-white" : ""
                    }`}
                  >
                    {col.label}
                    {sortKey === col.key && (sortDir === "asc" ? " \u25B2" : " \u25BC")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, i) => (
                <tr
                  key={i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-t border-[var(--card-border)] hover-row ${
                    onRowClick ? "cursor-pointer" : ""
                  }`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2 text-[var(--foreground)]">
                      {col.render ? col.render(row) : String(row[col.key] ?? "\u2014")}
                    </td>
                  ))}
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center text-[var(--muted)]">
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-[var(--muted)]">
          <span>{filtered.length} registros</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded bg-[var(--card-bg)] disabled:opacity-30"
            >
              {"\u2190"}
            </button>
            <span className="px-2 py-1 flex items-center">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded bg-[var(--card-bg)] disabled:opacity-30"
            >
              {"\u2192"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
