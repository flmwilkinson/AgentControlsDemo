import type { IdentityBroker, IssuedToken } from "../identity/broker";
import type { MemoryStore } from "../memory";
import { fingerprint } from "../mask";
import type { Controls, ScoreRule } from "../types";

export const AGENT_ID = "month-end-recon-agent";
export const PEER_AGENT_ID = "treasury-ops-agent";
export const LEGACY_PRINCIPAL = "svc_recon_legacy";
export const PERIOD = "2026-08";
export const REPORT_CLASSIFICATION = "Restricted - Finance";
/** Synthetic accountable owner and maker-checker approver for the task. */
export const TASK_OWNER = "Financial Control - Month-End Close (role: FC-OWNER, synthetic)";
export const APPROVER_ROLE = "Head of Financial Control (data owner, Restricted - Finance)";

export type CredentialKind = "task_jwt" | "delegated_jwt" | "peer_jwt" | "peer_static_bearer" | "legacy_password";

export interface Credential {
  ref: string;
  kind: CredentialKind;
  principal: string;
  /** raw value: in-process memory only, never emitted */
  value: string;
  fingerprint: string;
  jti?: string;
  source: string;
}

/**
 * The agent's credential working memory. The agent refers to credentials only
 * by handle (credential_ref). Raw values never leave this process-local map.
 */
export class CredentialVault {
  private creds = new Map<string, Credential>();
  private n = 0;

  store(kind: CredentialKind, principal: string, value: string, source: string, jti?: string): Credential {
    const ref = `cred_${kind}_${++this.n}`;
    const c: Credential = { ref, kind, principal, value, fingerprint: fingerprint(value), jti, source };
    this.creds.set(ref, c);
    return c;
  }

  get(ref: string): Credential | undefined {
    return this.creds.get(ref);
  }

  /** Drop every credential (kill switch). Returns count. */
  purge(): number {
    const n = this.creds.size;
    this.creds.clear();
    return n;
  }

  list(): { credential_ref: string; kind: CredentialKind; principal: string }[] {
    return [...this.creds.values()].map((c) => ({ credential_ref: c.ref, kind: c.kind, principal: c.principal }));
  }

  describe(ref: string): { credential_ref: string; kind: CredentialKind; principal: string; fingerprint: string } | undefined {
    const c = this.creds.get(ref);
    return c && { credential_ref: c.ref, kind: c.kind, principal: c.principal, fingerprint: c.fingerprint };
  }
}

export interface Report {
  report_id: string;
  title: string;
  classification: string;
  period: string;
  exceptions: number;
  rows: number;
}

export interface Artefacts {
  ledger?: { period: string; rows: number; source: string; classification: string };
  treasury?: { dataset: string; source: string };
  report?: Report;
}

export interface ToolContext {
  run_id: string;
  trace_id: string;
  task_id: string;
  agent_id: string;
  controls: Controls;
  broker: IdentityBroker;
  vault: CredentialVault;
  memory: MemoryStore;
  artefacts: Artefacts;
  /** task-bound ledger token injected by the gateway when the identity control is on */
  injectedLedgerToken?: IssuedToken;
  /** the peer agent's own credentials (it is the weak link in baseline) */
  peer: { staticToken: string; jwt?: IssuedToken };
}

export type SecurityTag =
  | "credential_discovery"
  | "alternate_identity"
  | "peer_authority_request"
  | "peer_authority_use"
  | "external_transfer_attempt"
  | "untrusted_instruction";

export interface IdentityUseDraft {
  principal: string;
  method: string;
  fingerprint?: string;
  resource: string;
  accepted: boolean;
  reason: string;
  claims?: Record<string, unknown>;
  checks?: { claim: string; ok: boolean; detail: string }[];
}

export interface ToolResult {
  status: "ok" | "denied" | "error";
  http: number;
  code?: string;
  summary: string;
  /** what is returned to the agent (may contain raw fixture text in baseline; the gateway filters it) */
  output: Record<string, unknown>;
  identity?: IdentityUseDraft;
  tags?: SecurityTag[];
  score?: { rule: ScoreRule; status: "awarded" | "prevented"; note: string }[];
  /** marks the target node as compromised (unsafe success) */
  compromised?: boolean;
  exfiltration?: { destination: string; classification: string; message_id: string };
  approval_id?: string;
}
