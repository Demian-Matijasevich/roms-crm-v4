export const COMMISSION_CLOSER = 0.10;
export const COMMISSION_SETTER = 0.05;
export const PROGRAM_DURATION_DAYS = 90;

export const PROGRAMS: Record<string, { label: string; mensual: number; pif: number | null }> = {
  roms_7: { label: "ROMS 7", mensual: 3000, pif: null },
  consultoria: { label: "Consultoría", mensual: 4000, pif: 10000 },
  omnipresencia: { label: "Omnipresencia", mensual: 7000, pif: 18000 },
  multicuentas: { label: "Multicuentas", mensual: 12000, pif: 30000 },
};

export const RECEPTORES = [
  "Mercado Pago", "Transferencia", "Cash", "Binance", "Stripe", "Wise",
];

export const LEAD_ESTADOS_LABELS: Record<string, string> = {
  pendiente: "⏳ Pendiente",
  no_show: "👤 No-Show",
  cancelada: "🚨 Cancelada",
  reprogramada: "🕒 Re-programada",
  seguimiento: "🔄 Seguimiento",
  no_calificado: "🚫 No Calificado",
  no_cierre: "⚠️ No Cierre",
  reserva: "💰 Reserva",
  cerrado: "🚀 Cerrado",
  adentro_seguimiento: "🔄 Adentro en Seguimiento",
  broke_cancelado: "❌ Broke/Cancelado",
};

export const CLIENT_ESTADOS_LABELS: Record<string, string> = {
  activo: "✅ Activo",
  pausado: "⏸️ Pausado",
  inactivo: "❌ Inactivo",
  solo_skool: "📚 Solo Skool",
  no_termino_pagar: "💸 No Terminó de Pagar",
};
