// Mock data compartido para que las 5 variantes muestren lo mismo.
export const KPIS = [
  { label: "Cash Collected", value: "$48.230", delta: "+12,4%", positive: true },
  { label: "Ventas firmadas", value: "$172.500", delta: "+8,2%", positive: true },
  { label: "Refunds", value: "$2.130", delta: "−5,1%", positive: true },
  { label: "Cierre %", value: "34,8%", delta: "−2,1%", positive: false },
];

export const ROWS = [
  { name: "Manuel Pasaglia", program: "Omnipresencia", amount: "$18.000", closer: "Valentino", date: "25/05" },
  { name: "Iker Quesada", program: "Omnipresencia", amount: "$23.900", closer: "Valentino", date: "24/05" },
  { name: "Fernanda Márquez", program: "Consultoría", amount: "$3.000", closer: "Agustín", date: "24/05" },
  { name: "Griselda Perier", program: "Multicuentas", amount: "$20.000", closer: "Agustín", date: "22/05" },
  { name: "Federico Castillo", program: "Omnipresencia", amount: "$8.000", closer: "Valentino", date: "21/05" },
];

export const NAV = [
  { icon: "📊", label: "Dashboard" },
  { icon: "📞", label: "Prospectos" },
  { icon: "📋", label: "Llamadas" },
  { icon: "💰", label: "Cobranzas" },
  { icon: "💵", label: "Finanzas" },
  { icon: "🤖", label: "Asistente IA" },
];
