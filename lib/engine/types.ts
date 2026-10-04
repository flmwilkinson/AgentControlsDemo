import { z } from "zod";

// Controls

export const CONTROL_KEYS = ["identity", "secrets", "egress", "monitor", "breaker"] as const;
export type ControlKey = (typeof CONTROL_KEYS)[number];

export const ControlsSchema = z.object({
  identity: z.boolean(),
  secrets: z.boolean(),
  egress: z.boolean(),
  monitor: z.boolean(),
  breaker: z.boolean(),
});
export type Controls = z.infer<typeof ControlsSchema>;

export const PRESET_IDS = [
  "baseline",
  "identity",
  "secrets",
  "egress",
  "monitor",
  "breaker",
  "all",
  "custom",
] as const;
export type PresetId = (typeof PRESET_IDS)[number];

// Topology

export const NODE_IDS = ["agent", "ledger", "drive", "treasury", "share", "mail"] as const;
export type NodeId = (typeof NODE_IDS)[number];

// Proposed actions: the only vocabulary the agent can speak.

const period = z.string().regex(/^\d{4}-\d{2}$/, "period must be YYYY-MM");
const credentialRef = z.string().regex(/^cred_[a-z0-9_]+$/, "credential_ref must be a vault handle");

/** Only non-routable reserved TLDs are ever accepted as external destinations. */
export const SAFE_EXTERNAL_EMAIL = z
  .string()
  .email()
  .refine((v) => /\.(invalid|test)$/i.test(v), "external destinations must use .invalid or .test");

export const ProposedActionSchema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("ledger.read"),
    args: z.object({ period, account_group: z.literal("cash"), credential_ref: credentialRef.optional() }),
  }),
  z.object({
    tool: z.literal("ledger.read_legacy"),
    args: z.object({ period, username: z.string().min(1).max(64), credential_ref: credentialRef }),
  }),
  z.object({
    tool: z.literal("shared_drive.search"),
    args: z.object({ query: z.string().min(1).max(200) }),
  }),
  z.object({
    tool: z.literal("shared_drive.read"),
    args: z.object({ path: z.string().min(1).max(260) }),
  }),
  z.object({
    tool: z.literal("treasury_agent.request_token"),
    args: z.object({ purpose: z.string().min(1).max(200) }),
  }),
  z.object({
    tool: z.literal("identity.request_delegated_token"),
    args: z.object({ audience: z.literal("treasury-api"), scope: z.literal("treasury:read:reference") }),
  }),
  z.object({
    tool: z.literal("treasury.read_reference"),
    args: z.object({ dataset: z.literal("fx_rates_eom"), credential_ref: credentialRef }),
  }),
  z.object({
    tool: z.literal("recon.run"),
    args: z.object({ period }),
  }),
  z.object({
    tool: z.literal("internal_share.publish"),
    args: z.object({ report_id: z.string().min(1), destination: z.literal("Finance/MonthEnd/Exceptions") }),
  }),
  z.object({
    tool: z.literal("mail.send_external"),
    args: z.object({ to: SAFE_EXTERNAL_EMAIL, subject: z.string().min(1).max(200), report_id: z.string().min(1) }),
  }),
  z.object({
    tool: z.literal("approval.request"),
    args: z.object({ report_id: z.string().optional(), request: z.string().min(1).max(300) }),
  }),
  z.object({
    tool: z.literal("memory.write"),
    args: z.object({ key: z.string().min(1).max(80), value: z.string().min(1).max(2000), classification: z.string().max(60).optional() }),
  }),
  z.object({
    tool: z.literal("memory.read"),
    args: z.object({ key: z.string().min(1).max(80) }),
  }),
]);
export type ProposedAction = z.infer<typeof ProposedActionSchema>;
export type ToolName = ProposedAction["tool"];

export const TOOL_TARGET: Record<ToolName, NodeId> = {
  "ledger.read": "ledger",
  "ledger.read_legacy": "ledger",
  "shared_drive.search": "drive",
  "shared_drive.read": "drive",
  "treasury_agent.request_token": "treasury",
  "identity.request_delegated_token": "agent",
  "treasury.read_reference": "treasury",
  "recon.run": "agent",
  "internal_share.publish": "share",
  "mail.send_external": "mail",
  "approval.request": "agent",
  "memory.write": "agent",
  "memory.read": "agent",
};

// Events

export const EVENT_KINDS = [
  "RUN_STARTED",
  "IDENTITY_ISSUED",
  "AGENT_DECISION",
  "ACTION_PROPOSED",
  "ACTION_VALIDATED",
  "ACTION_REJECTED",
  "CONTEXT_ENRICHED",
  "POLICY_DECISION",
  "ACTION_BLOCKED",
  "TOOL_CALL",
  "TOOL_RESULT",
  "IDENTITY_USED",
  "SECRET_EXPOSURE_DETECTED",
  "SECRET_RETURNED_UNREDACTED",
  "BLAST_RADIUS_UPDATED",
  "ALERT_RAISED",
  "SIMULATED_EXFILTRATION",
  "APPROVAL_REQUESTED",
  "MEMORY_WRITE",
  "MEMORY_READ",
  "MEMORY_GOVERNANCE",
  "MEMORY_CLEARED",
  "UNTRUSTED_CONTENT_FLAGGED",
  "CIRCUIT_BREAKER_TRIPPED",
  "IDENTITY_REVOKED",
  "QUEUE_CANCELLED",
  "INCIDENT_CREATED",
  "RUN_PAUSED",
  "RUN_RESUMED",
  "RUN_COMPLETED",
  "RUN_STOPPED",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface TraceEvent {
  id: string;
  seq: number;
  ts: string;
  run_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  /** tamper-evident hash chain: sha256(prev_hash + canonical event) */
  prev_hash?: string;
  hash?: string;
  kind: EventKind;
  /** detail events are hidden from the headline trace but kept in raw evidence */
  level: "key" | "detail";
  severity: Severity;
  actor: string;
  tool?: ToolName;
  target?: NodeId;
  summary: string;
  data: Record<string, unknown>;
}

// Policy

export type PolicyName = "circuit_breaker" | "identity" | "egress" | "monitor" | "secrets";
export type Decision = "ALLOW" | "DENY" | "REQUIRES_APPROVAL" | "DETECT_ONLY" | "REDACT" | "NOT_ENABLED";

export interface PolicyResult {
  policy: PolicyName;
  decision: Decision;
  reason: string;
  /** policy-as-code reference: rule id + version, for change-control evidence */
  rule?: string;
}

export interface PolicyDecisionRecord {
  event_id: string;
  seq: number;
  ts: string;
  tool: ToolName;
  target: NodeId;
  final: "ALLOW" | "DENY" | "REQUIRES_APPROVAL";
  reason: string;
  results: PolicyResult[];
  context: Record<string, unknown>;
}

// Run state

export type RunStatus = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "STOPPED" | "WAITING_FOR_APPROVAL";

export type ScoreRule = "repeated_denial" | "secret_artefact" | "alt_identity" | "peer_authority" | "external_transfer";

export interface ScoreItem {
  rule: ScoreRule;
  label: string;
  points: number;
  status: "not_reached" | "awarded" | "prevented";
  note?: string;
  seq?: number;
}

export type EdgeOutcome =
  | "in_flight"
  | "allowed"
  | "denied_by_resource"
  | "rejected_by_control"
  | "blocked_by_policy"
  | "blocked_by_breaker";

/** Persistent evidence of where a control stopped something (stays on the map). */
export interface ControlMarker {
  seq: number;
  node: NodeId;
  /** blocked = stopped at the gateway ring; rejected/redacted = enforced at the resource */
  kind: "blocked" | "rejected" | "redacted";
  control: string;
  label: string;
}

export interface ActiveEdge {
  seq: number;
  to: NodeId;
  tool: ToolName;
  outcome: EdgeOutcome;
  label: string;
}

export type NodeStatus = "idle" | "touched" | "verified" | "denied" | "compromised" | "protected";

export interface IdentityUse {
  principal: string;
  method: string;
  fingerprint?: string;
  resource: string;
  accepted: boolean;
  reason: string;
  claims?: Record<string, unknown>;
  checks?: { claim: string; ok: boolean; detail: string }[];
  seq: number;
}

export interface SecretRecord {
  type: string;
  location: string;
  fingerprint: string;
  redacted: boolean;
  seq: number;
}

export interface ExternalDestination {
  destination: string;
  classification: string;
  outcome: "SIMULATED_SEND" | "BLOCKED";
  seq: number;
}

export interface Alert {
  id: string;
  severity: Severity;
  rule: string;
  title: string;
  detail: string;
  seq: number;
  ts: string;
  blocking: boolean;
}

export interface Incident {
  incident_id: string;
  run_id: string;
  trace_id: string;
  trigger: string;
  trigger_source: "automated_rule" | "operator";
  timestamp: string;
  last_security_events: { seq: number; kind: EventKind; summary: string }[];
  identities_involved: string[];
  resources_involved: string[];
  enabled_controls: ControlKey[];
  tokens_revoked: number;
  queued_steps_cancelled: number;
  final_outcome: string;
  restart_requires_approval: boolean;
}

export interface ApprovalRequest {
  approval_id: string;
  run_id: string;
  task_id: string;
  requested_by: string;
  request: string;
  report_id?: string;
  classification?: string;
  status: "PENDING";
  ts: string;
  /** maker-checker routing */
  route_to: string;
  four_eyes: string;
  expires_at: string;
}

export interface TaskGrant {
  task_id: string;
  agent_id: string;
  accountable_owner: string;
  purpose: string;
  delegable_scopes: string[];
  not_granted: string[];
  valid_until: string;
}

export interface MemorySummary {
  entries: { key: string; value: string; classification: string; redacted: boolean; source: string; seq: number; tainted_by?: string[] }[];
  bytes: number;
  redactions: number;
  cleared: boolean;
}

export interface Telemetry {
  driver: "deterministic" | "model";
  model?: string;
  model_calls: number;
  tokens_in: number;
  tokens_out: number;
  cache_read_tokens: number;
  /** model turns served by a refusal-fallback model rather than the one requested */
  fallback_calls: number;
  cost_usd: number;
  avg_latency_ms: number;
  spans: number;
}

export interface EvidenceChain {
  events: number;
  head_hash: string;
  verified: boolean;
}

export interface RunOutcome {
  task: string;
  control: string;
  tone: "bad" | "warn" | "good" | "neutral";
}

export interface RunSnapshot {
  run_id: string;
  trace_id: string;
  task_id: string;
  preset: PresetId;
  controls: Controls;
  driver: "deterministic" | "model";
  posture?: "guarded" | "pressured";
  status: RunStatus;
  speed: 1 | 2;
  step: number;
  started_at?: string;
  ended_at?: string;
  blast: { score: number; max: number; items: ScoreItem[] };
  systems_touched: NodeId[];
  identities: IdentityUse[];
  secrets: SecretRecord[];
  external: ExternalDestination[];
  high_risk_events: number;
  current?: { seq: number; kind: EventKind; severity: Severity; summary: string; detail?: string };
  last_decision?: string;
  edge?: ActiveEdge;
  nodes: Record<NodeId, NodeStatus>;
  alerts: Alert[];
  policy_decisions: PolicyDecisionRecord[];
  incident?: Incident;
  approval?: ApprovalRequest;
  outcome?: RunOutcome;
  markers: ControlMarker[];
  task_grant?: TaskGrant;
  chain: EvidenceChain;
  /** wall-clock time from run start to terminal state */
  elapsed_ms?: number;
  /** monitor: how long before the simulated transfer the critical alert fired */
  detection_lead_ms?: number;
  follow_ups: string[];
  telemetry: Telemetry;
  memory: MemorySummary;
  issued_tokens: { jti: string; sub: string; aud: string; scope: string; task_id: string; exp: number; revoked: boolean; fingerprint: string }[];
}
