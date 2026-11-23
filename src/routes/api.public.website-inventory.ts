import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
const MAX_BODY_BYTES = 64 * 1024;
const SELF_TEST_SKU = 'AL-KURTI-121';

type InventoryQuery = {
  select: (columns: string) => InventoryQuery;
  update: (values: Record<string, unknown>) => InventoryQuery;
  eq: (column: string, value: unknown) => InventoryQuery;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
};

type InventoryRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
  from: (table: string) => InventoryQuery;
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
  z.object({ action: z.literal('self_test') }).strict(),
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

async function runControlledSelfTest(db: InventoryRpcClient): Promise<Response> {
  if (process.env['WEBSITE_INVENTORY_SELF_TEST_ENABLED'] !== 'true') {
    return json({ error: 'Not found' }, 404);
  }

  const auraluxeSupabaseUrl = process.env['AURALUXE_SUPABASE_URL'];
  const auraluxePublishableKey = process.env['AURALUXE_SUPABASE_PUBLISHABLE_KEY'];
  if (!auraluxeSupabaseUrl?.startsWith('https://') || !auraluxePublishableKey) {
    return json({ error: 'Auraluxe authority preflight is not configured' }, 503);
  }
  try {
    const authorityResponse = await fetch(new URL('/rest/v1/rpc/website_inventory_authority_enabled', auraluxeSupabaseUrl), {
      method: 'POST',
      headers: {
        apikey: auraluxePublishableKey,
        Authorization: `Bearer ${auraluxePublishableKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{}',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    const authorityEnabled: unknown = await authorityResponse.json();
    if (!authorityResponse.ok || authorityEnabled !== true) {
      return json({ error: 'Auraluxe inventory authority must be enabled before the self-test' }, 409);
    }
  } catch {
    return json({ error: 'Auraluxe authority preflight is unavailable' }, 503);
  }

  const integration = await db.from('website_inventory_integrations')
    .select('business_id,branch_id,enabled')
    .eq('business_id', BUSINESS_ID)
    .eq('branch_id', '4c534ce0-3ab5-46e4-8804-37cf0d72f8db')
    .maybeSingle();
  if (integration.error || !integration.data || typeof integration.data['branch_id'] !== 'string') {
    return json({ error: 'Inventory integration configuration unavailable' }, 503);
  }
  const branchId = String(integration.data['branch_id']);
  if (integration.data['enabled'] === true) {
    return json({ error: 'Self-test requires the integration to be disabled initially' }, 409);
  }

  const pendingBefore = await db.rpc('read_website_inventory_outbox', {
    _business_id: BUSINESS_ID,
    _after_id: '0',
    _limit: 1,
  });
  if (pendingBefore.error || !Array.isArray(pendingBefore.data)) {
    return json({ error: 'Could not verify the outbox is clear' }, 503);
  }
  if (pendingBefore.data.length > 0) {
    return json({ error: 'Pending inventory events must be cleared before the self-test' }, 409);
  }

  const variant = await db.from('product_variants')
    .select('id')
    .eq('business_id', BUSINESS_ID)
    .eq('sku', SELF_TEST_SKU)
    .eq('is_active', true)
    .maybeSingle();
  if (variant.error || !variant.data || typeof variant.data['id'] !== 'string') {
    return json({ error: 'Self-test SKU is unavailable or ambiguous' }, 409);
  }

  const stockBeforeResult = await db.rpc('commerce_stock_balance', {
    _business: BUSINESS_ID,
    _branch: branchId,
    _variant: String(variant.data['id']),
  });
  const stockBefore = Number(stockBeforeResult.data);
  if (stockBeforeResult.error || !Number.isFinite(stockBefore) || stockBefore < 1) {
    return json({ error: 'Self-test requires at least one unit of on-hand stock' }, 409);
  }

  const enabled = await db.from('website_inventory_integrations')
    .update({ enabled: true })
    .eq('business_id', BUSINESS_ID)
    .eq('branch_id', branchId)
    .eq('enabled', false)
    .select('enabled')
    .maybeSingle();
  if (enabled.error || enabled.data?.['enabled'] !== true) {
    return json({ error: 'Could not temporarily enable the inventory integration' }, 503);
  }

  const operationId = crypto.randomUUID();
  const reference = `BIZSATHI-SELFTEST-${operationId.slice(0, 8)}`;
  let reserved = false;
  let cancelResult: { data: unknown; error: { message: string } | null } | null = null;
  let publishBlocked = false;
  let published = 0;
  let disableError = false;

  const publishSafely = async () => {
    try {
      return await publishPendingOutbox(db);
    } catch {
      return { published: 0, blocked: true };
    }
  };

  try {
    const binding = await db.rpc('website_inventory_branch', { _business_id: BUSINESS_ID });
    if (binding.error || binding.data !== branchId) {
      return json({ error: 'Enabled integration branch does not match the configured branch' }, 503);
    }

    try {
      const reserveResult = await db.rpc('reserve_website_inventory', {
        _business_id: BUSINESS_ID,
        _operation_id: operationId,
        _branch_id: branchId,
        _reference: reference,
        _items: [{ sku: SELF_TEST_SKU, quantity: 1 }],
      });
      if (reserveResult.error) {
        return json({ error: 'Self-test reservation was rejected' }, 409);
      }
      reserved = true;
    } catch {
      // A transport failure can leave the reservation outcome unknown. Attempt
      // an idempotent cancel using the same operation ID before cleanup.
      reserved = true;
      publishBlocked = true;
    }

    if (reserved) {
      const reservePublish = await publishSafely();
      published += reservePublish.published;
      publishBlocked ||= reservePublish.blocked;

      try {
        cancelResult = await db.rpc('finalize_website_inventory', {
          _business_id: BUSINESS_ID,
          _operation_id: operationId,
          _action: 'cancel',
          _reference: reference,
        });
      } catch {
        cancelResult = { data: null, error: { message: 'Cancellation outcome unknown' } };
      }
      if (cancelResult.error) {
        try {
          cancelResult = await db.rpc('finalize_website_inventory', {
            _business_id: BUSINESS_ID,
            _operation_id: operationId,
            _action: 'cancel',
            _reference: reference,
          });
        } catch {
          cancelResult = { data: null, error: { message: 'Cancellation retry failed' } };
        }
      }

      if (!cancelResult.error) {
        const cancelPublish = await publishSafely();
        published += cancelPublish.published;
        publishBlocked ||= cancelPublish.blocked;
      }
    }
  } finally {
    const disabled = await db.from('website_inventory_integrations')
      .update({ enabled: false })
      .eq('business_id', BUSINESS_ID)
      .eq('branch_id', branchId)
      .eq('enabled', true)
      .select('enabled')
      .maybeSingle();
    disableError = Boolean(disabled.error || disabled.data?.['enabled'] !== false);
  }

  if (!reserved) {
    return json({ error: 'Self-test did not create a reservation', integrationDisabled: !disableError }, 409);
  }
  if (!cancelResult || cancelResult.error) {
    return json({
      error: 'Self-test reservation could not be cancelled; manual recovery is required',
      operationId,
      integrationDisabled: !disableError,
    }, 503);
  }
  if (disableError) {
    return json({ error: 'Self-test completed but integration could not be disabled', operationId }, 503);
  }

  const stockAfterResult = await db.rpc('commerce_stock_balance', {
    _business: BUSINESS_ID,
    _branch: branchId,
    _variant: String(variant.data['id']),
  });
  const stockAfter = Number(stockAfterResult.data);
  const status = await db.rpc('website_inventory_status', {
    _business_id: BUSINESS_ID,
    _operation_id: operationId,
  });
  const pendingAfter = await db.rpc('read_website_inventory_outbox', {
    _business_id: BUSINESS_ID,
    _after_id: '0',
    _limit: 1,
  });

  const verified = !stockAfterResult.error
    && Number.isFinite(stockAfter)
    && stockAfter === stockBefore
    && !status.error
    && Boolean(status.data && typeof status.data === 'object' && 'status' in status.data && status.data.status === 'cancelled')
    && !pendingAfter.error
    && Array.isArray(pendingAfter.data)
    && pendingAfter.data.length === 0
    && !publishBlocked;

  if (!verified) {
    return json({
      error: 'Self-test lifecycle ran, but stock, status, or outbox verification failed',
      sku: SELF_TEST_SKU,
      stockBefore,
      stockAfter: Number.isFinite(stockAfter) ? stockAfter : null,
      reservationStatus: status.data,
      published,
      integrationDisabled: true,
    }, 503);
  }

  return json({
    ok: true,
    test: 'reserve_then_cancel',
    sku: SELF_TEST_SKU,
    quantity: 1,
    stockBefore,
    stockAfter,
    reservationStatus: 'cancelled',
    published,
    integrationDisabled: true,
  });
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
          if (parsed.action === 'self_test') {
            return await runControlledSelfTest(db);
          }
          const binding = await db.rpc('website_inventory_branch', { _business_id: BUSINESS_ID });
          if (binding.error || typeof binding.data !== 'string') {
            return json({ error: 'Website inventory integration is not enabled' }, 503);
          }
          const branchId = binding.data;

          if (parsed.action === 'publish_outbox') {
            const enabled = await db.rpc('website_inventory_integration_enabled', { _business_id: BUSINESS_ID });
            if (enabled.error) return json({ error: 'Inventory integration status unavailable' }, 503);
            if (enabled.data !== true) return json({ ok: true, skipped: true, published: 0 });
            const result = await publishPendingOutbox(db);
            return json({ ok: true, ...result });
          }

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
