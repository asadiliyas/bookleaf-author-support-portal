"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { browserSupabase } from "@/lib/client/supabase";

type WatchedTable = "tickets" | "ticket_messages" | "ticket_internal_notes" | "ticket_events";

export interface RealtimeWatch {
  table: WatchedTable;
  /** PostgREST-style filter, e.g. `ticket_id=eq.<uuid>` or `author_id=eq.AUTH003`. */
  filter?: string;
}

export interface RealtimeEvent {
  table: WatchedTable;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  record: Record<string, unknown>;
}

/**
 * Subscribes to row changes and invalidates the given React Query keys, so
 * the UI re-fetches through the REST API (realtime is a signal, the API is
 * the source of truth). Returns whether the channel is live; callers fall
 * back to polling when it isn't.
 */
export function useRealtime(
  channelName: string,
  watches: RealtimeWatch[],
  invalidate: QueryKey[],
  onEvent?: (event: RealtimeEvent) => void,
): boolean {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  const onEventRef = useRef(onEvent);
  const invalidateRef = useRef(invalidate);

  useEffect(() => {
    onEventRef.current = onEvent;
    invalidateRef.current = invalidate;
  });

  const signature = JSON.stringify(watches);

  useEffect(() => {
    const supabase = browserSupabase();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`${channelName}:${Math.random().toString(36).slice(2)}`);

    for (const w of JSON.parse(signature) as RealtimeWatch[]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: w.table, ...(w.filter ? { filter: w.filter } : {}) },
        (payload) => {
          onEventRef.current?.({
            table: w.table,
            eventType: payload.eventType as RealtimeEvent["eventType"],
            record: (payload.new ?? {}) as Record<string, unknown>,
          });
          // Coalesce bursts (e.g. message insert + ticket update) into one refetch.
          clearTimeout(timer);
          timer = setTimeout(() => {
            for (const key of invalidateRef.current) queryClient.invalidateQueries({ queryKey: key });
          }, 150);
        },
      );
    }

    (async () => {
      // Make sure realtime uses the signed-in user's JWT so RLS applies.
      const { data } = await supabase.auth.getSession();
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel.subscribe((status) => setLive(status === "SUBSCRIBED"));
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setLive(false);
      supabase.removeChannel(channel);
    };
  }, [channelName, signature, queryClient]);

  return live;
}

/** Polling interval to use when realtime is not connected. */
export function fallbackInterval(live: boolean, ms = 20_000): number | false {
  return live ? false : ms;
}
