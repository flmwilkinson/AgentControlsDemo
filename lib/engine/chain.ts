import { createHash } from "node:crypto";
import type { TraceEvent } from "./types";

/**
 * Tamper-evident evidence: every event carries sha256(prev_hash + canonical
 * event body). Editing, deleting or reordering any record breaks the chain
 * from that point on. (In production this would be anchored to WORM storage.)
 */

export const GENESIS = "0".repeat(64);

function canonical(e: Omit<TraceEvent, "hash">): string {
  const { prev_hash, ...body } = e;
  return JSON.stringify({ prev_hash, body });
}

export function hashEvent(e: Omit<TraceEvent, "hash">): string {
  return createHash("sha256").update(canonical(e)).digest("hex");
}

export function verifyChain(events: TraceEvent[]): { verified: boolean; broken_at?: number } {
  let prev = GENESIS;
  for (const e of events) {
    const { hash, ...rest } = e;
    if (e.prev_hash !== prev || hashEvent(rest) !== hash) return { verified: false, broken_at: e.seq };
    prev = hash!;
  }
  return { verified: true };
}
