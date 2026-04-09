"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AuthSession } from "@/lib/types";
import { isPushSupported, subscribeToPush, getPushPermission } from "@/lib/push-notifications";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

function getNav(session: AuthSession): NavSection[] {
  const { is_admin, roles } = session;
  const isCloser = roles.includes("closer");
  const isSetter = roles.includes("setter");
  const isSeguimiento = roles.includes("seguimiento");

  if (is_admin) {
    const sections: NavSection[] = [
      {
        title: "PRINCIPAL",
        items: [
          { href: "/", label: "Dashboard", icon: "\u{1F4CA}" },
          { href: "/calendario", label: "Calendario", icon: "\u{1F4C5}" },
          { href: "/pipeline", label: "Pipeline", icon: "\u{1F4DE}" },
          { href: "/llamadas", label: "CRM Llamadas", icon: "\u{1F4CB}" },
          { href: "/tesoreria", label: "Tesorer\u00eda", icon: "\u{1F3E6}" },
        ],
      },
      {
        title: "CLIENTES",
        items: [
          { href: "/clientes", label: "Base de Clientes", icon: "\u{1F465}" },
          { href: "/seguimiento", label: "Seguimiento", icon: "\u{1F4C8}" },
          { href: "/tracker", label: "Tracker 1a1", icon: "\u{1F3AF}" },
          { href: "/renovaciones", label: "Renovaciones", icon: "\u267B\uFE0F" },
        ],
      },
      {
        title: "COBRANZAS",
        items: [
          { href: "/cobranzas", label: "Cola de Cobranzas", icon: "\u{1F4B0}" },
        ],
      },
      {
        title: "ANALYTICS",
        items: [
          { href: "/closers", label: "Closers Analytics", icon: "\u{1F3C6}" },
          { href: "/leaderboard", label: "Leaderboard", icon: "\u{1F947}" },
          { href: "/scorecard", label: "Scorecard", icon: "\u{1F4CA}" },
          { href: "/funnel", label: "Funnel", icon: "\u{1F504}" },
          { href: "/comparativa", label: "Comparativa", icon: "\u{1F4CA}" },
          { href: "/ig-metrics", label: "IG Metrics", icon: "\u{1F4F1}" },
          { href: "/reportes", label: "Reportes Diarios", icon: "\u{1F4DD}" },
          { href: "/reportes/marzo-2026", label: "Reporte Mar 2026", icon: "\u{1F4C4}" },
        ],
      },
      {
        title: "HERRAMIENTAS",
        items: [
          { href: "/form/llamada", label: "Cargar Llamada", icon: "\u{1F4DE}" },
          { href: "/form/pago", label: "Cargar Pago", icon: "\u{1F4B3}" },
          { href: "/form/venta-chat", label: "Venta por Chat", icon: "\u{1F4AC}" },
          { href: "/form/reporte-setter", label: "Reporte Setter", icon: "\u{1F4DD}" },
          { href: "/utm", label: "UTM Builder", icon: "\u{1F517}" },
        ],
      },
      {
        title: "CONFIG",
        items: [
          { href: "/admin", label: "Admin Panel", icon: "\u2699\uFE0F" },
        ],
      },
    ];
    return sections;
  }

  if (isSeguimiento) {
    return [
      {
        title: "SEGUIMIENTO",
        items: [
          { href: "/", label: "Cola de Seguimientos", icon: "\u{1F4CB}" },
          { href: "/clientes", label: "Clientes", icon: "\u{1F465}" },
          { href: "/tracker", label: "Tracker 1a1", icon: "\u{1F3AF}" },
        ],
      },
    ];
  }

  if (isCloser && isSetter) {
    return [
      {
        title: "MI PANEL",
        items: [
          { href: "/", label: "Mi Dashboard", icon: "\u{1F4CA}" },
          { href: "/pipeline", label: "Mi Pipeline", icon: "\u{1F4DE}" },
          { href: "/leaderboard", label: "Leaderboard", icon: "\u{1F947}" },
        ],
      },
      {
        title: "ACCIONES",
        items: [
          { href: "/form/llamada", label: "Cargar Llamada", icon: "\u{1F4DE}" },
          { href: "/form/venta-chat", label: "Venta por Chat", icon: "\u{1F4AC}" },
          { href: "/form/reporte-setter", label: "Reporte Diario", icon: "\u{1F4DD}" },
        ],
      },
    ];
  }

  if (isCloser) {
    return [
      {
        title: "MI PANEL",
        items: [
          { href: "/", label: "Mi Dashboard", icon: "\u{1F4CA}" },
          { href: "/pipeline", label: "Mi Pipeline", icon: "\u{1F4DE}" },
          { href: "/leaderboard", label: "Leaderboard", icon: "\u{1F947}" },
        ],
      },
      {
        title: "ACCIONES",
        items: [
          { href: "/form/llamada", label: "Cargar Llamada", icon: "\u{1F4DE}" },
        ],
      },
    ];
  }

  // Setter only
  return [
    {
      title: "MI PANEL",
      items: [
        { href: "/", label: "Mi Dashboard", icon: "\u{1F4CA}" },
        { href: "/leaderboard", label: "Leaderboard", icon: "\u{1F947}" },
      ],
    },
    {
      title: "ACCIONES",
      items: [
        { href: "/form/venta-chat", label: "Venta por Chat", icon: "\u{1F4AC}" },
        { href: "/form/reporte-setter", label: "Reporte Diario", icon: "\u{1F4DD}" },
      ],
    },
  ];
}

interface BottomNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  isMore?: boolean;
}

function getBottomNav(session: AuthSession): BottomNavItem[] {
  const { is_admin, roles } = session;

  const HomeIcon = (
    <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
  const PipeIcon = (
    <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
  const CobranzasIcon = (
    <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
  const ClientesIcon = (
    <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
  const MoreIcon = (
    <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );

  if (is_admin) {
    return [
      { href: "/", label: "Home", icon: HomeIcon },
      { href: "/pipeline", label: "Pipeline", icon: PipeIcon },
      { href: "/cobranzas", label: "Cobranzas", icon: CobranzasIcon },
      { href: "/clientes", label: "Clientes", icon: ClientesIcon },
      { href: "#more", label: "Mas", icon: MoreIcon, isMore: true },
    ];
  }

  if (roles.includes("seguimiento")) {
    return [
      { href: "/", label: "Home", icon: HomeIcon },
      { href: "/clientes", label: "Clientes", icon: ClientesIcon },
      { href: "/tracker", label: "Tracker", icon: PipeIcon },
      { href: "#more", label: "Mas", icon: MoreIcon, isMore: true },
    ];
  }

  return [
    { href: "/", label: "Home", icon: HomeIcon },
    { href: "/pipeline", label: "Pipeline", icon: PipeIcon },
    { href: "/leaderboard", label: "Ranking", icon: CobranzasIcon },
    { href: "#more", label: "Mas", icon: MoreIcon, isMore: true },
  ];
}

export default function Sidebar({ session }: { session: AuthSession }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState<"idle" | "enabled" | "denied" | "unsupported">("idle");
  const nav = getNav(session);
  const bottomNav = getBottomNav(session);

  // Swipe handling
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY.current);

    // Only handle horizontal swipes (not vertical scrolling)
    if (deltaY > Math.abs(deltaX)) return;

    // Swipe right from left edge to open
    if (deltaX > 80 && touchStartX.current < 30 && !open) {
      setOpen(true);
    }
    // Swipe left to close
    if (deltaX < -80 && open) {
      setOpen(false);
    }
  }, [open]);

  useEffect(() => {
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!isPushSupported()) {
      setPushStatus("unsupported");
      return;
    }
    const perm = getPushPermission();
    if (perm === "granted") setPushStatus("enabled");
    else if (perm === "denied") setPushStatus("denied");
  }, []);

  const handleEnablePush = async () => {
    const success = await subscribeToPush(session.team_member_id);
    setPushStatus(success ? "enabled" : "denied");
  };

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-[var(--card-bg)] border-b border-[var(--card-border)] flex items-center justify-between px-4 z-40">
        <button onClick={() => setOpen(true)} className="text-white text-xl min-h-[44px] flex items-center">{"\u2630"}</button>
        <span className="text-white font-semibold">ROMS CRM</span>
        <div className="w-6" />
      </div>

      {/* Overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 bg-black/60 z-50 animate-fade-in" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 w-64 bg-[var(--card-bg)] border-r border-[var(--card-border)] z-50 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 overflow-y-auto`}
      >
        <div className="p-4 border-b border-[var(--card-border)]">
          <h2 className="text-lg font-bold text-white">ROMS CRM</h2>
          <p className="text-xs text-[var(--muted)]">{session.nombre} — {session.roles.join(", ")}</p>
        </div>

        <nav className="p-2">
          {nav.map((section) => (
            <div key={section.title} className="mb-4">
              <p className="px-3 py-1 text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                {section.title}
              </p>
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all duration-200 ${
                      active
                        ? "sidebar-item-active text-[var(--purple-light)] font-medium"
                        : "text-[var(--muted)] hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-[var(--card-border)] mt-auto space-y-2">
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--muted)] hover:text-white hover:bg-white/5 rounded-lg transition-colors w-full"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>Buscar</span>
            <kbd className="ml-auto px-1.5 py-0.5 text-[10px] bg-white/5 border border-[var(--card-border)] rounded">
              Cmd+K
            </kbd>
          </button>
          {pushStatus === "idle" && (
            <button
              onClick={handleEnablePush}
              className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--muted)] hover:text-white hover:bg-purple-900/30 rounded-lg transition-colors w-full"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Habilitar notificaciones
            </button>
          )}
          {pushStatus === "enabled" && (
            <span className="flex items-center gap-2 px-3 py-2 text-sm text-green-400">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              Notificaciones activas
            </span>
          )}
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-[var(--muted)] hover:text-[var(--red)] transition-colors"
          >
            {"\u{1F6AA}"} Salir
          </button>
        </div>
      </aside>

      {/* Bottom navigation bar - mobile only (visibility controlled by .bottom-nav in globals.css) */}
      <div className="bottom-nav">
        {bottomNav.map((item) => {
          const active = !item.isMore && pathname === item.href;
          if (item.isMore) {
            return (
              <button
                key="more"
                onClick={() => setOpen(true)}
                className="bottom-nav-item"
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          }
          return (
            <a
              key={item.href}
              href={item.href}
              className={`bottom-nav-item ${active ? "active" : ""}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </div>
    </>
  );
}
