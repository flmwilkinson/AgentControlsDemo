import { manager, type StreamMessage } from "@/lib/engine/manager";

export const dynamic = "force-dynamic";

/** Server-Sent Events: pushes masked run snapshots + new trace events. */
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (m: StreamMessage) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(m)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = manager.subscribe(send);
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 15000);
      cleanup = () => {
        unsubscribe();
        clearInterval(ping);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
