"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--background)]">
      <div className="max-w-md w-full bg-[var(--card-bg)] border border-[var(--red)]/40 rounded-xl p-6 text-center space-y-4">
        <div className="text-5xl">⚠️</div>
        <div>
          <h1 className="text-lg font-semibold text-white">Algo se rompió</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {error.message || "Error inesperado al renderizar la página."}
          </p>
          {error.digest && (
            <p className="text-[10px] text-[var(--muted)] mt-2 font-mono opacity-70">
              ref: {error.digest}
            </p>
          )}
        </div>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-lg bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white text-sm font-medium transition-colors"
          >
            Reintentar
          </button>
          <a
            href="/"
            className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-white text-sm font-medium transition-colors"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
