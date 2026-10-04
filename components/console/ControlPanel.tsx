"use client";

import { Eye, Fingerprint, KeyRound, OctagonX, Pause, Play, RotateCcw, Send, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CONTROL_KEYS, type ControlKey, type Controls, type RunSnapshot } from "@/lib/engine/types";
import { cn } from "@/lib/utils";

const CONTROL_ICON: Record<ControlKey, typeof Fingerprint> = {
  identity: Fingerprint,
  secrets: KeyRound,
  egress: Send,
  monitor: Eye,
  breaker: Zap,
};

// Plain-language: what each control is, in one line.
const CONTROL_COPY: Record<ControlKey, { name: string; what: string }> = {
  identity: { name: "Agent identity", what: "Provisions its own scoped, short-lived identity - so it reads what it needs legitimately and never needs a shared password or borrowed token." },
  secrets: { name: "Secrets protection", what: "Strips credentials out of anything the agent reads, so they can't be reused." },
  egress: { name: "Egress approval", what: "Blocks restricted data from being sent to outside destinations." },
  monitor: { name: "Action monitor", what: "Flags the attack pattern in real time. Alerts, but does not block." },
  breaker: { name: "Circuit breaker", what: "Auto-stops the agent when it escalates its own access." },
};

const MODELS = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
  { id: "claude-opus-5", label: "Opus 5" },
];

interface Props {
  controls: Controls;
  snapshot: RunSnapshot | null;
  model: string;
  modelAvailable: boolean;
  onToggle: (key: ControlKey, value: boolean) => void;
  onAll: (on: boolean) => void;
  onReplay: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onStop: () => void;
  onModel: (m: string) => void;
}

export function ControlPanel(p: Props) {
  const status = p.snapshot?.status;
  const running = status === "RUNNING";
  const live = running || status === "PAUSED";
  const enabledCount = CONTROL_KEYS.filter((k) => p.controls[k]).length;

  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-panel">
      <section className="shrink-0 p-5 pb-4">
        <div className="flex gap-2">
          <Button size="lg" className="flex-1 text-base" onClick={p.onReplay}>
            <Play className="size-5!" /> {running ? "Restart" : "Run agent"}
          </Button>
          {status === "PAUSED" ? (
            <Button variant="outline" size="lg" onClick={p.onResume} aria-label="Resume">
              <Play />
            </Button>
          ) : (
            <Button variant="outline" size="lg" onClick={p.onPause} disabled={!running} aria-label="Pause">
              <Pause />
            </Button>
          )}
          <Button variant="outline" size="lg" onClick={p.onReset} aria-label="Reset">
            <RotateCcw />
          </Button>
        </div>
        <p className="mt-2 px-0.5 text-[0.8rem] leading-snug text-muted">
          A live AI agent runs a month-end close. Off, it follows a poisoned runbook into a breach. Turn controls on and run again to contain it.
        </p>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-4 scroll-thin">
        <div className="mb-2 flex items-center justify-between px-0.5">
          <h2 className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted">Runtime controls</h2>
          <span className="font-mono text-[0.7rem] text-muted">{enabledCount}/5 on</span>
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => p.onAll(false)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              enabledCount === 0 ? "border-danger/50 bg-danger/10 text-danger" : "border-line text-muted hover:text-fg",
            )}
          >
            All off
          </button>
          <button
            onClick={() => p.onAll(true)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              enabledCount === 5 ? "border-ok/50 bg-ok/10 text-ok" : "border-line text-muted hover:text-fg",
            )}
          >
            All on
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {CONTROL_KEYS.map((k) => {
            const Icon = CONTROL_ICON[k];
            const on = p.controls[k];
            return (
              <label
                key={k}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                  on ? "border-ok/30 bg-ok/[0.06]" : "border-line bg-panel-2/60 hover:border-muted/40",
                )}
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", on ? "text-ok" : "text-muted")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9rem] font-semibold">{CONTROL_COPY[k].name}</span>
                  <span className="mt-0.5 block text-[0.76rem] leading-snug text-muted">{CONTROL_COPY[k].what}</span>
                </span>
                <Switch checked={on} onCheckedChange={(v) => p.onToggle(k, v)} aria-label={CONTROL_COPY[k].name} />
              </label>
            );
          })}
        </div>
      </section>

      <section className="flex shrink-0 flex-col gap-3 border-t border-line p-5 pt-4">
        <Button variant="danger" size="lg" className="w-full font-semibold tracking-wide" onClick={p.onStop} disabled={!live}>
          <OctagonX className="size-5!" /> STOP AGENT
        </Button>
        {p.modelAvailable && (
          <div className="flex items-center gap-2 px-0.5">
            <span className="font-mono text-[0.7rem] uppercase tracking-wide text-muted">Model</span>
            <div className="flex flex-1 gap-1 rounded-md border border-line bg-panel-2 p-0.5">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => p.onModel(m.id)}
                  className={cn(
                    "flex-1 rounded px-2 py-1 font-mono text-[0.72rem] transition-colors",
                    p.model === m.id ? "bg-line text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-start gap-2 rounded-md border border-line bg-panel-2 p-2.5 text-[0.72rem] leading-snug text-muted">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ctl" />
          Training simulation. Every system, credential and message is synthetic and in-process - no network, no real accounts.
        </div>
      </section>
    </aside>
  );
}
