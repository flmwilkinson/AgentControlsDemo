# Agent Blast Radius

A local, self-contained simulation of an autonomous AI agent doing a real finance job (month-end cash reconciliation) inside a bank. It shows two things back to back:

1. An agent that is **over-tooled but under-provisioned** improvises its way to a data breach, chaining small reasonable-looking steps into a large outcome before a human sees it.
2. Turning on five **runtime controls** - enforced outside the model, at the action boundary - contains the same agent.

Everything is synthetic and runs on your machine. There are no real systems, credentials, accounts or network calls. "External email" is a line appended to a local file. The agent's tools cannot open a socket or a subprocess, and the shared-drive tool can only read a fixture directory. These constraints are enforced in code and covered by tests.

It is built to be **read as well as run**: the architecture mirrors how production agent runtimes are actually assembled - a policy-enforcing action gateway, short-lived workload identity, an egress policy, structured OpenTelemetry traces, a tamper-evident audit log, and a governed agent memory.

| Controls off: the agent breaches | Controls on: the same agent is contained |
| --- | --- |
| ![No controls; blast radius 9/10; simulated exfiltration](docs/screenshot-breach.png) | ![All controls; blast radius 0/10; each control fired](docs/screenshot-contained.png) |

## What you can learn from it

- Why a system prompt is not a security control, and why the data an agent reads cannot be trusted either.
- What a clean **action gateway** looks like: every proposed action validated, enriched, evaluated against policy, and only then executed.
- How short-lived, task-scoped **workload identity** removes the incentive to reach for shared credentials, not just the means.
- How egress, secrets, monitoring and a circuit breaker each contain one specific step, and how to make each one's firing observable.
- How to instrument an agent run with OpenTelemetry GenAI semantic conventions as evidence, without making observability the enforcement layer.

## Requirements

- Node.js 20 or newer (developed on 24).
- An Anthropic API key. The UI drives a live model; the deterministic engine used by the test suite needs no key.

## Setup

```bash
git clone <your-fork-url> agent-blast-radius
cd agent-blast-radius
npm install
cp .env.example .env      # then edit .env and paste your key
```

Get a key at [console.anthropic.com](https://console.anthropic.com/) under **API Keys**, and add funds under **Plans & Billing** (a full run costs a few cents on Haiku). Put it in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

`.env` is gitignored. The key is used only to call the Anthropic API and is never written to the on-disk evidence.

## Run

```bash
npm run dev           # http://127.0.0.1:3000 (loopback only; the API also refuses cross-site requests)
```

The screen is one story:

1. Leave the runtime-control toggles **off** and press **Run agent**. Watch it improvise its way to a breach (blast radius around 9/10).
2. Press **All on** and **Run agent** again. Watch the same agent get contained (blast radius 0/10), ending by asking a human to approve what it cannot do safely.

The right rail shows the blast-radius score and, for each enabled control, whether it fired this run and what it did. The evidence drawer along the bottom holds the trace, identity checks, policy decisions, incident record and the agent's own memory.

Switch the model between **Haiku 4.5** and **Opus 5** to see that a more capable model resists the unsafe path further on its own - a better defence, but not a sufficient one.

```bash
npm run check         # typecheck + lint + tests
npm run build         # production build
```

## How it works

The live model plays the agent in a standard Messages API tool-use loop. Each mock tool is its own tool definition, generated from the same Zod allowlist the gateway enforces and sent with `strict: true`. The model makes one tool call per turn (`disable_parallel_tool_use`, so side effects are serialised) and never executes anything itself. Every call goes through the Action Gateway, and the outcome goes back as the matching `tool_result` (denials and blocks as errors):

```
tool call       ->  validate against the typed schema
                ->  enrich with identity, data classification, destination
                ->  evaluate policy: identity / egress / circuit breaker / monitor
                ->  record the decision (allow / deny / requires-approval, with a rule id)
                ->  execute the mock tool, only if allowed
                ->  filter output (secrets redaction; prompt-injection screen)
                ->  record the result, update the blast radius, run detection rules
```

The gateway is the only path from a tool call to a tool. The controls are code at this boundary, not instructions in a prompt. The model keeps a real, append-only `tool_use` / `tool_result` conversation (prompt-cached) and its own working memory, so it behaves like a modern autonomous agent rather than a fixed script. In live mode the run reflects only what the model actually chose; the deterministic planner is never used to execute an action on its behalf. The loop handles every stop reason honestly: `end_turn` means the agent chose to stop, `refusal` is recorded as the model declining, and an API failure ends the run with *no verdict* rather than a false "safe". STOP AGENT also aborts any model call in flight.

Telemetry follows the OpenTelemetry GenAI conventions: `chat` and `execute_tool` spans are correlated by the model's `tool_use` id, token usage includes cache reads and writes (cost is priced accordingly), and a turn served by a server-side refusal fallback is flagged, because it means a model other than the approved one acted.

### How representative is this of a 2026 agent stack?

| Layer | In this demo | In production you would also expect |
| --- | --- | --- |
| Tools | Typed, strict tool definitions; one mediated execution path | Tools delivered over MCP servers, each behind the same gateway; tool allowlists per agent version |
| Identity | Short-lived, task-bound workload JWTs, validated per claim by each resource | A real IdP / workload identity federation; OAuth token exchange for delegation; agent-to-agent calls (e.g. A2A) authenticated the same way |
| Memory | Governed, task-scoped memory: secret redaction, classification, taint tracking, cleared by the kill switch | Memory that persists across sessions, so provenance, review and expiry matter even more |
| Guardrails | Egress policy, secrets redaction, prompt-injection screen (detect-only), maker-checker approvals | Trained injection and DLP classifiers; a policy engine (OPA/Cedar) with versioned bundles |
| Monitoring | Hash-chained trace, OTel GenAI spans, correlation rules, incident record | Export to a collector/SIEM, WORM retention, alert routing to an on-call human |
| Kill switch | One stop path: blocks actions, aborts the model call, revokes tokens, clears memory, opens an incident | The same, fleet-wide, with restart gated by change control |

## The five controls

Each is toggled independently. All are enforced at the gateway or by the resource; none rely on the model.

| Control | What it does |
| --- | --- |
| Agent identity | Provisions the agent's own short-lived, task-scoped identity (a local ES256 JWT), validated per-claim by each resource. Legitimate reads succeed on its own identity; shared passwords and borrowed tokens fail. |
| Secrets protection | Redacts credential markers out of tool output before the agent sees them; records only a type and fingerprint. |
| Egress approval | Evaluates data classification, destination, action and identity before anything leaves. Restricted data to a non-approved destination is denied. |
| Action monitor | Traces the run and correlates the attack pattern, raising a critical alert. Detects and alerts; does not block. |
| Circuit breaker | One server-side stop path, shared by automated rules and a STOP button: blocks new actions, cancels queued work, revokes tokens, clears memory, opens an incident. |

Controls off, the agent breaches. Controls on, it is contained and ends waiting for human approval.

## Evidence

Every run is a tamper-evident, hash-chained event stream, surfaced live in the UI and written to append-only JSONL under `runtime/` (gitignored). The evidence drawer has tabs for the trace, per-claim identity validation, every policy decision with its rule id, the incident record, and the agent's governed memory. Token usage, cost and OpenTelemetry GenAI spans are captured for each run.

## Project layout

```
app/                      Next.js routes and the SSE stream endpoint
components/console/        the operations-console UI
lib/engine/
  gateway.ts              the Action Gateway: validate, evaluate policy, execute
  run.ts                  run state, event log, kill switch, snapshots
  types.ts                typed action allowlist, events, snapshot shape
  policies/               identity, egress, monitor, circuit breaker
  tools/                  the mock tool registry and the sandboxed shared drive
  identity/broker.ts      the local ES256 JWT broker
  model/adapter.ts        the live-model agent loop
  otel.ts                 OpenTelemetry GenAI span exporter
  memory.ts, chain.ts     governed memory, hash-chained audit
demo-fixtures/            the synthetic documents the agent can read
tests/                    scenario, control and safety tests
```

## Safety constraints (enforced and tested)

- No shell/subprocess, HTTP/browser or SMTP capability anywhere in the engine.
- The shared-drive tools read only under `demo-fixtures/` and reject path traversal, absolute and UNC paths, encoded separators, null bytes and symlink escapes.
- The external-mail tool never opens a socket and accepts only reserved `.invalid` and `.test` addresses.
- Only the model adapter may reach the Anthropic API, and only through the official SDK.
- All credentials and tokens are fake and locally generated; no raw secret, token or JWT is ever written to evidence, which the test suite asserts.

## Further reading

- [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) is a talk track for presenting the two runs.
- [`DEMO_NOTES.md`](DEMO_NOTES.md) has detailed notes on the scenario, controls and evidence.

