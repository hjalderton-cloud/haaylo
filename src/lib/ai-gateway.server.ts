/**
 * Lovable AI Gateway helpers — run-id propagation for the AI SDK.
 *
 * Reused by the streaming agent route. The gateway mints an
 * `X-Lovable-AIG-Run-ID` per request; this wrapper captures it from the first
 * gateway response and resends it on follow-up calls inside the same server
 * request, so the browser can correlate a chat turn with gateway usage logs.
 *
 * Server-only: reads `LOVABLE_API_KEY` inside the request boundary.
 */
const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export function createLovableAiGatewayRunIdFetch(initialRunId?: string) {
  let runId = initialRunId?.trim() || undefined;
  let resolveRunId: (value: string | undefined) => void = () => {};
  let runIdResolved = false;
  const runIdReady = new Promise<string | undefined>((resolve) => {
    resolveRunId = resolve;
  });

  const publishRunId = (value?: string) => {
    const nextRunId = value?.trim() || undefined;
    if (!runId && nextRunId) runId = nextRunId;
    if (!runIdResolved) {
      runIdResolved = true;
      resolveRunId(runId);
    }
  };
  if (runId) publishRunId(runId);

  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(LOVABLE_AIG_RUN_ID_HEADER)) {
        headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
      }
      try {
        const response = await fetch(input, { ...init, headers });
        publishRunId(response.headers.get(LOVABLE_AIG_RUN_ID_HEADER) ?? undefined);
        return response;
      } catch (error) {
        publishRunId(undefined);
        throw error;
      }
    },
    getRunId: () => runId,
    waitForRunId: () => (runId ? Promise.resolve(runId) : runIdReady),
  };
}

export function getLovableAiGatewayRunId(request: Request): string | undefined {
  return request.headers.get(LOVABLE_AIG_RUN_ID_HEADER)?.trim() || undefined;
}

export function getLovableAiGatewayResponseHeaders(
  providerHeaders: HeadersInit | undefined,
  init?: HeadersInit,
): Headers {
  const headers = new Headers(init);
  const exposed = new Set(
    (headers.get("Access-Control-Expose-Headers") ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
  );

  new Headers(providerHeaders).forEach((value, name) => {
    if (name.toLowerCase().startsWith("x-lovable-aig-")) {
      headers.set(name, value);
      exposed.add(name);
    }
  });

  headers.forEach((_, name) => {
    if (name.toLowerCase().startsWith("x-lovable-aig-")) exposed.add(name);
  });

  if (exposed.size > 0) {
    headers.set("Access-Control-Expose-Headers", Array.from(exposed).join(", "));
  }
  return headers;
}

export async function withLovableAiGatewayRunIdHeader(
  response: Response,
  gateway: { getRunId: () => string | undefined; waitForRunId: () => Promise<string | undefined> },
  init?: HeadersInit,
): Promise<Response> {
  if (!response.body) {
    const runId = gateway.getRunId();
    const headers = getLovableAiGatewayResponseHeaders(undefined, response.headers);
    new Headers(init).forEach((value, name) => headers.set(name, value));
    if (runId) headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: getLovableAiGatewayResponseHeaders(undefined, headers),
    });
  }

  const reader = response.body.getReader();
  const firstChunk = reader.read();
  const runId = await gateway.waitForRunId();
  const headers = getLovableAiGatewayResponseHeaders(undefined, response.headers);
  new Headers(init).forEach((value, name) => headers.set(name, value));
  if (runId) headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);

  const body = new ReadableStream({
    async start(controller) {
      try {
        const first = await firstChunk;
        if (first.done) {
          controller.close();
          return;
        }
        controller.enqueue(first.value);
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          controller.enqueue(chunk.value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason?: unknown) {
      return reader.cancel(reason);
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: getLovableAiGatewayResponseHeaders(undefined, headers),
  });
}
