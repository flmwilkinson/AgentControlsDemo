import { describe, expect, it } from "vitest";
import { NO_CONTROLS, PRESETS } from "@/lib/engine/controls";
import { executeAction } from "@/lib/engine/gateway";
import { MemoryStore } from "@/lib/engine/memory";
import { AGENT_TOOLS } from "@/lib/engine/model/adapter";
import { screenUntrustedContent } from "@/lib/engine/policies/monitor";
import { Run } from "@/lib/engine/run";
import { readFixture } from "@/lib/engine/tools/sharedDrive";
import { TOOL_TARGET } from "@/lib/engine/types";

describe("live-model tool surface", () => {
  it("exposes every allowlisted action as its own strict, typed tool", () => {
    expect(AGENT_TOOLS).toHaveLength(Object.keys(TOOL_TARGET).length);
    for (const t of AGENT_TOOLS) {
      expect(t.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(t.strict).toBe(true);
      expect(t.description?.length).toBeGreaterThan(10);
      expect(t.input_schema.additionalProperties).toBe(false);
    }
  });

  it("strips JSON Schema keywords that strict tools reject", () => {
    const json = JSON.stringify(AGENT_TOOLS);
    for (const k of ["$schema", "minLength", "maxLength", "minimum", "maximum", '"const"']) expect(json).not.toContain(k);
  });
});

describe("indirect prompt injection screen (MON-005)", () => {
  it("flags the poisoned runbook", () => {
    expect(screenUntrustedContent(readFixture("Finance/Reconciliation/OPERATIONS_RUNBOOK.md")).length).toBeGreaterThanOrEqual(3);
  });

  it("does not flag ordinary procedure documents or the legacy script", () => {
    for (const p of ["Finance/Reconciliation/procedure.md", "Finance/Reconciliation/2026-07/recon_notes.md", "Finance/Reconciliation/archive/recon_legacy.ps1", "Treasury/Reference/fx_policy.md"]) {
      expect(screenUntrustedContent(readFixture(p)), p).toEqual([]);
    }
  });

  it("raises a detect-only alert when monitoring is on, and delivers the content unchanged", async () => {
    const run = await Run.create({ controls: { ...NO_CONTROLS, monitor: true }, preset: "custom", persist: false });
    const out = await executeAction(run, { tool: "shared_drive.read", args: { path: "Finance/Reconciliation/OPERATIONS_RUNBOOK.md" } });
    expect(out.status).toBe("executed");
    expect(run.events.some((e) => e.kind === "UNTRUSTED_CONTENT_FLAGGED")).toBe(true);
    expect(run.alerts.some((a) => a.rule === "MON-005")).toBe(true);
  });

  it("is silent when monitoring is off", async () => {
    const run = await Run.create({ controls: NO_CONTROLS, preset: "custom", persist: false });
    await executeAction(run, { tool: "shared_drive.read", args: { path: "Finance/Reconciliation/OPERATIONS_RUNBOOK.md" } });
    expect(run.events.some((e) => e.kind === "UNTRUSTED_CONTENT_FLAGGED")).toBe(false);
  });
});

describe("memory provenance", () => {
  it("marks agent-authored notes written after reading untrusted content as tainted", () => {
    const mem = new MemoryStore("TSK-1");
    expect(mem.write("a", "before", "Internal", "model-tool").entry.tainted_by).toBeUndefined();
    mem.noteUntrustedSource("Finance/Reconciliation/OPERATIONS_RUNBOOK.md");
    expect(mem.write("b", "after", "Internal", "model-tool").entry.tainted_by).toEqual(["Finance/Reconciliation/OPERATIONS_RUNBOOK.md"]);
    expect(mem.write("c", "runtime note", "Internal", "agent-runtime").entry.tainted_by).toBeUndefined();
  });

  it("a gateway drive read taints the run's memory", async () => {
    const run = await Run.create({ controls: PRESETS.find((p) => p.id === "all")!.controls, preset: "custom", persist: false });
    await executeAction(run, { tool: "shared_drive.read", args: { path: "Finance/Reconciliation/procedure.md" } });
    await executeAction(run, { tool: "memory.write", args: { key: "k", value: "v" } });
    expect(run.snapshot().memory.entries.find((e) => e.key.endsWith(":k"))?.tainted_by).toBeDefined();
  });
});
