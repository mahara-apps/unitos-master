import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Sub = { table: string; filter?: string; keys: string[][] };

export function useRealtimeInvalidate(subs: Sub[], enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || subs.length === 0) return;
    const channels = subs.map((s) => {
      const ch = supabase.channel(`rt:${s.table}:${s.filter ?? "all"}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ch as any)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: s.table, filter: s.filter },
          () => {
            for (const key of s.keys) qc.invalidateQueries({ queryKey: key });
          },
        )
        .subscribe();
      return ch;
    });
    return () => {
      for (const ch of channels) supabase.removeChannel(ch);
    };
  }, [qc, subs, enabled]);
}