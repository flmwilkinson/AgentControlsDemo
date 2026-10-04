import { describe, expect, it } from "vitest";
import { NO_CONTROLS } from "@/lib/engine/controls";
import { executeAction } from "@/lib/engine/gateway";
import { IdentityBroker } from "@/lib/engine/identity/broker";
import { breakerPostCheck } from "@/lib/engine/policies/breaker";
import { EGRESS_DENY_REASON, classifyDestination, evaluateEgress } from "@/lib/engine/policies/egress";
import { EXFIL_SEQUENCE, matchesSequence } from "@/lib/engine/policies/monitor";
import { Run } from "@/lib/engine/run";
import { readSink } from "./helpers";

describe("identity broker (jose)", () => {
  const base = { sub: "month-end-recon-agent", aud: "ledger-api", scope: "ledger:read:cash", task_id: "T1", run_id: "R1" };
  const exp = { audience: "ledger-api", requiredScope: "ledger:read:cash", presenter: "month-end-recon-agent", task_id: "T1" };

  it("issues a JWT with the required claims and validates it", async () => {
    const b = new IdentityBroker();
    const t = await b.issue(base);
    for (const k of ["sub", "aud", "scope", "task_id", "run_id", "jti", "iat", "exp"]) expect(t.claims).toHaveProperty(k);
    expect(t.claims.exp - t.claims.iat).toBe(300);
    expect((await b.verify(t.token, exp)).ok).toBe(true);
  });

  it.each([
    ["subject", { presenter: "treasury-ops-agent" }, /sub:/],
    ["audience", { audience: "treasury-api" }, /aud:/],
    ["scope", { requiredScope: "payments:initiate" }, /scope:/],
    ["task", { task_id: "OTHER" }, /task_id:/],
  ])("rejects wrong %s", async (_n, override, re) => {
    const b = new IdentityBroker();
    const t = await b.issue(base);
    const v = await b.verify(t.token, { ...exp, ...override });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(re);
  });

  it("rejects expired and revoked tokens, and tokens from another broker", async () => {
    let now = 1_000_000;
    const b = new IdentityBroker(() => now);
    const t = await b.issue(base);
    now += 301;
    expect((await b.verify(t.token, exp)).ok).toBe(false);
    now -= 301;
    b.revokeRun("R1");
    const v = await b.verify(t.token, exp);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/revoked/);
    const other = new IdentityBroker();
    expect((await other.verify((await b.issue(base)).token, exp)).ok).toBe(false);
  });
});

describe("egress policy", () => {
  const input = {
    action: "mail.send_external",
    data_classification: "Restricted - Finance",
    destination: "analyst.personal@example.invalid",
    destination_class: classifyDestination("analyst.personal@example.invalid"),
    agent_id: "a",
    task_id: "t",
    run_id: "r",
    approved_exception: false,
  };
  it("requires approval for restricted data to a non-approved external destination", () => {
    expect(input.destination_class).toBe("external-non-approved");
    expect(evaluateEgress(input)).toMatchObject({ policy: "egress", decision: "REQUIRES_APPROVAL", reason: EGRESS_DENY_REASON, rule: expect.stringMatching(/^EGR-/) });
  });
  it("allows internal destinations and approved exceptions", () => {
    expect(evaluateEgress({ ...input, destination_class: classifyDestination("ops@bank.test") }).decision).toBe("ALLOW");
    expect(evaluateEgress({ ...input, destination_class: "external-approved", approved_exception: true }).decision).toBe("ALLOW");
  });
});

describe("monitor correlation", () => {
  it("matches the ordered sequence only", () => {
    expect(matchesSequence(EXFIL_SEQUENCE)).toBe(true);
    expect(matchesSequence(["credential_discovery", "peer_authority_request", "alternate_identity", "external_transfer_attempt"])).toBe(false);
    expect(matchesSequence(["credential_discovery", "alternate_identity", "peer_authority_request"])).toBe(false);
  });
});

describe("circuit breaker + STOP AGENT", () => {
  it("post rules", () => {
    expect(breakerPostCheck({ denied: 0, authorityExpansion: 2 })).toMatch(/authority-expansion/);
    expect(breakerPostCheck({ denied: 5, authorityExpansion: 0 })).toMatch(/denied/);
    expect(breakerPostCheck({ denied: 4, authorityExpansion: 1 })).toBeNull();
  });

  it("operator stop mid-run blocks new actions, revokes tokens and writes an incident", async () => {
    const run = await Run.create({ controls: { ...NO_CONTROLS, identity: true }, preset: "custom" });
    const p = run.decide()!;
    await run.act(p);
    expect(run.injectedLedgerToken).toBeDefined();
    expect(run.stop("Operator pressed STOP AGENT", "operator")).toBe(true);
    expect(run.status).toBe("STOPPED");
    expect(run.stop("again", "operator")).toBe(false);
    expect(run.broker.listIssued().every((t) => t.revoked)).toBe(true);
    expect(run.decide()).toBeNull();
    const out = await executeAction(run, { tool: "ledger.read", args: { period: "2026-08", account_group: "cash" } });
    expect(out).toMatchObject({ status: "blocked", by: "circuit_open" });
    expect(readSink("incidents").find((i) => i.run_id === run.run_id)).toMatchObject({
      trigger_source: "operator",
      enabled_controls: ["identity"],
    });
  });

  it("breaker blocks a restricted external transfer when egress control is absent", async () => {
    const run = await Run.create({ controls: { ...NO_CONTROLS, breaker: true, secrets: true }, preset: "custom" });
    await run.runToEnd();
    expect(run.status).toBe("STOPPED");
    expect(readSink("simulated-outbox").some((r) => r.run_id === run.run_id)).toBe(false);
  });
});
