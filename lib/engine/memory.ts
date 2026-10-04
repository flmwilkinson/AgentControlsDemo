import { DEMO_SECRET_RE, DEMO_TOKEN_RE, JWT_RE, fingerprint } from "./mask";

/**
 * Governed agent memory - a local, task-scoped working memory for the
 * autonomous agent. This is the "memory tool" surface of a modern agent
 * runtime, and it is also a governed resource:
 *   - every write is scanned; credential/token/JWT markers are redacted
 *     before anything is persisted (memory poisoning / secret spillage);
 *   - each entry keeps a data classification;
 *   - each agent-authored entry records provenance: if the agent had already
 *     read untrusted content (shared-drive documents), the entry is tainted by
 *     it. Memory is a persistence channel for injected instructions, so a
 *     reviewer needs to know which notes may carry someone else's words;
 *   - the kill switch clears it (revocation includes what the agent remembers).
 *
 * Entirely in-process; nothing here opens a socket.
 */

export interface MemoryEntry {
  key: string;
  value: string;
  classification: string;
  redacted: boolean;
  bytes: number;
  seq: number;
  ts: string;
  source: "agent-runtime" | "model-tool";
  /** untrusted sources the agent had ingested before writing this entry */
  tainted_by?: string[];
}

export interface MemoryWriteResult {
  entry: MemoryEntry;
  redacted: boolean;
  fingerprints: string[];
}

const SECRET_SCANS = [DEMO_SECRET_RE, DEMO_TOKEN_RE, JWT_RE];

export class MemoryStore {
  private map = new Map<string, MemoryEntry>();
  cleared = false;
  redactions = 0;
  private n = 0;
  private untrusted = new Set<string>();

  constructor(private taskId: string) {}

  private scan(value: string): { clean: string; redacted: boolean; fingerprints: string[] } {
    let clean = value;
    const fps: string[] = [];
    for (const re of SECRET_SCANS) {
      clean = clean.replace(new RegExp(re.source, "g"), (m) => {
        fps.push(fingerprint(m));
        return "[REDACTED_BY_MEMORY_GOVERNANCE]";
      });
    }
    return { clean, redacted: fps.length > 0, fingerprints: fps };
  }

  /** Record that untrusted content has entered the agent's context. */
  noteUntrustedSource(source: string): void {
    this.untrusted.add(source);
  }

  write(key: string, value: string, classification: string, source: MemoryEntry["source"]): MemoryWriteResult {
    const scanned = this.scan(String(value).slice(0, 2000));
    if (scanned.redacted) this.redactions++;
    const entry: MemoryEntry = {
      key: `${this.taskId}:${key}`.slice(0, 120),
      value: scanned.clean,
      classification,
      redacted: scanned.redacted,
      bytes: Buffer.byteLength(scanned.clean, "utf8"),
      seq: ++this.n,
      ts: new Date().toISOString(),
      source,
      tainted_by: source === "model-tool" && this.untrusted.size ? [...this.untrusted] : undefined,
    };
    this.map.set(entry.key, entry);
    return { entry, redacted: scanned.redacted, fingerprints: scanned.fingerprints };
  }

  read(key: string): MemoryEntry | undefined {
    return this.map.get(`${this.taskId}:${key}`) ?? this.map.get(key);
  }

  entries(): MemoryEntry[] {
    return [...this.map.values()].sort((a, b) => a.seq - b.seq);
  }

  bytes(): number {
    return this.entries().reduce((n, e) => n + e.bytes, 0);
  }

  /** Kill switch: forget everything. Returns count cleared. */
  clear(): number {
    const n = this.map.size;
    this.map.clear();
    this.cleared = true;
    return n;
  }
}
