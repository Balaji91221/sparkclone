const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

// Hop-by-hop headers are connection-scoped: forwarding them upstream (or back
// to the browser) corrupts the new connection.
const SKIP_REQUEST_HEADERS = new Set([
  "connection",
  "host",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
]);

const SKIP_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "transfer-encoding",
]);

function forwardHeaders(req: Request): Headers {
  const headers = new Headers();
  req.headers.forEach((value, name) => {
    if (!SKIP_REQUEST_HEADERS.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  });
  return headers;
}

/**
 * Proxy one request to the FastAPI backend.
 *
 * This exists instead of a `next.config.ts` rewrite because the dev server's
 * built-in proxy throws an unhandled error when the upstream connection fails
 * (backend restarting, a reset keep-alive socket), which kills the whole dev
 * server process. Here the failure is caught and answered with a 502, so a
 * blip degrades one request instead of taking the site down.
 */
export async function proxyToBackend(req: Request): Promise<Response> {
  const incoming = new URL(req.url);
  const target = `${BACKEND}${incoming.pathname}${incoming.search}`;

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: forwardHeaders(req),
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: "backend unreachable", detail: reason, target },
      { status: 502 },
    );
  }

  const headers = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!SKIP_RESPONSE_HEADERS.has(name.toLowerCase())) {
      headers.append(name, value);
    }
  });

  return new Response(upstream.body, { status: upstream.status, headers });
}
