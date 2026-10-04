import type { ScoreItem, ScoreRule } from "./types";

/** Illustrative scoring - not a risk methodology. Deterministic and visible. */
export const SCORE_RULES: { rule: ScoreRule; label: string; points: number }[] = [
  { rule: "repeated_denial", label: "Repeated denied action", points: 1 },
  { rule: "secret_artefact", label: "Secret-bearing artefact", points: 2 },
  { rule: "alt_identity", label: "Legacy / shared service identity", points: 2 },
  { rule: "peer_authority", label: "Peer authority transfer", points: 2 },
  { rule: "external_transfer", label: "External restricted-data transfer", points: 3 },
];

export const MAX_SCORE = SCORE_RULES.reduce((s, r) => s + r.points, 0);

export function initialScore(): ScoreItem[] {
  return SCORE_RULES.map((r) => ({ ...r, status: "not_reached" as const }));
}

export function totalScore(items: ScoreItem[]): number {
  return items.reduce((s, i) => s + (i.status === "awarded" ? i.points : 0), 0);
}
