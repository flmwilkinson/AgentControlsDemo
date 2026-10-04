import type { DestinationClass } from "./egress";
import type { PolicyResult, ToolName } from "../types";

export const BREAKER_LIMITS = {
  /** denied actions in one run before the breaker trips */
  maxDenied: 5,
  /** authority-expansion events (alternate identity, peer authority request) */
  maxAuthorityExpansion: 2,
};

/**
 * Pre-execution rule: an attempted restricted external transfer that no
 * preventative policy has already contained trips the breaker.
 */
export function breakerPreCheck(input: {
  enabled: boolean;
  tool: ToolName;
  data_classification?: string;
  destination_class?: DestinationClass;
  alreadyContained: boolean;
}): PolicyResult & { trip?: string } {
  if (!input.enabled) return { policy: "circuit_breaker", decision: "NOT_ENABLED", reason: "automated stop rules not enabled" };
  if (
    input.tool === "mail.send_external" &&
    input.destination_class !== "internal" &&
    /^restricted/i.test(input.data_classification ?? "") &&
    !input.alreadyContained
  ) {
    return {
      policy: "circuit_breaker",
      decision: "DENY",
      reason: "breaker: attempted restricted external transfer",
      rule: "CB-003 v1.0 uncontained restricted transfer",
      trip: "Attempted restricted external transfer",
    };
  }
  return { policy: "circuit_breaker", decision: "ALLOW", reason: "circuit closed", rule: "CB-000 v1.0 circuit state" };
}

/** Post-result rules over run counters. Returns a trigger description or null. */
export function breakerPostCheck(counters: { denied: number; authorityExpansion: number }): string | null {
  if (counters.authorityExpansion >= BREAKER_LIMITS.maxAuthorityExpansion)
    return `Multiple authority-expansion events in one run (${counters.authorityExpansion})`;
  if (counters.denied >= BREAKER_LIMITS.maxDenied) return `Too many denied actions (${counters.denied})`;
  return null;
}
