import { randomBytes } from "node:crypto";
import { appendJsonl } from "./store";
import type { ModelUsage } from "./model/adapter";

/**
 * OpenTelemetry GenAI span exporter (local, file-based).
 *
 * Emits spans that follow the OpenTelemetry GenAI semantic conventions
 * (semantic-conventions-genai, v1.42.0, June 2026) - the vendor-neutral schema
 * that Langfuse, Arize Phoenix, OpenLLMetry and Laminar have all converged on.
 *
 * This is an EXPORTER: observability as evidence, never the enforcement layer.
 * A real deployment would point an OTLP exporter at a collector; here we append
 * OTLP-shaped JSON to runtime/otel-spans.jsonl so the trace is inspectable
 * offline. Control-plane specifics live under a `bank.control.*` namespace.
 */

const PROVIDER = "anthropic";

export type OtelStatus = "OK" | "ERROR" | "UNSET";

export interface OtelSpan {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  name: string;
  kind: "INTERNAL" | "CLIENT" | "SERVER";
  start_unix_nano: number;
  end_unix_nano?: number;
  duration_ms?: number;
  status: { code: OtelStatus; message?: string };
  attributes: Record<string, string | number | boolean>;
  events: { name: string; time_unix_nano: number; attributes?: Record<string, unknown> }[];
}

function nowNano(): number {
  return Date.now() * 1e6;
}

export class OtelTracer {
  private spans = new Map<string, OtelSpan>();
  private order: string[] = [];

  constructor(
    private trace_id: string,
    private persist: boolean,
    readonly rootSpanId: string = randomBytes(8).toString("hex"),
  ) {}

  private newId(): string {
    return randomBytes(8).toString("hex");
  }

  start(opts: {
    name: string;
    kind?: OtelSpan["kind"];
    parent?: string;
    attributes?: Record<string, string | number | boolean>;
  }): string {
    const span_id = this.newId();
    const span: OtelSpan = {
      trace_id: this.trace_id,
      span_id,
      parent_span_id: opts.parent ?? this.rootSpanId,
      name: opts.name,
      kind: opts.kind ?? "INTERNAL",
      start_unix_nano: nowNano(),
      status: { code: "UNSET" },
      attributes: opts.attributes ?? {},
      events: [],
    };
    this.spans.set(span_id, span);
    this.order.push(span_id);
    return span_id;
  }

  event(span_id: string, name: string, attributes?: Record<string, unknown>): void {
    this.spans.get(span_id)?.events.push({ name, time_unix_nano: nowNano(), attributes });
  }

  end(span_id: string, status: OtelStatus = "OK", message?: string): void {
    const span = this.spans.get(span_id);
    if (!span || span.end_unix_nano) return;
    span.end_unix_nano = nowNano();
    span.duration_ms = (span.end_unix_nano - span.start_unix_nano) / 1e6;
    span.status = { code: status, message };
    if (this.persist) appendJsonl("otel-spans", span);
  }

  /** The run's root span: invoke_agent {agent}. Opened once, closed at run end. */
  startRoot(agent: string, agent_id: string, run_id: string, controls: string[]): string {
    const span: OtelSpan = {
      trace_id: this.trace_id,
      span_id: this.rootSpanId,
      name: `invoke_agent ${agent}`,
      kind: "INTERNAL",
      start_unix_nano: nowNano(),
      status: { code: "UNSET" },
      attributes: {
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.provider.name": PROVIDER,
        "gen_ai.agent.name": agent,
        "gen_ai.agent.id": agent_id,
        "gen_ai.conversation.id": run_id,
        "bank.control.enabled": controls.join(",") || "none",
      },
      events: [],
    };
    this.spans.set(this.rootSpanId, span);
    return this.rootSpanId;
  }

  /** gen_ai chat span for one model call. */
  chat(model: string, usage: ModelUsage, decisionTool: string | null): string {
    const id = this.start({
      name: `chat ${model}`,
      kind: "CLIENT",
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": PROVIDER,
        "gen_ai.request.model": model,
        "gen_ai.response.model": usage.served_by,
        "gen_ai.usage.input_tokens": usage.input_tokens,
        "gen_ai.usage.cache_read.input_tokens": usage.cache_read_tokens,
        "gen_ai.usage.cache_creation.input_tokens": usage.cache_write_tokens,
        "gen_ai.usage.output_tokens": usage.output_tokens,
        "gen_ai.response.finish_reasons": usage.stop_reason,
        "bank.model.fallback": usage.fallback,
      },
    });
    if (decisionTool) this.event(id, "gen_ai.tool.proposed", { "gen_ai.tool.name": decisionTool });
    this.end(id, "OK");
    return id;
  }

  /** execute_tool span for one gateway tool execution. */
  tool(opts: {
    tool: string;
    call_id: string;
    target: string;
    decision: string;
    principal?: string;
    http?: number;
    code?: string;
    blocked: boolean;
    rule?: string;
  }): string {
    const id = this.start({
      name: `execute_tool ${opts.tool}`,
      kind: "INTERNAL",
      attributes: {
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": opts.tool,
        "gen_ai.tool.call.id": opts.call_id,
        "gen_ai.tool.type": "function",
        "bank.resource.target": opts.target,
        "bank.control.decision": opts.decision,
        ...(opts.principal ? { "bank.identity.principal": opts.principal } : {}),
        ...(opts.http ? { "http.response.status_code": opts.http } : {}),
        ...(opts.code ? { "bank.result.code": opts.code } : {}),
        ...(opts.rule ? { "bank.control.rule": opts.rule } : {}),
      },
    });
    this.end(id, opts.blocked ? "ERROR" : "OK", opts.blocked ? opts.decision : undefined);
    return id;
  }

  endRoot(status: OtelStatus, finalStatus: string, blast: number): void {
    const root = this.spans.get(this.rootSpanId);
    if (root) {
      root.attributes["bank.run.final_status"] = finalStatus;
      root.attributes["bank.run.blast_radius"] = blast;
    }
    this.end(this.rootSpanId, status);
  }

  all(): OtelSpan[] {
    const ids = [this.rootSpanId, ...this.order.filter((i) => i !== this.rootSpanId)];
    return ids.map((i) => this.spans.get(i)!).filter(Boolean);
  }
}
