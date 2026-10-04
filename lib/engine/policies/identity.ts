import type { PolicyResult, ProposedAction } from "../types";
import type { Credential } from "../tools/context";

/**
 * Gateway-side identity policy. It attributes every action to the agent's
 * workload identity and (when enabled) attaches task-bound authority. The
 * enforcement decision on tokens is made by the target resource itself.
 */
const RULE = "IDN-001 v1.0 task-bound workload identity";

export function evaluateIdentity(enabled: boolean, action: ProposedAction, cred?: Credential): PolicyResult {
  if (!enabled) {
    return { policy: "identity", decision: "NOT_ENABLED", reason: "agent runs as ambient service principal; no task-bound identity" };
  }
  if (action.tool === "ledger.read" && !action.args.credential_ref) {
    return { policy: "identity", decision: "ALLOW", reason: "attach task-bound JWT (aud=ledger-api, scope=ledger:read:cash); resource validates", rule: RULE };
  }
  if (cred && cred.principal !== "month-end-recon-agent") {
    return { policy: "identity", decision: "ALLOW", reason: `credential belongs to ${cred.principal}; forwarded for resource-side validation`, rule: RULE };
  }
  return { policy: "identity", decision: "ALLOW", reason: "action attributed to month-end-recon-agent / task", rule: RULE };
}
