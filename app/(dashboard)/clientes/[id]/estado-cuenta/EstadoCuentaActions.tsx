"use client";

export default function EstadoCuentaActions({ clientId }: { clientId: string }) {
  return (
    <div className="print:hidden mb-6 flex gap-3">
      <button
        onClick={() => window.print()}
        className="px-4 py-2 bg-[var(--purple)] text-white rounded-lg text-sm hover:bg-[var(--purple-dark)]"
      >
        Imprimir / Guardar PDF
      </button>
      <a
        href={`/clientes/${clientId}`}
        className="px-4 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] text-white rounded-lg text-sm hover:bg-white/10"
      >
        Volver al cliente
      </a>
    </div>
  );
}
