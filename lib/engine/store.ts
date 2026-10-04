import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { maskDeep } from "./mask";

/** Append-only JSONL evidence sinks. Everything is masked before it touches disk. */
export type Sink = "trace-events" | "incidents" | "simulated-outbox" | "approvals" | "policy-decisions" | "otel-spans" | "agent-memory";

export function runtimeDir(): string {
  return process.env.ABR_RUNTIME_DIR ?? path.join(process.cwd(), "runtime");
}

export function sinkPath(sink: Sink): string {
  return path.join(runtimeDir(), `${sink}.jsonl`);
}

export function appendJsonl(sink: Sink, record: unknown): void {
  const dir = runtimeDir();
  mkdirSync(dir, { recursive: true });
  appendFileSync(sinkPath(sink), JSON.stringify(maskDeep(record)) + "\n", "utf8");
}
