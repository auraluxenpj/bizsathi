import { createFileRoute } from '@tanstack/react-router';

/**
 * Temporary, read-only deployment diagnostic.
 * Calls only Auraluxe's bearer-protected auth probe; it cannot reserve,
 * commit, cancel, read stock, or publish an outbox event.
 * Remove after the one-time connectivity verification.
 */
export const Route = createFileRoute('/api/public/inventory-peer-auth-check')({
  server: {
    handlers: {
      GET: async () => {
        const secret = process.env['WEBSITE_INVENTORY_SYNC_SECRET'];
        if (!secret || secret.length < 24) {
          return Response.json({ ok: false, peerAuthenticated: false }, {
            status: 503,
            headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
          });
        }
        try {
          const response = await fetch(
            'https://www.auraluxe.com.np/api/public/bizsathi-inventory-auth',
            {
              method: 'GET',
              headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
              redirect: 'error',
              signal: AbortSignal.timeout(5000),
            },
          );
          const result: unknown = await response.json().catch(() => null);
          const authenticated =
            response.ok &&
            !!result &&
            typeof result === 'object' &&
            'ok' in result &&
            result.ok === true &&
            'authenticated' in result &&
            result.authenticated === true;
          return Response.json({ ok: authenticated, peerAuthenticated: authenticated }, {
            status: authenticated ? 200 : 503,
            headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
          });
        } catch {
          return Response.json({ ok: false, peerAuthenticated: false }, {
            status: 503,
            headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
          });
        }
      },
    },
  },
});
