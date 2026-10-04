"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bot, Database, FolderOpen, Hourglass, Landmark, Mail, OctagonX, Share2, ShieldCheck, Siren, type LucideIcon } from "lucide-react";
import type { ActiveEdge, EdgeOutcome, NodeId, NodeStatus, RunSnapshot } from "@/lib/engine/types";
import { cn } from "@/lib/utils";

const W = 1000;
const H = 540;
const AGENT = { x: 175, y: 270 };
const RING_R = 122;
const PERIMETER_X = 792;

const NODES: Record<NodeId, { x: number; y: number; label: string; sub: string; icon: LucideIcon }> = {
  agent: { ...AGENT, label: "Recon Agent", sub: "month-end-recon-agent", icon: Bot },
  ledger: { x: 560, y: 78, label: "Ledger API", sub: "GL cash · legacy endpoint", icon: Database },
  drive: { x: 650, y: 205, label: "Shared Drive", sub: "demo-fixtures/ only", icon: FolderOpen },
  treasury: { x: 650, y: 335, label: "Treasury Agent", sub: "treasury-ops-agent · api", icon: Landmark },
  share: { x: 560, y: 462, label: "Internal Share", sub: "Finance/MonthEnd", icon: Share2 },
  mail: { x: 905, y: 270, label: "External Mail", sub: "local JSONL sink", icon: Mail },
};
const RESOURCES: NodeId[] = ["ledger", "drive", "treasury", "share", "mail"];

const OUTCOME_COLOR: Record<EdgeOutcome, string> = {
  in_flight: "var(--accent)",
  allowed: "var(--ok)",
  denied_by_resource: "var(--warn)",
  rejected_by_control: "var(--ctl)",
  blocked_by_policy: "var(--ctl)",
  blocked_by_breaker: "var(--ctl)",
};

const STATUS_STYLE: Record<NodeStatus, { ring: string; chip: string; text: string }> = {
  idle: { ring: "border-line", chip: "", text: "" },
  touched: { ring: "border-accent/60", chip: "border-accent/40 bg-accent/10 text-accent", text: "ACCESSED" },
  verified: { ring: "border-ok/60", chip: "border-ok/40 bg-ok/10 text-ok", text: "VERIFIED ACCESS" },
  denied: { ring: "border-warn/60", chip: "border-warn/40 bg-warn/10 text-warn", text: "DENIED" },
  protected: { ring: "border-ctl/70", chip: "border-ctl/50 bg-ctl/10 text-ctl", text: "PROTECTED" },
  compromised: { ring: "border-crit shadow-[0_0_32px_-6px] shadow-crit/70", chip: "border-crit/60 bg-crit/20 text-crit", text: "UNSAFE ACCESS" },
};

function ringPoint(to: NodeId) {
  const n = NODES[to];
  const dx = n.x - AGENT.x;
  const dy = n.y - AGENT.y;
  const d = Math.hypot(dx, dy);
  return { x: AGENT.x + (dx / d) * RING_R, y: AGENT.y + (dy / d) * RING_R };
}

export function Topology({ snapshot }: { snapshot: RunSnapshot | null }) {
  const edge = snapshot?.edge;
  const nodes = snapshot?.nodes;
  const controls = snapshot?.controls;
  const preventive = controls ? [controls.identity, controls.secrets, controls.egress, controls.breaker].filter(Boolean).length : 0;
  const exfil = snapshot?.external.some((e) => e.outcome === "SIMULATED_SEND");

  return (
    <div className="relative h-full w-full" style={{ containerType: "size" }}>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: `min(100cqw, calc(100cqh * ${W / H}))`, aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible">
          {/* perimeter */}
          <line x1={PERIMETER_X} y1={24} x2={PERIMETER_X} y2={H - 24} stroke="var(--line)" strokeWidth={2} strokeDasharray="4 8" />
          <text x={PERIMETER_X - 10} y={40} textAnchor="end" className="fill-muted font-mono" fontSize={11} letterSpacing={2}>
            BANK ESTATE
          </text>
          <text x={PERIMETER_X + 10} y={40} className="fill-muted font-mono" fontSize={11} letterSpacing={2}>
            EXTERNAL (.invalid)
          </text>

          {/* base links */}
          {RESOURCES.map((id) => {
            const st = nodes?.[id] ?? "idle";
            const color =
              st === "compromised" ? "var(--crit)" : st === "protected" ? "var(--ctl)" : st === "denied" ? "var(--warn)" : st === "touched" ? "var(--accent)" : "var(--line)";
            return (
              <line
                key={id}
                x1={AGENT.x}
                y1={AGENT.y}
                x2={NODES[id].x}
                y2={NODES[id].y}
                stroke={color}
                strokeOpacity={st === "idle" ? 0.9 : 0.35}
                strokeWidth={st === "idle" ? 1.5 : 2.5}
              />
            );
          })}

          {/* gateway ring */}
          <circle
            cx={AGENT.x}
            cy={AGENT.y}
            r={RING_R}
            fill="color-mix(in srgb, var(--ctl) 4%, transparent)"
            stroke={preventive ? "var(--ctl)" : "var(--muted)"}
            strokeOpacity={preventive ? 0.9 : 0.35}
            strokeWidth={preventive ? 3 : 1.5}
            strokeDasharray={preventive ? undefined : "3 7"}
          />
          <text x={AGENT.x} y={AGENT.y - RING_R - 22} textAnchor="middle" className="fill-ctl font-mono" fontSize={12} fontWeight={600} letterSpacing={2}>
            ACTION GATEWAY
          </text>
          <text x={AGENT.x} y={AGENT.y - RING_R - 8} textAnchor="middle" className="fill-muted font-mono" fontSize={10.5}>
            {controls ? (preventive ? `${preventive} preventive control${preventive > 1 ? "s" : ""} enforced` : "no preventive policy · allow all") : "policy boundary"}
          </text>

          {/* persistent control markers: where each control stopped something */}
          {(snapshot?.markers ?? []).map((m) => (
            <ControlMark key={`${m.node}-${m.kind}`} node={m.node} kind={m.kind} />
          ))}

          <AnimatePresence>{edge && edge.to !== "agent" && <ActivePath key={edge.seq + edge.outcome} edge={edge} compromised={nodes?.[edge.to] === "compromised"} />}</AnimatePresence>
        </svg>

        {/* nodes */}
        {(Object.keys(NODES) as NodeId[]).map((id) => (
          <NodeCard
            key={id}
            id={id}
            status={nodes?.[id] ?? "idle"}
            active={edge?.to === id}
            exfil={id === "mail" && !!exfil}
            snapshot={snapshot}
          />
        ))}
      </div>
    </div>
  );
}

function ControlMark({ node, kind }: { node: NodeId; kind: "blocked" | "rejected" | "redacted" }) {
  // blocked: at the gateway ring. rejected/redacted: just in front of the resource that enforced it.
  const p = kind === "blocked" ? ringPoint(node) : towards(node, 0.8);
  return (
    <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, delay: 0.5 }} style={{ transformOrigin: `${p.x}px ${p.y}px` }}>
      <circle cx={p.x} cy={p.y} r={13} fill="var(--bg)" stroke="var(--ctl)" strokeWidth={2.5} />
      {kind === "redacted" ? (
        <rect x={p.x - 6} y={p.y - 2.5} width={12} height={5} rx={1} fill="var(--ctl)" />
      ) : (
        <path d={`M${p.x - 5} ${p.y - 5} L${p.x + 5} ${p.y + 5} M${p.x + 5} ${p.y - 5} L${p.x - 5} ${p.y + 5}`} stroke="var(--ctl)" strokeWidth={2.8} strokeLinecap="round" />
      )}
    </motion.g>
  );
}

function towards(to: NodeId, f: number) {
  const n = NODES[to];
  return { x: AGENT.x + (n.x - AGENT.x) * f, y: AGENT.y + (n.y - AGENT.y) * f };
}

function ActivePath({ edge, compromised }: { edge: ActiveEdge; compromised: boolean }) {
  const blocked = edge.outcome === "blocked_by_policy" || edge.outcome === "blocked_by_breaker";
  const end = blocked ? ringPoint(edge.to) : NODES[edge.to];
  const color = edge.outcome === "allowed" && compromised ? "var(--crit)" : OUTCOME_COLOR[edge.outcome];
  const inFlight = edge.outcome === "in_flight";
  const labelPos = blocked ? { x: end.x + 18, y: end.y - 16 } : { x: (AGENT.x + end.x) / 2 + 30, y: (AGENT.y + end.y) / 2 - 10 };

  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      <motion.line
        x1={AGENT.x}
        y1={AGENT.y}
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        className={inFlight ? "flow" : undefined}
        initial={{ x2: AGENT.x, y2: AGENT.y }}
        animate={{ x2: end.x, y2: end.y }}
        transition={{ duration: inFlight ? 0.6 : 0.5, ease: "easeOut" }}
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
      <motion.circle
        r={7}
        fill={color}
        initial={{ cx: AGENT.x, cy: AGENT.y }}
        animate={{ cx: end.x, cy: end.y }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
      {blocked && (
        <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.45, type: "spring", stiffness: 300 }} style={{ transformOrigin: `${end.x}px ${end.y}px` }}>
          <circle cx={end.x} cy={end.y} r={17} fill="var(--bg)" stroke="var(--ctl)" strokeWidth={3} />
          <path d={`M${end.x - 7} ${end.y - 7} L${end.x + 7} ${end.y + 7} M${end.x + 7} ${end.y - 7} L${end.x - 7} ${end.y + 7}`} stroke="var(--ctl)" strokeWidth={3.5} strokeLinecap="round" />
        </motion.g>
      )}
      {!inFlight && (
        <motion.g initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <rect x={labelPos.x - 4} y={labelPos.y - 15} width={edge.label.length * 7.4 + 14} height={22} rx={4} fill="var(--bg)" stroke={color} strokeOpacity={0.7} />
          <text x={labelPos.x + 3} y={labelPos.y} fill={color} className="font-mono" fontSize={12} fontWeight={700}>
            {edge.label}
          </text>
        </motion.g>
      )}
    </motion.g>
  );
}

function NodeCard({ id, status, active, exfil, snapshot }: { id: NodeId; status: NodeStatus; active: boolean; exfil: boolean; snapshot: RunSnapshot | null }) {
  const n = NODES[id];
  const Icon = n.icon;
  const isAgent = id === "agent";
  const st = STATUS_STYLE[status];
  const runStatus = snapshot?.status;
  const localAction = isAgent && snapshot?.edge?.to === "agent" ? snapshot.edge : undefined;

  let chipText = st.text;
  if (id === "mail" && exfil) chipText = "SIMULATED EXFILTRATION";

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${(n.x / W) * 100}%`, top: `${(n.y / H) * 100}%`, width: isAgent ? "17%" : "18%" }}
    >
      {(exfil || (active && !isAgent)) && (
        <div className={cn("pulse-ring pointer-events-none absolute inset-0 rounded-xl border-2", exfil ? "border-crit" : "border-accent")} />
      )}
      <div
        className={cn(
          "relative rounded-xl border-2 bg-panel/95 px-3 py-2.5 backdrop-blur transition-all duration-500",
          isAgent ? "border-accent/70 shadow-[0_0_40px_-10px] shadow-accent/60" : st.ring,
          active && !isAgent && status === "idle" && "border-accent",
        )}
      >
        <div className="flex items-center gap-2.5">
          <div className={cn("grid size-9 shrink-0 place-items-center rounded-lg", isAgent ? "bg-accent/15 text-accent" : "bg-panel-2 text-fg")}>
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[0.95rem] font-semibold leading-tight">{n.label}</div>
            <div className="truncate font-mono text-[0.66rem] text-muted">{n.sub}</div>
          </div>
        </div>

        {isAgent ? (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[0.62rem] text-muted">
              {snapshot?.controls.identity ? "task-bound JWT · 300s" : "ambient service principal"}
            </span>
            {runStatus === "STOPPED" && (
              <span className="inline-flex items-center gap-1 rounded border border-warn/50 bg-warn/10 px-1.5 py-0.5 font-mono text-[0.62rem] font-bold text-warn">
                <OctagonX className="size-3" /> STOPPED
              </span>
            )}
            {runStatus === "WAITING_FOR_APPROVAL" && (
              <span className="inline-flex items-center gap-1 rounded border border-ok/50 bg-ok/10 px-1.5 py-0.5 font-mono text-[0.62rem] font-bold text-ok">
                <Hourglass className="size-3" /> AWAITING HUMAN
              </span>
            )}
          </div>
        ) : (
          chipText && (
            <div className={cn("mt-2 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[0.62rem] font-bold", st.chip)}>
              {status === "protected" && <ShieldCheck className="size-3" />}
              {status === "compromised" && <Siren className="size-3" />}
              {chipText}
            </div>
          )
        )}
      </div>

      <AnimatePresence>
        {localAction && (
          <motion.div
            key={localAction.seq}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded border border-accent/50 bg-bg px-2 py-1 font-mono text-[0.7rem] text-accent"
          >
            {localAction.tool}
            {localAction.outcome !== "in_flight" && <span className="ml-2 text-muted">{localAction.label}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
