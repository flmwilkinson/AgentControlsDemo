"use client";

import { useCallback, useEffect, useState } from "react";
import type { Controls, PresetId, RunSnapshot, TraceEvent } from "@/lib/engine/types";

interface StreamMessage {
  type: "state";
  snapshot: RunSnapshot | null;
  events: TraceEvent[];
  reset: boolean;
}

export type Command =
  | { command: "start"; controls: Controls; preset: PresetId; speed: 1 | 2; useModel?: boolean; posture?: "guarded" | "pressured"; model?: string }
  | { command: "pause" | "resume" | "reset" | "stop" }
  | { command: "speed"; speed: 1 | 2 };

/** Subscribes to the server's SSE stream. The server owns all run state. */
export function useRunStream() {
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [modelInfo, setModelInfo] = useState<{ model_available: boolean; model: string | null }>({ model_available: false, model: null });

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setModelInfo).catch(() => {});
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      const msg = JSON.parse(m.data) as StreamMessage;
      setSnapshot(msg.snapshot);
      setEvents((prev) => {
        if (msg.reset) return msg.events;
        const last = prev.length ? prev[prev.length - 1].seq : 0;
        const sameRun = !prev.length || !msg.events.length || prev[0].run_id === msg.events[0].run_id;
        if (!sameRun) return msg.events;
        return [...prev, ...msg.events.filter((e) => e.seq > last)];
      });
    };
    return () => es.close();
  }, []);

  const send = useCallback(async (cmd: Command) => {
    await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  }, []);

  return { snapshot, events, connected, modelInfo, send };
}
