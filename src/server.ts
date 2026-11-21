import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const contentType = headers.get("content-type") ?? "";
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=(), usb=()");
  if (contentType.includes("text/html") || contentType.includes("json")) {
    headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  if (new URL(request.url).protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

type ScheduledEnv = { WEBSITE_INVENTORY_SYNC_SECRET?: string };
type ScheduledController = { cron: string; scheduledTime: number };

export default {
  async scheduled(controller: ScheduledController, env: ScheduledEnv, ctx: unknown) {
    const secret = env.WEBSITE_INVENTORY_SYNC_SECRET;
    if (!secret) {
      console.warn('[website-inventory] scheduled publisher skipped: service secret is not configured');
      return;
    }
    const handler = await getServerEntry();
    const request = new Request('https://bizsathi.internal/api/public/website-inventory', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ action: 'publish_outbox' }),
    });
    const response = await handler.fetch(request, env, ctx);
    if (!response.ok) {
      throw new Error(`Website inventory outbox publisher returned HTTP ${response.status}`);
    }
    const result = await response.json() as { ok?: boolean; skipped?: boolean; published?: number; blocked?: boolean };
    if (result.ok !== true) {
      throw new Error('Website inventory outbox publisher did not confirm completion');
    }
    console.info('[website-inventory] scheduled outbox run', {
      cron: controller.cron,
      scheduledTime: controller.scheduledTime,
      skipped: result.skipped === true,
      published: result.published ?? 0,
      blocked: result.blocked === true,
    });
  },

  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response), request);
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      }), request);
    }
  },
};
