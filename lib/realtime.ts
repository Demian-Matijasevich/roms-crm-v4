"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type PostgresChangeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

interface SubscriptionConfig {
  table: string;
  schema?: string;
  event?: PostgresChangeEvent;
  filter?: string;
}

export function useRealtimeSubscription<T extends Record<string, unknown>>(
  config: SubscriptionConfig,
  callback: (payload: RealtimePostgresChangesPayload<T>) => void,
  enabled: boolean = true
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const supabase = getSupabaseBrowser();
    const channelName = `realtime-${config.table}-${config.event ?? "all"}-${Date.now()}`;

    const channelConfig: Record<string, string> = {
      event: config.event ?? "*",
      schema: config.schema ?? "public",
      table: config.table,
    };

    if (config.filter) {
      channelConfig.filter = config.filter;
    }

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes" as never,
        channelConfig,
        (payload: RealtimePostgresChangesPayload<T>) => {
          callbackRef.current(payload);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [config.table, config.schema, config.event, config.filter, enabled]);

  return channelRef;
}

export function useRealtimeMulti(
  configs: Array<SubscriptionConfig & { callback: (payload: RealtimePostgresChangesPayload<never>) => void }>,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled || configs.length === 0) return;

    const supabase = getSupabaseBrowser();
    const channelName = `realtime-multi-${Date.now()}`;
    let channel = supabase.channel(channelName);

    for (const config of configs) {
      const channelConfig: Record<string, string> = {
        event: config.event ?? "*",
        schema: config.schema ?? "public",
        table: config.table,
      };
      if (config.filter) {
        channelConfig.filter = config.filter;
      }
      channel = channel.on("postgres_changes" as never, channelConfig, config.callback);
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, configs.length]);
}
