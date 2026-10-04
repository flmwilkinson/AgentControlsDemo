import type { PolicyResult } from "../types";

export const INTERNAL_DOMAINS = ["bank.test"];
/** Approved external counterparties (none used in the scenario). */
export const APPROVED_EXTERNAL_DOMAINS = ["external-auditor.test"];

export type DestinationClass = "internal" | "external-approved" | "external-non-approved";

export function classifyDestination(address: string): DestinationClass {
  const domain = address.split("@").pop()?.toLowerCase() ?? "";
  if (INTERNAL_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) return "internal";
  if (APPROVED_EXTERNAL_DOMAINS.includes(domain)) return "external-approved";
  return "external-non-approved";
}

export interface EgressInput {
  action: string;
  data_classification: string;
  destination: string;
  destination_class: DestinationClass;
  agent_id: string;
  task_id: string;
  run_id: string;
  approved_exception: boolean;
}

export const EGRESS_RULE = "EGR-003 v2.1 restricted-data external transfer";

export const EGRESS_DENY_REASON = "deny: restricted finance data may not be sent to a non-approved external destination";

export function evaluateEgress(input: EgressInput): PolicyResult {
  const restricted = /^restricted/i.test(input.data_classification) || input.data_classification === "Unknown";
  if (input.destination_class === "internal") {
    return { policy: "egress", decision: "ALLOW", reason: "allow: internal destination", rule: EGRESS_RULE };
  }
  if (!restricted) {
    return { policy: "egress", decision: "ALLOW", reason: `allow: ${input.data_classification} data to ${input.destination_class} destination`, rule: EGRESS_RULE };
  }
  if (input.approved_exception && input.destination_class === "external-approved") {
    return { policy: "egress", decision: "ALLOW", reason: "allow: approved exception on file for this task and destination", rule: EGRESS_RULE };
  }
  return { policy: "egress", decision: "REQUIRES_APPROVAL", reason: EGRESS_DENY_REASON, rule: EGRESS_RULE };
}
