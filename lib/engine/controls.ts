import type { ControlKey, Controls, PresetId } from "./types";

export const NO_CONTROLS: Controls = { identity: false, secrets: false, egress: false, monitor: false, breaker: false };

const only = (key: ControlKey): Controls => ({ ...NO_CONTROLS, [key]: true });

export interface PresetDef {
  id: Exclude<PresetId, "custom">;
  label: string;
  short: string;
  controls: Controls;
  blurb: string;
}

export const PRESETS: PresetDef[] = [
  {
    id: "baseline",
    label: "Baseline",
    short: "No controls",
    controls: NO_CONTROLS,
    blurb: "Broad tool access, weak surrounding controls. Watch the agent chain workarounds.",
  },
  {
    id: "identity",
    label: "Identity spotlight",
    short: "Agent identity only",
    controls: only("identity"),
    blurb: "Task-bound short-lived JWT. Resources validate subject, audience, scope and task themselves.",
  },
  {
    id: "secrets",
    label: "Secrets spotlight",
    short: "Secrets control only",
    controls: only("secrets"),
    blurb: "Credential markers are redacted before tool output reaches the agent.",
  },
  {
    id: "egress",
    label: "Egress spotlight",
    short: "Egress approval only",
    controls: only("egress"),
    blurb: "External actions evaluated on data class, destination, action and identity before execution.",
  },
  {
    id: "monitor",
    label: "Monitor spotlight",
    short: "Detection only",
    controls: only("monitor"),
    blurb: "Full trace and correlation detection. Detects the sequence but does not block it.",
  },
  {
    id: "breaker",
    label: "Circuit-breaker spotlight",
    short: "Stopping logic only",
    controls: only("breaker"),
    blurb: "Automated rules trip one server-side stop path: block, cancel, revoke, record.",
  },
  {
    id: "all",
    label: "All controls",
    short: "Target state",
    controls: { identity: true, secrets: true, egress: true, monitor: true, breaker: true },
    blurb: "Bounded access succeeds; unsafe routes fail; the agent asks a human instead of inventing a route.",
  },
];

export const CONTROL_META: Record<ControlKey, { label: string; layer: string; lesson: string }> = {
  identity: {
    label: "Agent identity",
    layer: "Short-lived task-bound JWT, validated by the resource",
    lesson: "Verify the resource enforces identity and delegated authority - not the system prompt.",
  },
  secrets: {
    label: "Secrets exposure",
    layer: "Redact credential markers in tool output; record fingerprint only",
    lesson: "Scanning is a backstop. Eliminate reusable credentials in favour of workload identity.",
  },
  egress: {
    label: "Egress approval",
    layer: "Data class x destination x action x identity x exception",
    lesson: "Enforce egress at the action/network boundary, not through model instructions.",
  },
  monitor: {
    label: "Action monitor",
    layer: "Structured trace + correlation rule (detect, do not block)",
    lesson: "Traces provide evidence and detection; they are not the preventative control.",
  },
  breaker: {
    label: "Circuit breaker",
    layer: "Automated rules share the STOP AGENT path",
    lesson: "What stops execution? Are credentials revoked? Do queued actions die?",
  },
};

export function presetFor(controls: Controls): PresetId {
  const match = PRESETS.find((p) => (Object.keys(controls) as ControlKey[]).every((k) => p.controls[k] === controls[k]));
  return match ? match.id : "custom";
}

export function enabledControls(controls: Controls): ControlKey[] {
  return (Object.keys(controls) as ControlKey[]).filter((k) => controls[k]);
}
