import { existsSync, readFileSync } from "node:fs";
import { PRESETS } from "@/lib/engine/controls";
import { Run } from "@/lib/engine/run";
import { sinkPath, type Sink } from "@/lib/engine/store";
import type { PresetId } from "@/lib/engine/types";

export async function runPreset(id: Exclude<PresetId, "custom">): Promise<Run> {
  const p = PRESETS.find((x) => x.id === id)!;
  const run = await Run.create({ controls: p.controls, preset: id });
  await run.runToEnd();
  return run;
}

export function readSink(sink: Sink): Record<string, unknown>[] {
  const p = sinkPath(sink);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export function sinkText(sink: Sink): string {
  const p = sinkPath(sink);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

export const kinds = (run: Run) => run.events.map((e) => e.kind);
export const tools = (run: Run) => run.events.filter((e) => e.kind === "AGENT_DECISION").map((e) => e.tool);
