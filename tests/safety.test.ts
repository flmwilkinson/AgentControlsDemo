import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeAction } from "@/lib/engine/gateway";
import { NO_CONTROLS, PRESETS } from "@/lib/engine/controls";
import { containsRawSecret } from "@/lib/engine/mask";
import { Run } from "@/lib/engine/run";
import { PathRejectedError, listFixtures, readFixture, resolveFixturePath } from "@/lib/engine/tools/sharedDrive";
import { ProposedActionSchema } from "@/lib/engine/types";
import { runPreset, sinkText } from "./helpers";

describe("shared drive sandbox", () => {
  const bad = [
    "../package.json",
    "Finance/../../package.json",
    "..\\..\\Windows\\win.ini",
    "/etc/passwd",
    "C:\\Windows\\win.ini",
    "C:/Users",
    "\\\\server\\share\\x",
    "~/.ssh/id_rsa",
    "Finance/%2e%2e/%2e%2e/package.json",
    "Finance/\0recon",
  ];
  it.each(bad)("rejects %s", (p) => {
    expect(() => resolveFixturePath(p)).toThrow(PathRejectedError);
  });

  it("reads fixtures and lists only files under demo-fixtures", () => {
    expect(readFixture("Finance/Reconciliation/archive/recon_legacy.ps1")).toContain("SYNTHETIC DEMO FIXTURE");
    const files = listFixtures();
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => !f.includes(".."))).toBe(true);
  });

  it("gateway returns PATH_REJECTED for traversal attempts", async () => {
    const run = await Run.create({ controls: NO_CONTROLS, preset: "baseline", persist: false });
    const out = await executeAction(run, { tool: "shared_drive.read", args: { path: "../../.ssh/id_rsa" } });
    expect(out.status).toBe("executed");
    if (out.status === "executed") expect(out.result.code).toBe("PATH_REJECTED");
  });
});

describe("typed allowlist", () => {
  it("rejects unknown tools (no shell, http or browser tools exist)", async () => {
    const run = await Run.create({ controls: NO_CONTROLS, preset: "baseline", persist: false });
    for (const tool of ["shell.exec", "http.get", "browser.open", "fs.read"]) {
      const out = await executeAction(run, { tool, args: { cmd: "whoami" } });
      expect(out.status).toBe("rejected");
    }
  });

  it("rejects routable external destinations even with every control off", () => {
    const mk = (to: string) => ({ tool: "mail.send_external", args: { to, subject: "x", report_id: "r" } });
    expect(ProposedActionSchema.safeParse(mk("someone@gmail.com")).success).toBe(false);
    expect(ProposedActionSchema.safeParse(mk("a@example.com")).success).toBe(false);
    expect(ProposedActionSchema.safeParse(mk("a@example.invalid")).success).toBe(true);
    expect(ProposedActionSchema.safeParse(mk("a@partner.test")).success).toBe(true);
  });
});

describe("evidence hygiene", () => {
  it("no raw fake secret, static token or JWT reaches runtime evidence or events", async () => {
    const runs = [];
    for (const p of PRESETS) runs.push(await runPreset(p.id));
    for (const sink of ["trace-events", "incidents", "simulated-outbox", "approvals", "policy-decisions", "otel-spans", "agent-memory"] as const) {
      expect(containsRawSecret(sinkText(sink)), sink).toBe(false);
    }
    for (const r of runs) {
      expect(containsRawSecret(JSON.stringify(r.events))).toBe(false);
      expect(containsRawSecret(JSON.stringify(r.snapshot()))).toBe(false);
    }
    expect(sinkText("trace-events")).toContain("REDACTED_DEMO_SECRET");
  });
});

describe("no network / subprocess capability in the engine", () => {
  // Sockets, subprocesses, SMTP and host/home access are forbidden everywhere.
  const FORBIDDEN = [
    /from\s+["'](node:)?(child_process|net|tls|dgram|http|https|http2)["']/,
    /require\(["'](node:)?(child_process|net|tls|dgram|http|https)["']\)/,
    /nodemailer|smtp/i,
    /os\.homedir|process\.env\.HOME|USERPROFILE/,
  ];
  // Only the model adapter may reach an LLM API, and only via the vetted SDK.
  const NETWORK = /\bfetch\s*\(|@anthropic-ai\/sdk|openai/i;
  const isModelDir = (f: string) => f.replace(/\\/g, "/").includes("/lib/engine/model/");

  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (f.endsWith(".ts")) files.push(f);
    }
  };
  walk(path.join(process.cwd(), "lib", "engine"));

  it.each(files.map((f) => [path.relative(process.cwd(), f), f]))("%s has no socket/subprocess/SMTP capability", (_rel, f) => {
    const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    for (const re of FORBIDDEN) expect(re.test(src), String(re)).toBe(false);
  });

  it("mock tools and gateway never import an LLM client (only the model adapter may)", () => {
    for (const f of files) {
      if (isModelDir(f)) continue;
      const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(NETWORK.test(src), path.relative(process.cwd(), f)).toBe(false);
    }
  });
});
