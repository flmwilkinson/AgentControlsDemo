import { describe, expect, it } from "vitest";
import { NO_CONTROLS } from "@/lib/engine/controls";
import { executeAction } from "@/lib/engine/gateway";
import { MemoryStore } from "@/lib/engine/memory";
import { verifyChain } from "@/lib/engine/chain";
import { Run } from "@/lib/engine/run";
import { containsRawSecret } from "@/lib/engine/mask";
import { readSink, runPreset } from "./helpers";

describe("agent memory (governed)", () => {
  it("redacts credential markers before persisting and never stores them raw", () => {
    const mem = new MemoryStore("TSK-1");
    const r = mem.write("route", "user=svc_recon_legacy pass=DEMO_FAKE_SECRET::svc_recon_legacy::hunter2", "Restricted - Finance", "model-tool");
    expect(r.redacted).toBe(true);
    expect(containsRawSecret(r.entry.value)).toBe(false);
    expect(r.entry.value).toContain("[REDACTED_BY_MEMORY_GOVERNANCE]");
    expect(mem.read("route")?.value).not.toContain("DEMO_FAKE_SECRET");
  });

  it("baseline run fills working memory; the fallback-route note never contains the raw secret", async () => {
    const run = await runPreset("baseline");
    const mem = run.snapshot().memory;
    expect(mem.entries.length).toBeGreaterThan(0);
    expect(containsRawSecret(JSON.stringify(mem))).toBe(false);
    const route = mem.entries.find((e) => e.key.endsWith("fallback_route"));
    expect(route).toBeDefined();
    expect(route!.value).not.toContain("DEMO_FAKE_SECRET");
  });

  it("the kill switch clears agent memory", async () => {
    const run = await Run.create({ controls: { ...NO_CONTROLS, breaker: true }, preset: "custom" });
    await run.runToEnd();
    expect(run.status).toBe("STOPPED");
    expect(run.snapshot().memory.cleared).toBe(true);
    expect(run.snapshot().memory.entries).toHaveLength(0);
    expect(run.events.some((e) => e.kind === "MEMORY_CLEARED")).toBe(true);
  });

  it("exposes memory.write / memory.read through the gateway (model tool surface)", async () => {
    const run = await Run.create({ controls: NO_CONTROLS, preset: "custom", persist: false });
    const w = await executeAction(run, { tool: "memory.write", args: { key: "k", value: "hello", classification: "Internal" } });
    expect(w.status).toBe("executed");
    const r = await executeAction(run, { tool: "memory.read", args: { key: "k" } });
    expect(r.status).toBe("executed");
    if (r.status === "executed") expect(r.result.output.value).toBe("hello");
  });
});

describe("OpenTelemetry GenAI spans", () => {
  it("emits a tamper-evident trace and OTLP spans with GenAI semantic attributes", async () => {
    const run = await runPreset("baseline");
    // hash chain over the audit trace
    expect(verifyChain(run.events).verified).toBe(true);

    const spans = run.otel.all();
    const root = spans[0];
    expect(root.name).toBe("invoke_agent month-end-recon-agent");
    expect(root.attributes["gen_ai.operation.name"]).toBe("invoke_agent");
    expect(root.attributes["bank.run.final_status"]).toBe("COMPLETED");

    const tool = spans.find((s) => s.name.startsWith("execute_tool ledger.read"));
    expect(tool?.attributes["gen_ai.operation.name"]).toBe("execute_tool");
    expect(tool?.attributes["gen_ai.tool.name"]).toBe("ledger.read");

    // every span closed and parented into the same trace
    expect(spans.every((s) => s.end_unix_nano && s.trace_id === run.trace_id)).toBe(true);

    const persisted = readSink("otel-spans").filter((r) => r.trace_id === run.trace_id);
    expect(persisted.length).toBeGreaterThan(0);
  });

  it("telemetry reports zero model spend for a deterministic run", async () => {
    const t = (await runPreset("all")).snapshot().telemetry;
    expect(t.driver).toBe("deterministic");
    expect(t.model_calls).toBe(0);
    expect(t.cost_usd).toBe(0);
    expect(t.spans).toBeGreaterThan(0);
  });
});
