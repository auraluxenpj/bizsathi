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

type ScheduledEnv = {
  WEBSITE_INVENTORY_SYNC_SECRET?: string;
  AURALUXE_CATALOGUE_IMPORT_ONCE?: string;
};
type ScheduledController = { cron: string; scheduledTime: number };
type TriggerEnv = ScheduledEnv & { AURALUXE_IMPORT_TRIGGER_TOKEN?: string };

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

export default {
  async scheduled(controller: ScheduledController, env: ScheduledEnv, ctx: unknown) {
    const secret = env.WEBSITE_INVENTORY_SYNC_SECRET;
    if (!secret) {
      console.warn('[website-inventory] scheduled publisher skipped: service secret is not configured');
      return;
    }
    const handler = await getServerEntry();

    // One-shot, explicitly enabled full snapshot import runs before unrelated
    // outbox work. It reuses the server-side credential and exits after the
    // receiver confirms every SKU mapping, so unrelated queue errors cannot
    // prevent the approved initial catalogue import.
    if (env.AURALUXE_CATALOGUE_IMPORT_ONCE === "true") {
      const snapshotRequest = new Request('https://bizsathi.internal/api/public/auraluxe-catalogue-reconcile-publish', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ action: 'publish_snapshot' }),
      });
      const snapshotResponse = await handler.fetch(snapshotRequest, env, ctx);
      if (!snapshotResponse.ok) {
        throw new Error(`Auraluxe full catalogue snapshot publisher returned HTTP ${snapshotResponse.status}`);
      }
      const snapshotResult = await snapshotResponse.json() as {
        ok?: boolean;
        snapshot_rows?: number;
        mappings_saved?: number;
      };
      if (snapshotResult.ok !== true || !snapshotResult.snapshot_rows
        || snapshotResult.mappings_saved !== snapshotResult.snapshot_rows) {
        throw new Error('Auraluxe full catalogue snapshot did not confirm complete SKU mapping persistence');
      }
      console.info('[shared-catalogue] one-shot full Auraluxe snapshot completed', {
        snapshotRows: snapshotResult.snapshot_rows,
        mappingsSaved: snapshotResult.mappings_saved,
      });
      return;
    }

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

    // Publish both SKU-keyed catalogue queues from the existing five-minute
    // scheduler. Each receiver is idempotent and each sender acknowledges only
    // after the remote upsert returns HTTP success.
    const localCatalogueRequest = new Request('https://bizsathi.internal/api/public/auraluxe-catalogue-publish', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ action: 'publish_outbox' }),
    });
    const localCatalogueResponse = await handler.fetch(localCatalogueRequest, env, ctx);
    if (!localCatalogueResponse.ok) {
      throw new Error(`BizSathi catalogue outbox publisher returned HTTP ${localCatalogueResponse.status}`);
    }
    const localCatalogueResult = await localCatalogueResponse.json() as { ok?: boolean; delivered?: number; blocked?: boolean };
    if (localCatalogueResult.ok !== true || localCatalogueResult.blocked === true) {
      throw new Error('BizSathi catalogue publisher did not confirm delivery');
    }

    console.info('[shared-catalogue] BizSathi-to-Auraluxe catalogue publisher run', {
      delivered: localCatalogueResult.delivered ?? 0,
    });

    const stockRequest = new Request('https://bizsathi.internal/api/public/auraluxe-stock-publish', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ action: 'publish_outbox' }),
    });
    const stockResponse = await handler.fetch(stockRequest, env, ctx);
    if (!stockResponse.ok) {
      throw new Error(`Auraluxe stock event publisher returned HTTP ${stockResponse.status}`);
    }
    const stockResult = await stockResponse.json() as { ok?: boolean; delivered?: number; blocked?: boolean };
    if (stockResult.ok !== true || stockResult.blocked === true) {
      throw new Error('Auraluxe stock event publisher did not confirm delivery');
    }
    console.info('[shared-stock] scheduled event run', {
      delivered: stockResult.delivered ?? 0,
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
