import { createFileRoute } from '@tanstack/react-router';

function equalSecret(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
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

/**
 * Read-only connectivity probe. Deliberately does not parse a body, access Supabase,
 * call an RPC, claim an outbox event, or invoke any inventory operation.
 */
export const Route = createFileRoute('/api/public/website-inventory-auth')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const expected = process.env['WEBSITE_INVENTORY_SYNC_SECRET'];
        if (!expected || expected.length < 24) return json({ error: 'Authentication probe is not configured' }, 503);

        const authorization = request.headers.get('authorization') ?? '';
        const supplied = /^Bearer ([^\\s,]+)$/.exec(authorization)?.[1] ?? '';
        if (!supplied || /[\\s,]/.test(supplied) || !equalSecret(expected, supplied)) return json({ error: 'Unauthorized' }, 401);

        return json({ ok: true, authenticated: true });
      },
    },
  },
});
