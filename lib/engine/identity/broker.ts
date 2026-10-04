import { SignJWT, decodeJwt, errors, generateKeyPair, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { fingerprint } from "../mask";

/**
 * Local mock identity broker. Issues short-lived ES256 JWTs for agent
 * workloads. No network, no cloud IdP: keys are generated in-process.
 * Raw tokens are returned only to the in-memory credential vault and are
 * never written to events or evidence.
 */

export const ISSUER = "urn:demo:identity-broker";
export const DEFAULT_TTL_SEC = 300;

export interface IssueRequest {
  sub: string;
  aud: string;
  scope: string;
  task_id: string;
  run_id: string;
  ttlSec?: number;
}

export interface TokenClaims {
  iss: string;
  sub: string;
  aud: string;
  scope: string;
  task_id: string;
  run_id: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface IssuedToken {
  token: string;
  claims: TokenClaims;
  fingerprint: string;
}

export interface Expectation {
  audience: string;
  requiredScope: string;
  /** the workload identity actually presenting the token (from the gateway channel) */
  presenter: string;
  task_id: string;
}

export interface ClaimCheck {
  claim: "signature" | "exp" | "revocation" | "sub" | "aud" | "scope" | "task_id";
  ok: boolean;
  detail: string;
}

export type VerifyResult =
  | { ok: true; claims: TokenClaims; checks: ClaimCheck[] }
  | { ok: false; reason: string; claims?: Partial<TokenClaims>; checks: ClaimCheck[] };

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

export class IdentityBroker {
  private keys: Promise<KeyPair>;
  private revoked = new Set<string>();
  private issued = new Map<string, TokenClaims>();

  constructor(private now: () => number = () => Math.floor(Date.now() / 1000)) {
    this.keys = generateKeyPair("ES256");
  }

  async issue(req: IssueRequest): Promise<IssuedToken> {
    const { privateKey } = await this.keys;
    const iat = this.now();
    const exp = iat + (req.ttlSec ?? DEFAULT_TTL_SEC);
    const jti = randomUUID();
    const token = await new SignJWT({ scope: req.scope, task_id: req.task_id, run_id: req.run_id })
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .setIssuer(ISSUER)
      .setSubject(req.sub)
      .setAudience(req.aud)
      .setJti(jti)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(privateKey);
    const claims: TokenClaims = { iss: ISSUER, sub: req.sub, aud: req.aud, scope: req.scope, task_id: req.task_id, run_id: req.run_id, jti, iat, exp };
    this.issued.set(jti, claims);
    return { token, claims, fingerprint: fingerprint(token) };
  }

  /** Resource-side validation. Every claim is checked and reported. */
  async verify(token: string, exp: Expectation): Promise<VerifyResult> {
    const { publicKey } = await this.keys;
    const checks: ClaimCheck[] = [];
    let claims: TokenClaims;
    try {
      const { payload } = await jwtVerify(token, publicKey, {
        issuer: ISSUER,
        algorithms: ["ES256"],
        currentDate: new Date(this.now() * 1000),
      });
      claims = payload as unknown as TokenClaims;
      checks.push({ claim: "signature", ok: true, detail: "ES256 signature valid (issuer identity-broker)" });
      checks.push({ claim: "exp", ok: true, detail: `expires in ${claims.exp - this.now()}s` });
    } catch (e) {
      let partial: Partial<TokenClaims> | undefined;
      try {
        partial = decodeJwt(token) as Partial<TokenClaims>;
      } catch {
        partial = undefined;
      }
      if (e instanceof errors.JWTExpired) {
        checks.push({ claim: "exp", ok: false, detail: "token expired" });
        return { ok: false, reason: "token expired", claims: partial, checks };
      }
      checks.push({ claim: "signature", ok: false, detail: "signature/issuer validation failed" });
      return { ok: false, reason: "invalid token signature or issuer", claims: partial, checks };
    }

    const revoked = this.revoked.has(claims.jti);
    checks.push({ claim: "revocation", ok: !revoked, detail: revoked ? "jti revoked" : "not revoked" });
    const subOk = claims.sub === exp.presenter;
    checks.push({ claim: "sub", ok: subOk, detail: subOk ? `sub = ${claims.sub}` : `issued to ${claims.sub}, presented by ${exp.presenter}` });
    const audOk = claims.aud === exp.audience;
    checks.push({ claim: "aud", ok: audOk, detail: audOk ? `aud = ${claims.aud}` : `aud ${claims.aud} != ${exp.audience}` });
    const scopeOk = claims.scope.split(" ").includes(exp.requiredScope);
    checks.push({ claim: "scope", ok: scopeOk, detail: scopeOk ? `includes ${exp.requiredScope}` : `missing ${exp.requiredScope}` });
    const taskOk = claims.task_id === exp.task_id;
    checks.push({ claim: "task_id", ok: taskOk, detail: taskOk ? `task ${claims.task_id}` : `task ${claims.task_id} != ${exp.task_id}` });

    const failed = checks.filter((c) => !c.ok);
    if (failed.length) {
      return { ok: false, reason: failed.map((c) => `${c.claim}: ${c.detail}`).join("; "), claims, checks };
    }
    return { ok: true, claims, checks };
  }

  revoke(jti: string): void {
    this.revoked.add(jti);
  }

  /** Revoke every token issued for a run. Returns count newly revoked. */
  revokeRun(run_id: string): number {
    let n = 0;
    for (const [jti, c] of this.issued) {
      if (c.run_id === run_id && !this.revoked.has(jti)) {
        this.revoked.add(jti);
        n++;
      }
    }
    return n;
  }

  isRevoked(jti: string): boolean {
    return this.revoked.has(jti);
  }

  listIssued(): (TokenClaims & { revoked: boolean })[] {
    return [...this.issued.values()].map((c) => ({ ...c, revoked: this.revoked.has(c.jti) }));
  }
}
