import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Mock shared drive. Reads only under <repo>/demo-fixtures. No home-directory,
 * host or credential-store access. Path traversal, absolute paths, drive
 * letters, UNC paths, null bytes and symlink escapes are rejected.
 */

export class PathRejectedError extends Error {
  constructor(public readonly requested: string, reason: string) {
    super(`path rejected: ${reason}`);
  }
}

export function fixturesRoot(): string {
  return path.resolve(process.env.ABR_FIXTURES_DIR ?? path.join(process.cwd(), "demo-fixtures"));
}

const MAX_BYTES = 64 * 1024;

/** Resolve a drive-relative path strictly inside the fixture root. */
export function resolveFixturePath(requested: string): string {
  if (typeof requested !== "string" || requested.length === 0) throw new PathRejectedError(String(requested), "empty path");
  if (requested.includes("\0")) throw new PathRejectedError(requested, "null byte");
  if (/%2e|%2f|%5c/i.test(requested)) throw new PathRejectedError(requested, "encoded path characters");
  if (path.isAbsolute(requested) || path.win32.isAbsolute(requested) || /^[a-zA-Z]:/.test(requested) || requested.startsWith("\\\\"))
    throw new PathRejectedError(requested, "absolute paths are not permitted");
  if (requested.split(/[\\/]+/).some((seg) => seg === ".." || seg === "~"))
    throw new PathRejectedError(requested, "path traversal is not permitted");

  const root = fixturesRoot();
  const full = path.resolve(root, requested);
  const rel = path.relative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new PathRejectedError(requested, "outside demo-fixtures");

  // Symlink escape check on the real path.
  const realRoot = realpathSync(root);
  const real = realpathSync(full);
  const realRel = path.relative(realRoot, real);
  if (realRel.startsWith("..") || path.isAbsolute(realRel)) throw new PathRejectedError(requested, "resolves outside demo-fixtures");
  return real;
}

function walk(dir: string, root: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, root, out);
    else if (entry.isFile()) out.push(path.relative(root, full).split(path.sep).join("/"));
  }
}

export function listFixtures(): string[] {
  const root = fixturesRoot();
  const out: string[] = [];
  walk(root, root, out);
  return out.sort();
}

export interface SearchHit {
  path: string;
  score: number;
  matched_terms: string[];
}

export function searchFixtures(query: string): SearchHit[] {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  const hits: SearchHit[] = [];
  for (const rel of listFixtures()) {
    const text = (rel + "\n" + readFixture(rel)).toLowerCase();
    const matched = terms.filter((t) => text.includes(t));
    if (matched.length) hits.push({ path: rel, score: matched.length, matched_terms: matched });
  }
  return hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, 5);
}

export function readFixture(requested: string): string {
  const full = resolveFixturePath(requested);
  const st = statSync(full);
  if (!st.isFile()) throw new PathRejectedError(requested, "not a file");
  if (st.size > MAX_BYTES) throw new PathRejectedError(requested, "file too large");
  return readFileSync(full, "utf8");
}
