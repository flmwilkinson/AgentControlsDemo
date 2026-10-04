"use client";

import { motion } from "framer-motion";
import { Brain, Check, Eye, Fingerprint, KeyRound, OctagonX, Send, ShieldAlert, ShieldCheck, Waypoints, X, Zap, type LucideIcon } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { SCORE_RULES } from "@/lib/engine/scoring";
import type { ControlKey, RunSnapshot, Severity } from "@/lib/engine/types";
import { cn } from "@/lib/utils";

export const SEVERITY_TONE: Record<Severity, BadgeTone> = { info: "info", low: "neutral", medium: "warn", high: "danger", critical: "critical" };

function scoreColor(score: number) {
  if (score >= 7) return "var(--crit)";
  if (score > 0) return "var(--warn)";
  return "var(--ok)";
}

const CONTROL_ICON: Record<ControlKey, LucideIcon> = { identity: Fingerprint, secrets: KeyRound, egress: Send, monitor: Eye, breaker: Zap };
const CONTROL_NAME: Record<ControlKey, string> = {
  identity: "Agent identity",
  secrets: "Secrets protection",
  egress: "Egress approval",
  monitor: "Action monitor",
  breaker: "Circuit breaker",
};

interface ControlActivity {
  key: ControlKey;
  enabled: boolean;
  fired: boolean;
  note: string;
}

/** Derive, from the snapshot, whether each control fired this run and what it did. */
function controlActivity(s: RunSnapshot | null): ControlActivity[] {
  const c = s?.controls;
  const rejectedCreds = (s?.identities ?? []).filter((i) => !i.accepted && i.principal !== "month-end-recon-agent").length;
  const identityRejections =
    rejectedCreds + (s?.identities ?? []).filter((i) => !i.accepted && /legacy|bearer|peer/i.test(i.method)).length;
  const redactions = (s?.secrets ?? []).filter((x) => x.redacted).length;
  const blockedEgress = (s?.external ?? []).filter((e) => e.outcome === "BLOCKED").length;
  const alerts = s?.alerts.length ?? 0;
  const critical = s?.alerts.some((a) => a.severity === "critical") ?? false;
  const tripped = !!s?.incident && s.incident.trigger_source === "automated_rule";
  return [
    { key: "identity", enabled: !!c?.identity, fired: !!c?.identity, note: identityRejections > 0 ? `Verified access on its own identity; rejected ${identityRejections} borrowed credential${identityRejections === 1 ? "" : "s"}` : "Provisioned its own scoped identity for legitimate access" },
    { key: "secrets", enabled: !!c?.secrets, fired: !!c?.secrets && redactions > 0, note: `Redacted ${redactions} credential${redactions === 1 ? "" : "s"} in tool output` },
    { key: "egress", enabled: !!c?.egress, fired: !!c?.egress && blockedEgress > 0, note: `Blocked ${blockedEgress} external transfer${blockedEgress === 1 ? "" : "s"}` },
    { key: "monitor", enabled: !!c?.monitor, fired: !!c?.monitor && alerts > 0, note: critical ? `Raised the critical attack-chain alert (${alerts} total)` : `Raised ${alerts} alert${alerts === 1 ? "" : "s"}` },
    { key: "breaker", enabled: !!c?.breaker, fired: tripped, note: tripped ? `Tripped - ${s!.incident!.trigger}` : "" },
  ];
}

export function RiskPanel({ snapshot }: { snapshot: RunSnapshot | null }) {
  const score = snapshot?.blast.score ?? 0;
  const max = snapshot?.blast.max ?? 10;
  const items = snapshot?.blast.items ?? SCORE_RULES.map((r) => ({ ...r, status: "not_reached" as const, note: undefined }));
  const activity = controlActivity(snapshot);
  const anyEnabled = activity.some((a) => a.enabled);
  const t = snapshot?.telemetry;
  const memCredRefs = (snapshot?.memory.entries ?? []).filter((e) => /token|credential/i.test(e.key)).length;
  const systems = snapshot?.systems_touched.length ?? 0;
  const identities = new Set((snapshot?.identities ?? []).map((i) => i.principal)).size;
  const secretsN = snapshot?.secrets.length ?? 0;
  const externalN = snapshot?.external.length ?? 0;
  const exfil = snapshot?.external.some((e) => e.outcome === "SIMULATED_SEND");

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-l border-line bg-panel p-4 scroll-thin">
      {/* Blast radius */}
      <section className="rounded-lg border border-line bg-panel-2 p-4">
        <div className="flex items-center gap-4">
          <Gauge score={score} max={max} />
          <div className="min-w-0">
            <div className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">Blast radius</div>
            <div className="mt-1 text-sm leading-snug text-muted">What the agent managed to do. Illustrative teaching score, not a risk methodology.</div>
          </div>
        </div>
        <ul className="mt-3 flex flex-col gap-1">
          {items.map((it) => (
            <li
              key={it.rule}
              className={cn(
                "flex items-center gap-2 rounded px-2 py-1 text-sm transition-colors",
                it.status === "awarded" && "bg-crit/10",
                it.status === "prevented" && "bg-ok/5",
              )}
              title={it.note}
            >
              <span
                className={cn(
                  "w-8 shrink-0 font-mono font-bold",
                  it.status === "awarded" ? "text-crit" : it.status === "prevented" ? "text-ok line-through" : "text-muted/50",
                )}
              >
                +{it.points}
              </span>
              <span className={cn("flex-1 truncate", it.status === "not_reached" ? "text-muted" : "text-fg", it.status === "prevented" && "line-through decoration-ok/60")}>
                {it.label}
              </span>
              {it.status === "awarded" && <X className="size-4 text-crit" />}
              {it.status === "prevented" && (
                <span className="inline-flex items-center gap-1 font-mono text-[0.62rem] font-bold text-ok">
                  <Check className="size-3.5" /> STOPPED
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Controls this run - did each one fire? */}
      <section className="rounded-lg border border-line px-3 py-2.5">
        <div className="mb-2 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-muted">Controls this run</div>
        {!anyEnabled ? (
          <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/5 px-2.5 py-2 text-sm">
            <OctagonX className="size-4 shrink-0 text-danger" />
            <span className="text-danger">No controls enabled - nothing stopped the agent.</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {activity.filter((a) => a.enabled).map((a) => {
              const Icon = CONTROL_ICON[a.key];
              return (
                <li key={a.key} className="flex items-start gap-2 text-sm">
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", a.fired ? "text-ok" : "text-muted")} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{CONTROL_NAME[a.key]}</span>
                    <span className={cn("block truncate text-[0.75rem] leading-snug", a.fired ? "text-ok" : "text-muted")}>
                      {a.fired ? a.note : "enabled · not triggered"}
                    </span>
                  </span>
                  {a.fired ? (
                    <Badge tone="ok" className="mt-0.5">fired</Badge>
                  ) : (
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-muted/50" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Run at a glance */}
      <section className="grid grid-cols-4 gap-2">
        <Stat label="systems" value={systems} />
        <Stat label="identities" value={identities} />
        <Stat label="secrets" value={secretsN} bad={snapshot?.secrets.some((x) => !x.redacted)} />
        <Stat label="external" value={externalN} bad={exfil} />
      </section>

      {/* Latest event */}
      <section>
        <div className="mb-1.5 flex items-center justify-between px-1">
          <span className="font-mono text-[0.64rem] uppercase tracking-[0.14em] text-muted">Latest event</span>
          <span className="font-mono text-[0.64rem] text-muted">high-risk: {snapshot?.high_risk_events ?? 0}</span>
        </div>
        <motion.div
          key={snapshot?.current?.seq ?? "none"}
          initial={{ opacity: 0.3, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "rounded-lg border p-3",
            !snapshot?.current && "border-line bg-panel-2",
            snapshot?.current?.severity === "critical" && "border-crit/60 bg-crit/10",
            snapshot?.current?.severity === "high" && "border-danger/50 bg-danger/10",
            snapshot?.current?.severity === "medium" && "border-warn/50 bg-warn/10",
            (snapshot?.current?.severity === "info" || snapshot?.current?.severity === "low") && "border-accent/40 bg-accent/5",
          )}
        >
          {snapshot?.current ? (
            <>
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 shrink-0" />
                <Badge tone={SEVERITY_TONE[snapshot.current.severity]}>{snapshot.current.severity}</Badge>
                <span className="truncate font-mono text-[0.66rem] text-muted">{snapshot.current.kind}</span>
              </div>
              <p className="mt-1.5 text-sm font-medium leading-snug">{snapshot.current.summary}</p>
            </>
          ) : (
            <p className="text-sm text-muted">No events yet.</p>
          )}
        </motion.div>
      </section>

      {/* Live agent + telemetry + memory footer */}
      <section className="mt-auto flex flex-col gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2.5 font-mono text-[0.7rem] text-muted">
        <div className="flex items-center gap-1.5">
          <Waypoints className="size-3.5 text-ctl" />
          <span className="text-fg">{t?.driver === "model" ? `${t.model}` : "live agent"}</span>
          {!!t?.model_calls && <span>· {t.model_calls} calls · ${t.cost_usd.toFixed(4)}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <span>{t?.spans ?? 0} OTel spans</span>
          <span className="text-muted/60">·</span>
          <Brain className="size-3.5 text-ctl" />
          <span>
            {snapshot?.memory.cleared
              ? "memory cleared"
              : `memory: ${snapshot?.memory.entries.length ?? 0} notes${memCredRefs ? `, ${memCredRefs} credential ref${memCredRefs === 1 ? "" : "s"} stored` : ""}`}
          </span>
        </div>
        <div className="text-muted/60">Full trace, identity, policy &amp; memory in Evidence below.</div>
      </section>
    </aside>
  );
}

function Gauge({ score, max }: { score: number; max: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const arc = 0.75;
  const frac = Math.min(1, score / max);
  const color = scoreColor(score);
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-[225deg]">
        <circle cx={50} cy={50} r={r} fill="none" stroke="var(--line)" strokeWidth={9} strokeDasharray={`${c * arc} ${c}`} strokeLinecap="round" />
        <motion.circle
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          initial={false}
          animate={{ strokeDasharray: `${c * arc * frac} ${c}` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ filter: score ? `drop-shadow(0 0 5px ${color})` : undefined }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <motion.div key={score} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="font-mono text-4xl font-bold leading-none" style={{ color }}>
            {score}
          </motion.div>
          <div className="font-mono text-xs text-muted">/ {max}</div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className={cn("rounded-lg border bg-panel-2 px-2 py-1.5 text-center", bad ? "border-crit/50" : "border-line")}>
      <motion.div key={value} initial={{ y: -3, opacity: 0.5 }} animate={{ y: 0, opacity: 1 }} className={cn("font-mono text-xl font-bold leading-none", bad ? "text-crit" : "text-fg")}>
        {value}
      </motion.div>
      <div className="mt-1 font-mono text-[0.6rem] text-muted">{label}</div>
    </div>
  );
}
