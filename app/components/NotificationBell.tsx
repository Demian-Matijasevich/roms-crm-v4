"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Notif {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string | null;
  link: string | null;
  leida: boolean;
  created_at: string;
}

const TIPO_EMOJI: Record<string, string> = {
  lead_frio: "🥶",
  refund: "↩",
  cuota_riesgo: "⚠️",
  apure: "⚡",
  venta: "💰",
  renovacion: "🔄",
  alerta: "🚨",
  info: "💡",
};

function timeAgo(date: string): string {
  const ms = Date.now() - new Date(date).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "hace " + sec + "s";
  const min = Math.floor(sec / 60);
  if (min < 60) return "hace " + min + "min";
  const hr = Math.floor(min / 60);
  if (hr < 24) return "hace " + hr + "h";
  const dia = Math.floor(hr / 24);
  return "hace " + dia + "d";
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifs(data.notifications || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000); // refresh cada minuto
    return () => clearInterval(interval);
  }, [fetchNotifs]);

  const unreadCount = notifs.filter((n) => !n.leida).length;

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setNotifs((prev) => prev.map((n) => ({ ...n, leida: true })));
  }

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, leida: true } : n));
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-lg"
        title="Notificaciones"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 w-80 max-h-[500px] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col" style={{ backdropFilter: "blur(20px)" }}>
            <div className="p-3 border-b border-[var(--card-border)] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Notificaciones</h3>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[10px] text-[var(--purple-light)] hover:text-white">
                  Marcar todas leídas
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading && notifs.length === 0 && (
                <p className="text-xs text-[var(--muted)] p-4 text-center">Cargando...</p>
              )}
              {!loading && notifs.length === 0 && (
                <p className="text-xs text-[var(--muted)] p-6 text-center">Sin notificaciones 🎉</p>
              )}
              {notifs.map((n) => {
                const Inner = (
                  <div className={`p-3 border-b border-[var(--card-border)]/40 hover:bg-white/5 cursor-pointer ${!n.leida ? "bg-white/[0.03]" : ""}`}>
                    <div className="flex gap-2">
                      <span className="text-base">{TIPO_EMOJI[n.tipo] || "💬"}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs ${!n.leida ? "text-white font-semibold" : "text-[var(--muted)]"}`}>
                          {n.titulo}
                        </p>
                        {n.mensaje && <p className="text-[10px] text-[var(--muted)] mt-0.5">{n.mensaje}</p>}
                        <p className="text-[9px] text-[var(--muted)] mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.leida && <span className="w-1.5 h-1.5 rounded-full bg-[var(--purple-light)] mt-1.5 flex-shrink-0" />}
                    </div>
                  </div>
                );
                if (n.link) {
                  return (
                    <Link
                      key={n.id}
                      href={n.link}
                      onClick={() => { markRead(n.id); setOpen(false); }}
                      className="block"
                    >
                      {Inner}
                    </Link>
                  );
                }
                return (
                  <div key={n.id} onClick={() => markRead(n.id)}>{Inner}</div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
