import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
const MAX_BODY_BYTES = 64 * 1024;

type InventoryRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

const operationId = z.string().uuid();
const reference = z.string().trim().min(1).max(160);
const item = z.object({
  sku: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(1_000_000),
}).strict();
const returnItem = item.extend({
  restockQuantity: z.number().int().min(0).max(1_000_000),
}).strict();

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reserve'), operationId, reference, items: z.array(item).min(1).max(50) }).strict(),
  z.object({ action: z.literal('commit'), operationId, reference }).strict(),
  z.object({ action: z.literal('cancel'), operationId, reference }).strict(),
  z.object({ action: z.literal('accept_return'), operationId, reservationId: operationId, reference, items: z.array(returnItem).min(1).max(50) }).strict(),
  z.object({ action: z.literal('status'), operationId }).strict(),
  z.object({ action: z.literal('outbox'), afterId: z.string().regex(/^(0|[1-9]\d{0,18})$/), limit: z.number().int().min(1).max(500) }).strict(),
  z.object({ action: z.literal('ack'), throughId: z.string().regex(/^(0|[1-9]\d{0,18})$/) }).strict(),
  z.object({ action: z.literal('publish_outbox') }).strict(),
]);

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

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}


async function publishPendingOutbox(_db: InventoryRpcClient): Promise<{ published: number; blocked: boolean }> {
  // Retired: the legacy outbox publishes absolute available-stock snapshots.
  // The approved stock-event stream now projects immutable movement deltas.
  // Keep the old reservation outbox readable for audit, but never write stock from it.
  return { published: 0, blocked: false };
}

export const Route = createFileRoute('/api/public/website-inventory')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedSecret = process.env['WEBSITE_INVENTORY_SYNC_SECRET'];
        const authorization = request.headers.get('authorization') ?? '';
        const suppliedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
        if (!expectedSecret || expectedSecret.length < 24 || !suppliedSecret || !constantTimeEqual(suppliedSecret, expectedSecret)) {
          return json({ error: 'Unauthorized' }, 401);
        }
        const contentLength = Number(request.headers.get('content-length') ?? 0);
        if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
          return json({ error: 'Request too large' }, 413);
        }

        let raw: string;
        try {
          raw = await request.text();
        } catch {
          return json({ error: 'Invalid request body' }, 400);
        }
        if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
          return json({ error: 'Request too large' }, 413);
        }

        let parsed: z.infer<typeof requestSchema>;
        try {
          parsed = requestSchema.parse(JSON.parse(raw));
        } catch {
          return json({ error: 'Invalid inventory request' }, 400);
        }

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
          const db = supabaseAdmin as unknown as InventoryRpcClient;

          // The scheduled legacy outbox publisher is retired. Check its disabled
          // state before requiring a branch binding, so this no-op cannot block
          // the independent catalogue and stock-event publishers in the same cron.
          if (parsed.action === 'publish_outbox') {
            const enabled = await db.rpc('website_inventory_integration_enabled', { _business_id: BUSINESS_ID });
            if (enabled.error) return json({ error: 'Inventory integration status unavailable' }, 503);
            if (enabled.data !== true) return json({ ok: true, skipped: true, published: 0 });
            const result = await publishPendingOutbox(db);
            return json({ ok: true, ...result });
          }

          const binding = await db.rpc('website_inventory_branch', { _business_id: BUSINESS_ID });
          if (binding.error || typeof binding.data !== 'string') {
            return json({ error: 'Website inventory integration is not enabled' }, 503);
          }
          const branchId = binding.data;

          if (parsed.action === 'reserve') {
            const result = await db.rpc('reserve_website_inventory', {
              _business_id: BUSINESS_ID,
              _operation_id: parsed.operationId,
              _branch_id: branchId,
              _reference: parsed.reference,
              _items: parsed.items,
            });
            if (result.error) {
              const message = String(result.error.message ?? '');
              const status = /integration is not enabled/i.test(message) ? 503 : /insufficient|reserved|ambiguous|duplicate sku|identifier already used/i.test(message) ? 409 : 400;
              return json({ error: status === 409 ? 'Inventory reservation conflict' : status === 503 ? 'Inventory service is not enabled' : 'Inventory reservation rejected' }, status);
            }
            await publishPendingOutbox(db);
            return json(result.data);
          }

          if (parsed.action === 'commit' || parsed.action === 'cancel') {
            const result = await db.rpc('finalize_website_inventory', {
              _business_id: BUSINESS_ID,
              _operation_id: parsed.operationId,
              _action: parsed.action,
              _reference: parsed.reference,
            });
            if (result.error) return json({ error: 'Reservation could not be finalized' }, 409);
            await publishPendingOutbox(db);
            return json(result.data);
          }

          if (parsed.action === 'accept_return') {
            const result = await db.rpc('accept_website_inventory_return', {
              _business_id: BUSINESS_ID,
              _return_id: parsed.operationId,
              _reservation_id: parsed.reservationId,
              _reference: parsed.reference,
              _items: parsed.items,
            });
            if (result.error) return json({ error: 'Accepted return was rejected' }, 409);
            await publishPendingOutbox(db);
            return json(result.data);
          }

          if (parsed.action === 'status') {
            const result = await db.rpc('website_inventory_status', {
              _business_id: BUSINESS_ID,
              _operation_id: parsed.operationId,
            });
            if (result.error) return json({ error: 'Reservation status unavailable' }, 503);
            return json(result.data);
          }

          if (parsed.action === 'outbox') {
            const result = await db.rpc('read_website_inventory_outbox', {
              _business_id: BUSINESS_ID,
              _after_id: parsed.afterId,
              _limit: parsed.limit,
            });
            if (result.error) return json({ error: 'Inventory updates unavailable' }, 503);
            return json(result.data);
          }

          const result = await db.rpc('ack_website_inventory_outbox', {
            _business_id: BUSINESS_ID,
            _through_id: parsed.throughId,
          });
          if (result.error) return json({ error: 'Inventory update acknowledgement failed' }, 503);
          return json({ acknowledged: result.data });
        } catch (error) {
          console.error('[website-inventory] request failed', error);
          return json({ error: 'Inventory service unavailable' }, 503);
        }
      },
    },
  },
});
