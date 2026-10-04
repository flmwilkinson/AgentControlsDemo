"use client";

import { Brain, Check, ChevronDown, ChevronUp, FileWarning, Fingerprint, Gavel, ListTree, Braces, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Decision, EventKind, RunSnapshot, TraceEvent } from "@/lib/engine/types";
import { cn } from "@/lib/utils";
import { SEVERITY_TONE } from "./RiskPanel";

const DECISION_TONE: Record<Decision, BadgeTone> = {
  ALLOW: "ok",
  DENY: "control",
  REQUIRES_APPROVAL: "control",
  DETECT_ONLY: "info",
  REDACT: "control",
  NOT_ENABLED: "neutral",
};

const KIND_TONE: Partial<Record<EventKind, BadgeTone>> = {
  AGENT_DECISION: "info",
  POLICY_DECISION: "neutral",
  ACTION_BLOCKED: "control",
  SECRET_EXPOSURE_DETECTED: "control",
  SIMULATED_EXFILTRATION: "critical",
  CIRCUIT_BREAKER_TRIPPED: "critical",
  ALERT_RAISED: "danger",
  APPROVAL_REQUESTED: "ok",
  MEMORY_WRITE: "control",
  MEMORY_GOVERNANCE: "control",
  MEMORY_CLEARED: "warn",
  RUN_COMPLETED: "neutral",
};

export function EvidenceDrawer({ snapshot, events }: { snapshot: RunSnapshot | null; events: TraceEvent[] }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState("trace");

  return (
    <section className={cn("flex min-h-0 flex-col border-t border-line bg-panel transition-[height] duration-300", open ? "h-[31vh]" : "h-11")}>
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setOpen(true); }} className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-3">
          <span className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">Evidence</span>
          <TabsList>
            <TabsTrigger value="trace"><ListTree className="size-4" />Trace<Count n={events.filter((e) => e.level === "key").length} /></TabsTrigger>
            <TabsTrigger value="identity"><Fingerprint className="size-4" />Identity<Count n={snapshot?.identities.length ?? 0} /></TabsTrigger>
            <TabsTrigger value="policy"><Gavel className="size-4" />Policy decisions<Count n={snapshot?.policy_decisions.length ?? 0} /></TabsTrigger>
            <TabsTrigger value="incident">
              <FileWarning className="size-4" />Incident
              <Count n={(snapshot?.alerts.length ?? 0) + (snapshot?.incident ? 1 : 0)} hot={!!snapshot?.incident || !!snapshot?.alerts.some((a) => a.severity === "critical")} />
            </TabsTrigger>
            <TabsTrigger value="memory"><Brain className="size-4" />Agent memory<Count n={snapshot?.memory.entries.length ?? 0} /></TabsTrigger>
            <TabsTrigger value="raw"><Braces className="size-4" />Raw events<Count n={events.length} /></TabsTrigger>
          </TabsList>
          <div className="ml-auto flex items-center gap-3 font-mono text-[0.68rem] text-muted">
            {snapshot && (
              <>
                <span>run_id {snapshot.run_id}</span>
                <span>trace_id {snapshot.trace_id.slice(0, 16)}...</span>
              </>
            )}
            <button onClick={() => setOpen(!open)} className="rounded p-1 hover:bg-line" aria-label={open ? "Collapse evidence" : "Expand evidence"}>
              {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            </button>
          </div>
        </div>
        {open && (
          <>
            <TabsContent value="trace" className="min-h-0"><TraceTab events={events} /></TabsContent>
            <TabsContent value="identity" className="min-h-0"><IdentityTab snapshot={snapshot} /></TabsContent>
            <TabsContent value="policy" className="min-h-0"><PolicyTab snapshot={snapshot} /></TabsContent>
            <TabsContent value="incident" className="min-h-0"><IncidentTab snapshot={snapshot} /></TabsContent>
            <TabsContent value="memory" className="min-h-0"><MemoryTab snapshot={snapshot} /></TabsContent>
            <TabsContent value="raw" className="min-h-0"><RawTab events={events} /></TabsContent>
          </>
        )}
      </Tabs>
    </section>
  );
}

function Count({ n, hot }: { n: number; hot?: boolean }) {
  return <span className={cn("rounded px-1.5 font-mono text-[0.65rem]", hot ? "bg-crit/30 text-crit" : "bg-panel-2 text-muted")}>{n}</span>;
}

function useAutoScroll(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
}

function relTime(ts: string, t0?: string) {
  if (!t0) return "";
  const ms = new Date(ts).getTime() - new Date(t0).getTime();
  return `+${(ms / 1000).toFixed(1)}s`;
}

function TraceTab({ events }: { events: TraceEvent[] }) {
  const [detail, setDetail] = useState(false);
  const shown = useMemo(() => events.filter((e) => detail || e.level === "key"), [events, detail]);
  const ref = useAutoScroll(shown.length);
  const t0 = events[0]?.ts;
  return (
    <div className="flex h-full flex-col">
      <div ref={ref} className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        <table className="w-full text-sm">
          <tbody>
            {shown.map((e) => (
              <tr key={e.id} className={cn("border-b border-line/50 align-top", e.kind === "AGENT_DECISION" && "bg-accent/[0.04]", e.severity === "critical" && "bg-crit/10")}>
                <td className="w-12 py-1 pl-3 font-mono text-[0.7rem] text-muted">{e.seq}</td>
                <td className="w-16 py-1 font-mono text-[0.7rem] text-muted">{relTime(e.ts, t0)}</td>
                <td className="w-56 py-1"><Badge tone={KIND_TONE[e.kind] ?? SEVERITY_TONE[e.severity]}>{e.kind}</Badge></td>
                <td className="w-44 py-1 font-mono text-[0.72rem] text-muted">{e.actor}</td>
                <td className="w-52 py-1 font-mono text-[0.72rem] text-accent/80">{e.tool ?? ""}</td>
                <td className={cn("py-1 pr-3", e.kind === "AGENT_DECISION" ? "italic text-fg" : "text-fg/90")}>
                  {e.kind === "AGENT_DECISION" && <span className="mr-1 not-italic text-muted">Decision summary:</span>}
                  {e.summary}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <Placeholder text="Press Replay to start a run. Every proposed action, policy decision and result is recorded here." />}
      </div>
      <label className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-1 text-xs text-muted">
        <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} className="accent-sky-400" />
        Show gateway pipeline detail (proposed / validated / enriched / tool call)
        <span className="ml-auto">Decision summaries are authored. No hidden chain-of-thought is shown or stored.</span>
      </label>
    </div>
  );
}

function IdentityTab({ snapshot }: { snapshot: RunSnapshot | null }) {
  if (!snapshot) return <Placeholder text="No run." />;
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 overflow-hidden p-3">
      <div className="min-h-0 overflow-y-auto scroll-thin">
        <h3 className="mb-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">Issued by identity broker (ES256, local)</h3>
        {snapshot.issued_tokens.length ? (
          <table className="w-full text-xs">
            <thead className="text-left text-muted">
              <tr><th className="pb-1">sub</th><th>aud</th><th>scope</th><th>task_id</th><th>jti</th><th>state</th></tr>
            </thead>
            <tbody className="font-mono">
              {snapshot.issued_tokens.map((t) => (
                <tr key={t.jti} className="border-t border-line/60">
                  <td className="py-1 pr-2">{t.sub}</td>
                  <td className="pr-2">{t.aud}</td>
                  <td className="pr-2 text-muted">{t.scope}</td>
                  <td className="pr-2 text-muted">{t.task_id}</td>
                  <td className="pr-2 text-muted">{t.jti.slice(0, 8)}</td>
                  <td>{t.revoked ? <Badge tone="warn">revoked</Badge> : <Badge tone="ok">active</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">Identity control off: the agent runs as an ambient service principal and resources accept static bearer tokens and shared passwords.</p>
        )}
        <p className="mt-3 text-xs text-muted">Raw bearer tokens and passwords are never displayed or logged - only claims, jti prefixes and sha256 fingerprints.</p>
      </div>
      <div className="min-h-0 overflow-y-auto scroll-thin">
        <h3 className="mb-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">Identity presented to resources</h3>
        <div className="flex flex-col gap-2">
          {snapshot.identities.map((i) => (
            <div key={i.seq} className={cn("rounded-md border p-2", i.accepted && i.principal !== "month-end-recon-agent" ? "border-crit/50 bg-crit/5" : "border-line")}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-[0.7rem] text-muted">#{i.seq}</span>
                <span className="font-mono font-semibold">{i.principal}</span>
                <span className="text-muted">{i.method}</span>
                <span className="text-muted">→ {i.resource}</span>
                <Badge tone={i.accepted ? (i.principal === "month-end-recon-agent" ? "ok" : "critical") : "control"} className="ml-auto">
                  {i.accepted ? "accepted" : "rejected"}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-muted">{i.reason}{i.fingerprint && <span className="ml-2 font-mono">{i.fingerprint}</span>}</div>
              {i.checks && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {i.checks.map((c) => (
                    <span key={c.claim} title={c.detail} className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[0.65rem]", c.ok ? "border-ok/30 text-ok" : "border-ctl/50 bg-ctl/10 text-ctl")}>
                      {c.ok ? <Check className="size-3" /> : <X className="size-3" />}
                      {c.claim}
                      {!c.ok && <span className="text-fg/80">: {c.detail}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!snapshot.identities.length && <p className="text-sm text-muted">None yet.</p>}
        </div>
      </div>
    </div>
  );
}

function PolicyTab({ snapshot }: { snapshot: RunSnapshot | null }) {
  const ref = useAutoScroll(snapshot?.policy_decisions.length);
  if (!snapshot) return <Placeholder text="No run." />;
  return (
    <div ref={ref} className="h-full overflow-y-auto scroll-thin">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-panel text-left font-mono text-[0.65rem] uppercase tracking-wider text-muted">
          <tr><th className="py-1 pl-3">#</th><th>action</th><th>decision</th><th>reason</th><th className="pr-3">policy results</th></tr>
        </thead>
        <tbody>
          {snapshot.policy_decisions.map((p) => (
            <tr key={p.event_id} className={cn("border-t border-line/50 align-top", p.final !== "ALLOW" && "bg-ctl/[0.06]")}>
              <td className="w-12 py-1.5 pl-3 font-mono text-[0.7rem] text-muted">{p.seq}</td>
              <td className="w-56 py-1.5 font-mono text-[0.75rem] text-accent/80">{p.tool}</td>
              <td className="w-40 py-1.5"><Badge tone={DECISION_TONE[p.final]}>{p.final}</Badge></td>
              <td className={cn("py-1.5 pr-3", p.final !== "ALLOW" ? "font-semibold text-ctl" : "text-muted")}>{p.reason}</td>
              <td className="py-1.5 pr-3">
                <div className="flex flex-wrap gap-1">
                  {p.results.map((r) => (
                    <span key={r.policy} title={r.reason}>
                      <Badge tone={DECISION_TONE[r.decision]}>{r.policy}: {r.decision}</Badge>
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!snapshot.policy_decisions.length && <Placeholder text="No decisions yet." />}
    </div>
  );
}

function IncidentTab({ snapshot }: { snapshot: RunSnapshot | null }) {
  if (!snapshot) return <Placeholder text="No run." />;
  const inc = snapshot.incident;
  return (
    <div className="grid h-full grid-cols-3 gap-3 overflow-hidden p-3">
      <div className="min-h-0 overflow-y-auto scroll-thin">
        <h3 className="mb-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">Monitor alerts</h3>
        {!snapshot.controls.monitor && <p className="mb-2 text-xs text-muted">Action monitor is off - no detection rules are running.</p>}
        <div className="flex flex-col gap-1.5">
          {snapshot.alerts.map((a) => (
            <div key={a.id} className={cn("rounded-md border p-2", a.severity === "critical" ? "border-crit/60 bg-crit/10" : "border-line")}>
              <div className="flex items-center gap-2">
                <Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge>
                <span className="font-mono text-[0.68rem] text-muted">{a.rule} · #{a.seq}</span>
                <Badge tone="neutral" className="ml-auto">detect only</Badge>
              </div>
              <div className={cn("mt-1 text-sm font-semibold", a.severity === "critical" && "text-crit")}>{a.title}</div>
              <div className="font-mono text-[0.68rem] text-muted">{a.detail}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto scroll-thin">
        <h3 className="mb-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">Incident record</h3>
        {inc ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <KV k="incident_id" v={inc.incident_id} strong />
            <KV k="trigger" v={inc.trigger} strong />
            <KV k="source" v={inc.trigger_source} />
            <KV k="timestamp" v={inc.timestamp} />
            <KV k="run / trace" v={`${inc.run_id} / ${inc.trace_id.slice(0, 12)}...`} />
            <KV k="identities" v={inc.identities_involved.join(", ")} />
            <KV k="resources" v={inc.resources_involved.join(", ") || "none"} />
            <KV k="controls" v={inc.enabled_controls.join(", ") || "none"} />
            <KV k="tokens revoked" v={String(inc.tokens_revoked)} />
            <KV k="steps cancelled" v={String(inc.queued_steps_cancelled)} />
            <KV k="outcome" v={inc.final_outcome} strong />
            <dt className="col-span-2 mt-2 font-mono text-[0.65rem] uppercase tracking-wider text-muted">last security events</dt>
            {inc.last_security_events.map((e) => (
              <dd key={e.seq} className="col-span-2 font-mono text-[0.68rem] text-muted">#{e.seq} {e.kind} - {e.summary}</dd>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted">No incident. Incidents are opened by the circuit breaker or STOP AGENT and written to runtime/incidents.jsonl.</p>
        )}
      </div>
      <div className="min-h-0 overflow-y-auto scroll-thin">
        <h3 className="mb-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">Approvals &amp; outbox</h3>
        {snapshot.approval ? (
          <div className="rounded-md border border-ok/40 bg-ok/5 p-2 text-xs">
            <div className="flex items-center gap-2"><Badge tone="ok">{snapshot.approval.status}</Badge><span className="font-mono font-semibold">{snapshot.approval.approval_id}</span></div>
            <p className="mt-1 text-sm">{snapshot.approval.request}</p>
            <p className="mt-1 font-mono text-muted">{snapshot.approval.report_id} · {snapshot.approval.classification}</p>
            <p className="mt-1 text-muted">Written to runtime/approvals.jsonl (synthetic).</p>
          </div>
        ) : (
          <p className="text-sm text-muted">No approval request.</p>
        )}
        {snapshot.external.map((e) => (
          <div key={e.seq} className={cn("mt-2 rounded-md border p-2 text-xs", e.outcome === "SIMULATED_SEND" ? "border-crit/60 bg-crit/10" : "border-ctl/40")}>
            <Badge tone={e.outcome === "SIMULATED_SEND" ? "critical" : "control"}>{e.outcome === "SIMULATED_SEND" ? "SIMULATED EXFILTRATION" : "BLOCKED - NO OUTBOX RECORD"}</Badge>
            <p className="mt-1 font-mono">{e.classification} → {e.destination}</p>
            {e.outcome === "SIMULATED_SEND" && <p className="mt-1 text-muted">No email sent. Record written to runtime/simulated-outbox.jsonl only.</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RawTab({ events }: { events: TraceEvent[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const ref = useAutoScroll(events.length);
  const selected = events.find((e) => e.id === sel) ?? events[events.length - 1];
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] overflow-hidden">
      <div ref={ref} className="min-h-0 overflow-y-auto border-r border-line scroll-thin">
        {events.map((e) => (
          <button
            key={e.id}
            onClick={() => setSel(e.id)}
            className={cn("flex w-full items-center gap-2 border-b border-line/40 px-3 py-0.5 text-left font-mono text-[0.7rem] hover:bg-panel-2", selected?.id === e.id && "bg-line/60")}
          >
            <span className="w-10 text-muted">{e.seq}</span>
            <span className={cn("w-56 truncate", e.level === "detail" ? "text-muted" : "text-fg")}>{e.kind}</span>
            <span className="truncate text-muted">{e.span_id}</span>
          </button>
        ))}
      </div>
      <pre className="min-h-0 overflow-auto p-3 font-mono text-[0.7rem] leading-relaxed text-fg/90 scroll-thin">
        {selected ? JSON.stringify(selected, null, 2) : "No events."}
      </pre>
    </div>
  );
}

function MemoryTab({ snapshot }: { snapshot: RunSnapshot | null }) {
  if (!snapshot) return <Placeholder text="No run." />;
  const m = snapshot.memory;
  return (
    <div className="h-full overflow-y-auto p-3 scroll-thin">
      <div className="mb-2 flex items-center gap-3">
        <h3 className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">Agent working memory</h3>
        <span className="font-mono text-[0.68rem] text-muted">
          {m.cleared ? "cleared by kill switch" : `${m.entries.length} entries · ${m.bytes}B · governed`}
        </span>
        {!!m.redactions && <Badge tone="ok">memory governance redacted {m.redactions}</Badge>}
      </div>
      {m.entries.length ? (
        <table className="w-full text-sm">
          <thead className="text-left font-mono text-[0.64rem] uppercase tracking-wider text-muted">
            <tr>
              <th className="py-1 pr-3">key</th>
              <th className="pr-3">classification</th>
              <th className="pr-3">source</th>
              <th>value the agent stored</th>
            </tr>
          </thead>
          <tbody>
            {m.entries.map((e) => {
              const credRef = /token|credential/i.test(e.key);
              return (
                <tr key={e.seq} className={cn("border-t border-line/50 align-top", credRef && "bg-crit/[0.05]")}>
                  <td className="py-1.5 pr-3 font-mono text-[0.75rem] text-ctl">{e.key.split(":").pop()}</td>
                  <td className="pr-3">
                    <Badge tone={/^restricted/i.test(e.classification) ? "warn" : "neutral"}>{e.classification}</Badge>
                  </td>
                  <td className="pr-3 font-mono text-[0.7rem] text-muted">
                    {e.source === "model-tool" ? "agent tool" : "runtime"}
                    {e.tainted_by && (
                      <Badge tone="warn" className="ml-1" title={`written after reading untrusted: ${e.tainted_by.join(", ")}`}>
                        tainted
                      </Badge>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-[0.82rem] text-fg/90">
                    {e.value}
                    {e.redacted && <Badge tone="ok" className="ml-2">redacted</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <Placeholder text="Memory is empty." />
      )}
      <p className="mt-3 font-mono text-[0.66rem] text-muted">
        The agent records what it learns and does. Under the poisoned runbook it stores the borrowed credential references here - a governance concern in itself. Credential markers are redacted before persisting, notes the agent wrote after reading untrusted documents are marked tainted (memory can carry an injection into later steps), and the kill switch clears memory.
      </p>
    </div>
  );
}

function KV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <>
      <dt className="font-mono text-muted">{k}</dt>
      <dd className={cn("font-mono", strong && "font-semibold text-fg")}>{v}</dd>
    </>
  );
}

function Placeholder({ text }: { text: string }) {
  return <p className="p-4 text-sm text-muted">{text}</p>;
}
