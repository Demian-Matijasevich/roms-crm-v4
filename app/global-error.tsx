"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui,Segoe UI,Roboto,sans-serif", margin: 0, background: "#0d0d0f", color: "#e5e5e5" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div style={{ maxWidth: "28rem", background: "#18181b", border: "1px solid #7f1d1d", borderRadius: 12, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💥</div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Error global</h1>
            <p style={{ fontSize: 14, color: "#a1a1aa", margin: "0 0 16px" }}>
              {error.message || "Algo se rompió a nivel root del CRM."}
            </p>
            <button
              onClick={() => reset()}
              style={{ padding: "8px 16px", borderRadius: 8, background: "#3b82f6", color: "white", border: "none", cursor: "pointer", fontSize: 14 }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
