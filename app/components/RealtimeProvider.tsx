"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { useRealtimeMulti } from "@/lib/realtime";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface SaleEvent {
  id: string;
  closer_name: string;
  lead_name: string;
  programa: string;
  ticket_total: number;
  timestamp: number;
}

interface PaymentEvent {
  id: string;
  lead_name?: string;
  client_name?: string;
  monto_usd: number;
  numero_cuota: number;
  timestamp: number;
}

interface RealtimeContextValue {
  saleBannerQueue: SaleEvent[];
  dismissSale: (id: string) => void;
  paymentEvents: PaymentEvent[];
  agentTasksVersion: number;
  cobranzasVersion: number;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  saleBannerQueue: [],
  dismissSale: () => {},
  paymentEvents: [],
  agentTasksVersion: 0,
  cobranzasVersion: 0,
});

export function useRealtime() {
  return useContext(RealtimeContext);
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [saleBannerQueue, setSaleBannerQueue] = useState<SaleEvent[]>([]);
  const [paymentEvents, setPaymentEvents] = useState<PaymentEvent[]>([]);
  const [agentTasksVersion, setAgentTasksVersion] = useState(0);
  const [cobranzasVersion, setCobranzasVersion] = useState(0);

  const dismissSale = useCallback((id: string) => {
    setSaleBannerQueue((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleLeadInsert = useCallback((payload: RealtimePostgresChangesPayload<never>) => {
    if (payload.eventType !== "INSERT") return;
    const record = payload.new as Record<string, unknown>;
    if (record.estado !== "cerrado") return;

    const saleEvent: SaleEvent = {
      id: record.id as string,
      closer_name: (record.closer_name as string) ?? "Closer",
      lead_name: (record.nombre as string) ?? "Lead",
      programa: (record.programa_pitcheado as string) ?? "",
      ticket_total: (record.ticket_total as number) ?? 0,
      timestamp: Date.now(),
    };
    setSaleBannerQueue((prev) => [...prev, saleEvent]);
  }, []);

  const handlePaymentChange = useCallback((payload: RealtimePostgresChangesPayload<never>) => {
    const record = payload.new as Record<string, unknown>;
    if (!record || record.estado !== "pagado") return;

    const paymentEvent: PaymentEvent = {
      id: record.id as string,
      monto_usd: (record.monto_usd as number) ?? 0,
      numero_cuota: (record.numero_cuota as number) ?? 1,
      timestamp: Date.now(),
    };
    setPaymentEvents((prev) => [...prev.slice(-19), paymentEvent]);
  }, []);

  const handleAgentTaskUpdate = useCallback(() => {
    setAgentTasksVersion((v) => v + 1);
    setCobranzasVersion((v) => v + 1);
  }, []);

  const configs = useRef([
    {
      table: "leads",
      event: "INSERT" as const,
      filter: "estado=eq.cerrado",
      callback: handleLeadInsert,
    },
    {
      table: "payments",
      event: "*" as const,
      filter: "estado=eq.pagado",
      callback: handlePaymentChange,
    },
    {
      table: "agent_tasks",
      event: "UPDATE" as const,
      callback: handleAgentTaskUpdate,
    },
  ]);

  useRealtimeMulti(configs.current);

  return (
    <RealtimeContext.Provider
      value={{
        saleBannerQueue,
        dismissSale,
        paymentEvents,
        agentTasksVersion,
        cobranzasVersion,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}
