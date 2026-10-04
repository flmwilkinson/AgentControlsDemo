import { modelConfig } from "@/lib/engine/model/adapter";

export const dynamic = "force-dynamic";

/** Reports whether a live-model driver is available (never returns the key). */
export function GET() {
  const cfg = modelConfig();
  return Response.json({ model_available: cfg.hasKey, model: cfg.hasKey ? cfg.model : null });
}
