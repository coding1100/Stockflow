import { subscribeRealtime, type RealtimeTopic } from '@stockflow/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID: RealtimeTopic[] = ['inventory', 'activity', 'dashboard', 'waves'];

/**
 * Server-Sent Events endpoint. Subscribes to the requested Redis pub/sub topic and
 * forwards each message to the browser as an SSE frame. Chosen over WebSocket because
 * updates are server→client only and SSE auto-reconnects and survives proxies cleanly.
 * Requires a long-lived connection — runs on the Node runtime (not edge/serverless).
 */
export async function GET(req: Request, { params }: { params: { topic: string } }) {
  const topic = params.topic as RealtimeTopic;
  if (!VALID.includes(topic)) return new Response('Unknown topic', { status: 404 });

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let ping: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => controller.enqueue(encoder.encode(data));
      send(`event: open\ndata: {}\n\n`);
      unsubscribe = subscribeRealtime(topic, (msg) => send(`data: ${JSON.stringify(msg)}\n\n`));
      ping = setInterval(() => send(`: ping\n\n`), 15000);
      req.signal.addEventListener('abort', () => {
        clearInterval(ping);
        unsubscribe();
        controller.close();
      });
    },
    cancel() {
      clearInterval(ping);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
