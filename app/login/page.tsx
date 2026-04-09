"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const TEAM = [
  { nombre: "Fran", role: "admin", color: "#3b82f6" },
  { nombre: "Juanma", role: "admin", color: "#3b82f6" },
  { nombre: "Valentino", role: "closer+setter", color: "#8b5cf6" },
  { nombre: "Agust\u00edn", role: "closer", color: "#60a5fa" },
  { nombre: "Juan Mart\u00edn", role: "closer", color: "#60a5fa" },
  { nombre: "Fede", role: "closer", color: "#60a5fa" },
  { nombre: "Guille", role: "setter", color: "#22c55e" },
];

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function getRoleLabel(role: string) {
  const map: Record<string, string> = {
    admin: "Admin",
    closer: "Closer",
    setter: "Setter",
    "closer+setter": "Closer + Setter",
  };
  return map[role] ?? role;
}

export default function LoginPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [pin, setPin] = useState<string[]>(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const selectedMember = TEAM.find((t) => t.nombre === selected);

  const fullPin = pin.join("");

  const handleLogin = useCallback(async () => {
    const joinedPin = pin.join("");
    if (!selected || joinedPin.length !== 4) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: selected, pin: joinedPin }),
    });

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || "Error al iniciar sesi\u00f3n");
      setPin(["", "", "", ""]);
      setLoading(false);
      pinRefs.current[0]?.focus();
    }
  }, [selected, pin, router]);

  // Auto-submit when all 4 digits are filled
  useEffect(() => {
    if (fullPin.length === 4 && !loading) {
      handleLogin();
    }
  }, [fullPin, loading, handleLogin]);

  function handlePinChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newPin = [...pin];
    newPin[index] = digit;
    setPin(newPin);
    setError("");

    // Auto-focus next box
    if (digit && index < 3) {
      pinRefs.current[index + 1]?.focus();
    }
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      pinRefs.current[index - 1]?.focus();
      const newPin = [...pin];
      newPin[index - 1] = "";
      setPin(newPin);
    }
    if (e.key === "Enter") {
      handleLogin();
    }
  }

  function handlePinPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (pasted.length === 4) {
      setPin(pasted.split(""));
      pinRefs.current[3]?.focus();
    }
  }

  function selectUser(nombre: string) {
    setSelected(nombre);
    setPin(["", "", "", ""]);
    setError("");
    setTimeout(() => pinRefs.current[0]?.focus(), 100);
  }

  return (
    <div className="login-bg flex items-center justify-center p-4">
      <div className="relative z-10 w-full max-w-md space-y-8 animate-fade-in">
        {/* Brand */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl md:text-5xl font-black login-brand tracking-tight">
            ROMS CRM
          </h1>
          <p className="text-sm text-zinc-400">
            Sistema de Gesti\u00f3n — 7ROMS
          </p>
        </div>

        {/* Team member cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TEAM.map((t) => {
            const isSelected = selected === t.nombre;
            return (
              <button
                key={t.nombre}
                onClick={() => selectUser(t.nombre)}
                className={`group flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 min-h-[100px] ${
                  isSelected
                    ? "border-[var(--purple)] bg-[var(--purple)]/10 scale-[1.02]"
                    : "border-[var(--card-border)] bg-[var(--card-bg)]/60 backdrop-blur-sm hover:border-[var(--purple)]/40 hover:bg-white/5"
                }`}
              >
                {/* Avatar circle */}
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm transition-all duration-200 ${
                    isSelected ? "animate-float" : "group-hover:scale-110"
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${t.color}, ${t.color}88)`,
                    boxShadow: isSelected ? `0 0 20px ${t.color}44` : "none",
                  }}
                >
                  {getInitials(t.nombre)}
                </div>
                {/* Name */}
                <span className={`text-sm font-medium ${isSelected ? "text-white" : "text-zinc-300"}`}>
                  {t.nombre}
                </span>
                {/* Role tag */}
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: `${t.color}20`,
                    color: t.color,
                  }}
                >
                  {getRoleLabel(t.role)}
                </span>
              </button>
            );
          })}
        </div>

        {/* PIN input */}
        {selected && (
          <div className="space-y-4 animate-slide-up">
            <p className="text-center text-zinc-400 text-sm">
              PIN de <span className="text-white font-medium">{selected}</span>
            </p>

            {/* 4 separate PIN boxes */}
            <div className="flex justify-center gap-3" onPaste={handlePinPaste}>
              {pin.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { pinRefs.current[i] = el; }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handlePinChange(i, e.target.value)}
                  onKeyDown={(e) => handlePinKeyDown(i, e)}
                  className={`pin-box ${digit ? "filled" : ""}`}
                  autoFocus={i === 0}
                />
              ))}
            </div>

            {/* Error */}
            {error && (
              <p className="text-[var(--red)] text-sm text-center animate-fade-in">{error}</p>
            )}

            {/* Submit button */}
            <button
              onClick={handleLogin}
              disabled={fullPin.length !== 4 || loading}
              className="w-full p-3.5 rounded-xl font-semibold text-white transition-all duration-200 disabled:opacity-40 min-h-[48px] flex items-center justify-center gap-2"
              style={{
                background: selectedMember
                  ? `linear-gradient(135deg, ${selectedMember.color}, ${selectedMember.color}cc)`
                  : "var(--purple)",
              }}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spinner" />
                  <span>Entrando...</span>
                </>
              ) : (
                "Entrar"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
