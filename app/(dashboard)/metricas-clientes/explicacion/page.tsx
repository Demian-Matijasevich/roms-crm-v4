export const dynamic = "force-dynamic";

export default function ExplicacionPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8 text-[var(--foreground)] leading-relaxed">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <h1 className="text-3xl font-bold">📘 Guía de Métricas de Clientes</h1>
        <button onClick={() => window.print()}
          className="bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-4 py-2 rounded-lg text-sm">
          🖨️ Imprimir / PDF
        </button>
      </div>

      <h1 className="text-3xl font-bold hidden print:block mb-2">Guía de Métricas de Clientes — ROMS</h1>
      <p className="text-sm text-[var(--muted)] mb-6">Cómo se calcula cada KPI y qué hay que cargar en el CRM para que funcionen.</p>

      <hr className="my-6 border-[var(--card-border)]" />

      <h2 className="text-xl font-bold text-[var(--purple-light)] mt-8 mb-2">1️⃣ Tasa de renovación</h2>
      <p className="mb-2"><b>Qué mide:</b> De los clientes que terminaron su programa, qué % decidió renovar.</p>
      <p className="mb-2"><b>Fórmula:</b> <code className="bg-white/5 px-2 py-1 rounded">clientes_que_renovaron / clientes_que_terminaron</code></p>
      <p className="mb-2"><b>Por qué importa:</b> Indica si el producto retiene clientes. Una tasa alta = los clientes ven valor y vuelven.</p>
      <p className="mb-2"><b>Qué cargar para que funcione:</b></p>
      <ul className="list-disc ml-6 mb-4 space-y-1">
        <li>Cada cliente tiene que estar en la tabla <code>clients</code> con <b>fecha_onboarding</b> (cuándo arrancó) y <b>total_dias_programa</b> (default 90).</li>
        <li>Cuando un cliente renueva, cargar la renovación en <b>/renovaciones</b> con <code>estado = pago</code> (o <code>cuota_1_pagada</code>).</li>
      </ul>

      <hr className="my-6 border-[var(--card-border)]" />

      <h2 className="text-xl font-bold text-[var(--red)] mt-8 mb-2">2️⃣ Churn rate</h2>
      <p className="mb-2"><b>Qué mide:</b> % de clientes que terminaron y NO renovaron, cancelaron o pidieron retirar acceso.</p>
      <p className="mb-2"><b>Fórmula:</b> <code className="bg-white/5 px-2 py-1 rounded">clientes_que_no_renovaron / clientes_que_terminaron</code></p>
      <p className="mb-2"><b>Por qué importa:</b> Es el "negativo" de la renovación. Si el churn es alto, perdemos clientes y necesitamos reponer más para crecer.</p>
      <p className="mb-2"><b>Qué cargar:</b></p>
      <ul className="list-disc ml-6 mb-4 space-y-1">
        <li>Marcar el <b>estado_contacto</b> de cada cliente que terminó: <code>respondio_renueva</code>, <code>no_renueva</code>, <code>retirar_acceso</code>, <code>no_responde</code>, <code>numero_invalido</code>.</li>
        <li>Cuando un cliente cancela definitivamente, marcar <code>estado = inactivo</code>.</li>
      </ul>

      <hr className="my-6 border-[var(--card-border)]" />

      <h2 className="text-xl font-bold text-[var(--green)] mt-8 mb-2">3️⃣ Tasa de éxito</h2>
      <p className="mb-2"><b>Qué mide:</b> % de clientes con flag <code>exito = true</code>. Es manual: lo marca el equipo cuando un cliente tuvo resultados claros.</p>
      <p className="mb-2"><b>Fórmula:</b> <code className="bg-white/5 px-2 py-1 rounded">clientes_con_exito / total_clientes</code></p>
      <p className="mb-2"><b>Por qué importa:</b> Indica cuántos casos podemos usar como testimonios y prueba social. También marca calidad del producto.</p>
      <p className="mb-2"><b>Qué cargar:</b></p>
      <ul className="list-disc ml-6 mb-4 space-y-1">
        <li>Por cada cliente, después de unas semanas, evaluarlo y marcar <b>exito = true</b> si tuvo buenos resultados.</li>
        <li>Si fue un caso problemático, marcar <b>pesadilla = true</b>.</li>
        <li>Esto se edita desde <code>/clientes</code> → click en el cliente → toggle de los flags.</li>
      </ul>

      <hr className="my-6 border-[var(--card-border)]" />

      <h2 className="text-xl font-bold text-blue-400 mt-8 mb-2">4️⃣ Clientes nuevos por mes</h2>
      <p className="mb-2"><b>Qué mide:</b> Cuántos clientes hicieron onboarding (arrancaron el programa) en cada mes.</p>
      <p className="mb-2"><b>Fórmula:</b> Cuenta de clientes con <code>fecha_onboarding</code> en cada mes.</p>
      <p className="mb-2"><b>Por qué importa:</b> Mide el ritmo de crecimiento. Sirve para hacer "cohort retention": ver cómo se comportan los que entraron en X mes.</p>
      <p className="mb-2"><b>Qué cargar:</b></p>
      <ul className="list-disc ml-6 mb-4 space-y-1">
        <li>Cuando se cierra una venta, crear el cliente en la tabla <code>clients</code> con <b>fecha_onboarding</b> = fecha del primer pago (o la fecha que arrancan en serio).</li>
        <li>Definir el <b>programa</b> y <b>total_dias_programa</b> (90 días para ROMS 7 / Consultoría, 120 para Omnipresencia / Multicuentas).</li>
      </ul>

      <hr className="my-6 border-[var(--card-border)]" />

      <h2 className="text-xl font-bold mt-8 mb-3">📋 Acción semanal de Mel</h2>
      <ol className="list-decimal ml-6 space-y-2 mb-6">
        <li>Entrar a <b>/clientes</b> y revisar los que vencen esta semana (cuenta días restantes).</li>
        <li>Por cada uno: ¿está en período de renovación? Marcar <b>estado_contacto</b>.</li>
        <li>Si renovó: cargar en <b>/renovaciones</b> con monto + tipo (resell / upsell).</li>
        <li>Si no renueva: cambiar <b>estado_contacto = no_renueva</b> y <b>estado = inactivo</b>.</li>
        <li>Para los activos: si tuvo resultados claros, marcar <b>exito = true</b>.</li>
      </ol>

      <hr className="my-6 border-[var(--card-border)]" />

      <h2 className="text-xl font-bold mt-8 mb-3">📊 Dónde ver las métricas</h2>
      <p className="mb-4">Todo se calcula automático en <b>/metricas-clientes</b>. Esa página tiene:</p>
      <ul className="list-disc ml-6 space-y-1 mb-6">
        <li>4 cards arriba con las 4 métricas principales.</li>
        <li>Tabla de cohort por mes (cuántos entraron, cuántos siguen activos, cuántos renovaron).</li>
        <li>Tabla por programa (ROMS 7 / Consultoría / etc.).</li>
        <li>Resumen de renovaciones registradas.</li>
      </ul>

      <p className="mt-8 text-sm text-[var(--muted)]">
        Versión 1.0 — actualizada 30/04/2026
      </p>

      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          a { color: black !important; }
          h1, h2, h3 { color: black !important; }
          code { background: #f0f0f0 !important; color: black !important; }
        }
      `}</style>
    </div>
  );
}
