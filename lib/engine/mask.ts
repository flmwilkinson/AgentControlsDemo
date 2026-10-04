import { createHash } from "node:crypto";

/** Explicit fake-secret marker used in demo-fixtures. */
export const DEMO_SECRET_RE = /DEMO_FAKE_SECRET::[^\s"'`]+/g;
/** Explicit fake static bearer tokens handed out by the mock peer agent. */
export const DEMO_TOKEN_RE = /DEMO_FAKE_TOKEN::[^\s"'`]+/g;
/** Any compact JWS (header.payload.signature). */
export const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

const SENSITIVE_KEYS = /^(password|passwd|secret|token|access_token|authorization|bearer|raw_token|credential_value)$/i;

export function fingerprint(value: string): string {
  return "sha256:" + createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function maskString(s: string): string {
  return s
    .replace(DEMO_SECRET_RE, (m) => `[REDACTED_DEMO_SECRET ${fingerprint(m)}]`)
    .replace(DEMO_TOKEN_RE, (m) => `[REDACTED_DEMO_TOKEN ${fingerprint(m)}]`)
    .replace(JWT_RE, (m) => `[JWT ${fingerprint(m)}]`);
}

/** Deep-mask any value before it becomes evidence (events, JSONL, SSE). */
export function maskDeep<T>(value: T): T {
  if (typeof value === "string") return maskString(value) as T;
  if (Array.isArray(value)) return value.map((v) => maskDeep(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) && typeof v === "string" ? `[MASKED ${fingerprint(v)}]` : maskDeep(v);
    }
    return out as T;
  }
  return value;
}

export function containsRawSecret(s: string): boolean {
  return new RegExp(DEMO_SECRET_RE.source).test(s) || new RegExp(DEMO_TOKEN_RE.source).test(s) || new RegExp(JWT_RE.source).test(s);
}
