"use client";

import { useState, useRef, useEffect } from "react";
import type { AuthSession } from "@/lib/types";
import { useToast } from "@/app/components/Toast";

interface Msg {
  role: "user" | "assistant" | "error";
  content: string;
  ts: number;
  ms?: number;
}

const SUGERENCIAS = [
  "¿Cuánto vendimos este mes?",
  "¿Quiénes son los top 5 clientes que más debemos cobrar esta semana?",
  "¿Cómo viene el cash collected vs el mes pasado?",
  "Resumime los refunds del mes con sus causas",
  "¿Qué closer está vendiendo más este mes?",
  "¿Cuántos prospectos tengo en estado 'respondió' sin agendar?",
];

export default function AsistenteClient({ session }: { session: AuthSession }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  async function copyAnswer(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setInput("");
    const userMsg: Msg = { role: "user", content: q, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.answer) {
        setMessages((prev) => [...prev, { role: "assistant", content: json.answer, ts: Date.now(), ms: json.ms }]);
      } else if (res.status === 503) {
        setMessages((prev) => [...prev, {
          role: "error",
          content: `El asistente IA no está configurado todavía.\n\nPara activarlo, deployá el microservicio en el VPS (ver \`ops/ai-proxy/README.md\`) y agregá las variables \`AI_PROXY_URL\` y \`AI_PROXY_TOKEN\` en Vercel.`,
          ts: Date.now(),
        }]);
      } else {
        setMessages((prev) => [...prev, {
          role: "error",
          content: `Error: ${json.error || "no se pudo responder"}${json.details ? "\n\n" + JSON.stringify(json.details, null, 2) : ""}`,
          ts: Date.now(),
        }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: "error",
        content: "Error de conexión: " + (err instanceof Error ? err.message : String(err)),
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          🤖 Asistente del CRM
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Hola {session.nombre}. Preguntame lo que quieras sobre los datos del CRM — uso solo la data de la app, no invento.
        </p>
      </div>

      {/* Mensajes */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">Probá una de estas preguntas:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm bg-[var(--background)] border border-[var(--card-border)] hover:border-[var(--purple)]/60 rounded-lg px-3 py-2 text-[var(--foreground)] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.ts}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`group max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap relative ${
                m.role === "user"
                  ? "bg-[var(--purple)]/15 border border-[var(--purple)]/40 text-white"
                  : m.role === "error"
                  ? "bg-[var(--red)]/10 border border-[var(--red)]/40 text-[var(--red)]"
                  : "bg-[var(--background)] border border-[var(--card-border)] text-[var(--foreground)]"
              }`}
            >
              {m.content}
              {m.role === "assistant" && (
                <button
                  type="button"
                  onClick={() => copyAnswer(m.content)}
                  aria-label="Copiar respuesta"
                  className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 text-[10px] text-[var(--muted)] hover:text-white bg-[var(--card-bg)] border border-[var(--card-border)] rounded px-1.5 py-0.5"
                >
                  📋
                </button>
              )}
              {m.ms !== undefined && (
                <p className="text-[10px] text-[var(--muted)] mt-2">
                  {(m.ms / 1000).toFixed(1)}s
                </p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-4 py-3 text-sm text-[var(--muted)] flex items-center gap-2">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--purple-light)] animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--purple-light)] animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--purple-light)] animate-bounce" />
              </span>
              <span>Leyendo la data del CRM...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="mt-4 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Preguntá algo sobre el CRM..."
          disabled={loading}
          className="flex-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)] placeholder:text-[var(--muted)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-[var(--purple)] hover:bg-[var(--purple-dark)] disabled:opacity-40 text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors"
        >
          {loading ? "..." : "Enviar"}
        </button>
      </form>
    </div>
  );
}
