"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, Hourglass, MessageSquareText, OctagonX, Siren, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { NO_CONTROLS, presetFor } from "@/lib/engine/controls";
import { CONTROL_KEYS, type ControlKey, type Controls, type RunSnapshot, type RunStatus } from "@/lib/engine/types";
import { cn } from "@/lib/utils";
import { ControlPanel } from "./ControlPanel";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { RiskPanel } from "./RiskPanel";
import { Topology } from "./Topology";
import { useRunStream } from "./useRunStream";

const STATUS_TONE: Record<RunStatus, BadgeTone> = {
  IDLE: "neutral",
  RUNNING: "info",
  PAUSED: "warn",
  COMPLETED: "neutral",
  STOPPED: "warn",
  WAITING_FOR_APPROVAL: "ok",
};

const STATUS_LABEL: Record<RunStatus, string> = {
  IDLE: "Ready",
  RUNNING: "Agent running",
  PAUSED: "Paused",
  COMPLETED: "Finished",
  STOPPED: "Stopped",
  WAITING_FOR_APPROVAL: "Waiting for approval",
};

export function Console() {
  const { snapshot, events, connected, modelInfo, send } = useRunStream();
  const [controls, setControls] = useState<Controls>(NO_CONTROLS);
  const [model, setModel] = useState("claude-haiku-4-5");
  const [syncedRun, setSyncedRun] = useState<string | null>(null);

  // Reflect a run that started from any client.
  if (snapshot && snapshot.run_id !== syncedRun) {
    setSyncedRun(snapshot.run_id);
    setControls(snapshot.controls);
  }

  // Always a live agent, always the posture that follows the poisoned runbook.
  const start = (c: Controls) => send({ command: "start", controls: c, preset: presetFor(c), speed: 1, useModel: true, posture: "pressured", model });

  return (
    <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)_auto]">
      <Header snapshot={snapshot} connected={connected} modelAvailable={modelInfo.model_available} />
      <div className="grid min-h-0 grid-cols-[21rem_minmax(0,1fr)_23rem]">
        <ControlPanel
          controls={controls}
          snapshot={snapshot}
          model={model}
          modelAvailable={modelInfo.model_available}
          onToggle={(k: ControlKey, v) => setControls((c) => ({ ...c, [k]: v }))}
          onAll={(on) => setControls(() => Object.fromEntries(CONTROL_KEYS.map((k) => [k, on])) as Controls)}
          onReplay={() => void start(controls)}
          onPause={() => void send({ command: "pause" })}
          onResume={() => void send({ command: "resume" })}
          onReset={() => void send({ command: "reset" })}
          onStop={() => void send({ command: "stop" })}
          onModel={setModel}
        />
        <main className="grid-bg relative flex min-h-0 flex-col">
          {snapshot?.outcome ? <OutcomeBanner snapshot={snapshot} /> : <DecisionBanner snapshot={snapshot} />}
          <div className="relative min-h-0 flex-1 px-6 pb-4">
            <Topology snapshot={snapshot} />
          </div>
        </main>
        <RiskPanel snapshot={snapshot} />
      </div>
      <EvidenceDrawer snapshot={snapshot} events={events} />
    </div>
  );
}

function Header({ snapshot, connected, modelAvailable }: { snapshot: RunSnapshot | null; connected: boolean; modelAvailable: boolean }) {
  const status: RunStatus = snapshot?.status ?? "IDLE";
  const enabled = snapshot ? CONTROL_KEYS.filter((k) => snapshot.controls[k]).length : 0;
  return (
    <header className="flex h-14 items-center gap-4 border-b border-line bg-panel px-5">
      <div className="flex items-center gap-2.5">
        <div className="grid size-8 place-items-center rounded-md bg-accent/15 text-accent">
          <Activity className="size-5" />
        </div>
        <div className="leading-tight">
          <div className="text-[0.95rem] font-semibold tracking-tight">Agent Blast Radius</div>
          <div className="text-xs text-muted">Month-end reconciliation · runtime controls</div>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {snapshot && (
          <span className="hidden font-mono text-xs text-muted lg:inline">
            {enabled === 0 ? "no controls" : `${enabled}/5 controls`}
            {snapshot.telemetry.model ? ` · ${snapshot.telemetry.model}` : ""}
          </span>
        )}
        <Badge tone={STATUS_TONE[status]} className="px-2.5 py-1 text-[0.75rem] normal-case">
          {status === "RUNNING" && <span className="size-1.5 animate-pulse rounded-full bg-accent" />}
          {STATUS_LABEL[status]}
        </Badge>
        <span title={modelAvailable ? (connected ? "Live agent connected" : "Reconnecting...") : "No ANTHROPIC_API_KEY - add one to .env"}>
          {connected ? <Wifi className="size-4 text-ok" /> : <WifiOff className="size-4 text-danger" />}
        </span>
      </div>
    </header>
  );
}

function DecisionBanner({ snapshot }: { snapshot: RunSnapshot | null }) {
  return (
    <div className="flex min-h-16 items-center gap-3 px-6 pt-4">
      <MessageSquareText className="size-5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted">
          Agent decision {snapshot?.step ? `· step ${snapshot.step}` : ""}
          {snapshot?.edge && <span className="ml-2 normal-case tracking-normal text-accent/80">{snapshot.edge.tool}</span>}
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={snapshot?.last_decision ?? "idle"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="truncate text-lg font-medium"
          >
            {snapshot?.last_decision ?? (snapshot ? "Starting the agent..." : "Press Run agent to start. Leave the controls off to watch the agent breach; turn them on to contain it.")}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

function OutcomeBanner({ snapshot }: { snapshot: RunSnapshot | null }) {
  const o = snapshot?.outcome;
  const status = snapshot?.status;
  const Icon = status === "STOPPED" ? OctagonX : status === "WAITING_FOR_APPROVAL" ? Hourglass : Siren;
  return (
    <AnimatePresence>
      {o && (
        <motion.div
          key={snapshot!.run_id}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ delay: 0.3 }}
          className={cn(
            "mx-6 mt-3 flex items-center gap-4 rounded-xl border bg-bg/95 px-5 py-2.5 shadow-xl backdrop-blur",
            o.tone === "bad" && "border-crit/60",
            o.tone === "warn" && "border-warn/50",
            o.tone === "good" && "border-ok/50",
          )}
        >
          <Icon className={cn("size-7", o.tone === "bad" ? "text-crit" : o.tone === "warn" ? "text-warn" : "text-ok")} />
          <div>
            <div className="font-mono text-sm font-semibold tracking-wide">{STATUS_LABEL[status!]}</div>
            <div className="text-sm">
              <span className="text-muted">Task:</span> {o.task}
              <span className="mx-2 text-line">|</span>
              <span className="text-muted">Outcome:</span>{" "}
              <span className={cn("font-semibold", o.tone === "bad" ? "text-crit" : o.tone === "warn" ? "text-warn" : "text-ok")}>{o.control}</span>
            </div>
          </div>
          {snapshot!.approval && (
            <div className="border-l border-line pl-4 text-sm">
              <div className="font-mono text-[0.6rem] uppercase text-muted">Exception request</div>
              <div className="font-mono font-semibold text-ok">{snapshot!.approval.approval_id} · pending</div>
            </div>
          )}
          {snapshot!.incident && (
            <div className="border-l border-line pl-4 text-sm">
              <div className="font-mono text-[0.6rem] uppercase text-muted">Incident</div>
              <div className="font-mono font-semibold text-warn">{snapshot!.incident.incident_id}</div>
            </div>
          )}
          <div className="ml-auto border-l border-line pl-4 text-center">
            <div className="font-mono text-[0.6rem] uppercase text-muted">Blast radius</div>
            <div className={cn("font-mono text-2xl font-bold", snapshot!.blast.score >= 7 ? "text-crit" : snapshot!.blast.score ? "text-warn" : "text-ok")}>
              {snapshot!.blast.score}/{snapshot!.blast.max}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
