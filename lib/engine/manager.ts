import { Run } from "./run";
import type { Controls, PresetId, RunSnapshot, TraceEvent } from "./types";
import type { Plan } from "./planner";

/**
 * Process-wide replay orchestrator. Drives one Run with timers so the audience
 * can follow it, and fans out snapshots over SSE. All state is server-side:
 * the browser only renders what it is sent.
 */

export interface StreamMessage {
  type: "state";
  snapshot: RunSnapshot | null;
  events: TraceEvent[];
  /** true when events is the full history (new client or new run) */
  reset: boolean;
}

const STEP_MS: Record<1 | 2, number> = { 1: 2600, 2: 1300 };
/** fraction of a step between the agent's decision and the gateway acting on it */
const DECIDE_FRACTION = 0.4;

class RunManager {
  run?: Run;
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Plan;
  private sentSeq = 0;
  private clients = new Set<(m: StreamMessage) => void>();

  async start(opts: { controls: Controls; preset: PresetId; speed: 1 | 2; useModel?: boolean; posture?: "guarded" | "pressured"; model?: string }): Promise<void> {
    this.clearTimer();
    this.pending = undefined;
    const run = await Run.create({ controls: opts.controls, preset: opts.preset, speed: opts.speed, useModel: opts.useModel, posture: opts.posture, model: opts.model });
    run.onHalt = () => {
      this.clearTimer();
      this.pending = undefined;
    };
    this.run = run;
    this.broadcast(true);
    this.schedule(600);
  }

  pause(): void {
    if (this.run?.pause()) {
      this.clearTimer();
      this.broadcast();
    }
  }

  resume(): void {
    if (this.run?.resume()) {
      this.broadcast();
      this.schedule(300);
    }
  }

  setSpeed(speed: 1 | 2): void {
    if (this.run) {
      this.run.speed = speed;
      this.broadcast();
    }
  }

  /** STOP AGENT: the same server-side stop path the automated rules use. */
  stop(): boolean {
    if (!this.run) return false;
    const stopped = this.run.stop("Operator pressed STOP AGENT", "operator");
    this.broadcast();
    return stopped;
  }

  reset(): void {
    this.clearTimer();
    this.pending = undefined;
    this.run = undefined;
    this.broadcast(true);
  }

  snapshot(): RunSnapshot | null {
    return this.run?.snapshot() ?? null;
  }

  subscribe(fn: (m: StreamMessage) => void): () => void {
    this.clients.add(fn);
    fn({ type: "state", snapshot: this.snapshot(), events: this.run?.events ?? [], reset: true });
    return () => this.clients.delete(fn);
  }

  private schedule(ms: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    const run = this.run;
    this.timer = undefined;
    if (!run || run.terminal || run.status !== "RUNNING") return;
    const stepMs = STEP_MS[run.speed];

    if (!this.pending) {
      const plan = run.useModel ? await run.decideAsync() : run.decide();
      if (this.run !== run) return; // replaced while awaiting the model
      this.broadcast();
      if (!plan) return;
      this.pending = plan;
      this.schedule(stepMs * DECIDE_FRACTION);
      return;
    }

    const plan = this.pending;
    this.pending = undefined;
    await run.act(plan);
    if (this.run !== run) return; // replaced while awaiting
    this.broadcast();
    if (!run.terminal && run.status === "RUNNING") this.schedule(stepMs * (1 - DECIDE_FRACTION));
  }

  private broadcast(reset = false): void {
    const events = this.run?.events ?? [];
    const fresh = reset ? events : events.filter((e) => e.seq > this.sentSeq);
    this.sentSeq = events.length ? events[events.length - 1].seq : 0;
    const msg: StreamMessage = { type: "state", snapshot: this.snapshot(), events: fresh, reset };
    for (const c of this.clients) c(msg);
  }
}

const g = globalThis as unknown as { __abrManager?: RunManager };
export const manager: RunManager = (g.__abrManager ??= new RunManager());
