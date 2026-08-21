import { handleApiError } from "@/lib/http";
import { requireProjectmAdmin } from "@/server/auth";
import { subscribeToItuneQueue } from "@/server/itune-queue-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  try {
    await requireProjectmAdmin(request);
  } catch (error) {
    return handleApiError(error, "เชื่อมต่อคิวแบบเรียลไทม์ไม่สำเร็จ");
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (value) => {
        if (!closed) controller.enqueue(encoder.encode(value));
      };
      const unsubscribe = subscribeToItuneQueue((revision) => {
        send(`event: queue\ndata: ${revision}\n\n`);
      });
      const heartbeat = setInterval(() => send(": heartbeat\n\n"), 20_000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          // The browser may already have closed the stream.
        }
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
      send("retry: 3000\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
