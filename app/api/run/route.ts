import { z } from "zod";
import { manager } from "@/lib/engine/manager";
import { modelConfig } from "@/lib/engine/model/adapter";
import { ControlsSchema, PRESET_IDS } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

const Command = z.discriminatedUnion("command", [
  z.object({ command: z.literal("start"), controls: ControlsSchema, preset: z.enum(PRESET_IDS), speed: z.union([z.literal(1), z.literal(2)]), useModel: z.boolean().optional(), posture: z.enum(["guarded", "pressured"]).optional(), model: z.enum(["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"]).optional() }),
  z.object({ command: z.literal("pause") }),
  z.object({ command: z.literal("resume") }),
  z.object({ command: z.literal("reset") }),
  z.object({ command: z.literal("stop") }),
  z.object({ command: z.literal("speed"), speed: z.union([z.literal(1), z.literal(2)]) }),
]);

export async function GET() {
  return Response.json({ snapshot: manager.snapshot(), events: manager.run?.events ?? [] });
}

/**
 * Commands drive a run that can spend real API credit, so only accept them
 * from this app's own origin (blocks cross-site form/fetch CSRF from other tabs).
 */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser local tooling (curl, tests)
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "cross-origin request refused" }, { status: 403 });
  if (!req.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "expected application/json" }, { status: 415 });
  const parsed = Command.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid command" }, { status: 400 });
  const cmd = parsed.data;
  switch (cmd.command) {
    case "start": {
      const cfg = modelConfig();
      await manager.start({ ...cmd, useModel: !!cmd.useModel && cfg.hasKey });
      break;
    }
    case "pause":
      manager.pause();
      break;
    case "resume":
      manager.resume();
      break;
    case "reset":
      manager.reset();
      break;
    case "stop":
      manager.stop();
      break;
    case "speed":
      manager.setSpeed(cmd.speed);
      break;
  }
  return Response.json({ ok: true, snapshot: manager.snapshot() });
}
