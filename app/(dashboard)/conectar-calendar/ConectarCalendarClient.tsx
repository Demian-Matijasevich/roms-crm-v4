"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TokenInfo {
  google_email: string;
  connected_at: string;
  updated_at: string;
  last_sync_at: string | null;
  last_sync_ok: boolean | null;
}

interface Props {
  nombre: string;
  token: TokenInfo | null;
  flashOk: string | null;
  flashError: string | null;
}

export default function ConectarCalendarClient({ nombre, token, flashOk, flashError }: Props) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    if (!confirm("¿Desconectar tu calendar? Vas a tener que reconectarlo después.")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/auth/google-calendar/disconnect", { method: "POST" });
      if (res.ok) router.refresh();
      else alert("Error al desconectar.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4 lg:p-6">
      <h1 className="text-2xl font-bold text-white mb-1">Conectar mi calendar de llamadas</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Hola {nombre}. Conectá el Google Calendar donde se cargan tus llamadas (iClosed, Calendly,
        y las que cargás a mano). El CRM las cruza con iClosed y suma las externas al tracker —
        sin que tengas que cargarlas dos veces.
      </p>

      {flashError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          No se pudo conectar: <code>{flashError}</code>. Probá de nuevo.
        </div>
      )}
      {flashOk && (
        <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
          ✓ Conectado como <strong>{flashOk}</strong>. Los próximos eventos van a sincronizar
          automáticamente.
        </div>
      )}

      {token ? (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">{"\u{2705}"}</span>
            <div>
              <p className="text-white font-medium">Calendar conectado</p>
              <p className="text-xs text-[var(--muted)]">
                {token.google_email}
              </p>
            </div>
          </div>

          <dl className="text-xs text-[var(--muted)] space-y-1">
            <div className="flex justify-between">
              <dt>Conectado</dt>
              <dd>{new Date(token.connected_at).toLocaleString("es-AR")}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Último refresh</dt>
              <dd>{new Date(token.updated_at).toLocaleString("es-AR")}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Último sync</dt>
              <dd>
                {token.last_sync_at
                  ? `${new Date(token.last_sync_at).toLocaleString("es-AR")} ${
                      token.last_sync_ok === false ? "❌" : "✓"
                    }`
                  : "Pendiente del primer cron"}
              </dd>
            </div>
          </dl>

          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="mt-5 text-xs text-[var(--muted)] hover:text-red-300 underline"
          >
            {disconnecting ? "Desconectando..." : "Desconectar calendar"}
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-6 text-center">
          <p className="text-white mb-1">Tu calendar todavía no está conectado.</p>
          <p className="text-sm text-[var(--muted)] mb-6">
            Hacé click acá, elegí tu mail de Google donde tenés tus llamadas, y dale
            <em> Permitir</em>. Tarda 2 segundos.
          </p>
          <a
            href="/api/auth/google-calendar/start"
            className="inline-flex items-center gap-3 bg-white text-gray-900 hover:bg-gray-100 px-6 py-3 rounded-lg font-medium transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Conectar con Google
          </a>
          <p className="text-[10px] text-[var(--muted)] mt-5">
            Permisos solicitados: <strong>solo lectura</strong> de eventos de calendar. No vamos a
            escribir ni borrar nada de tu calendar.
          </p>
        </div>
      )}
    </div>
  );
}
