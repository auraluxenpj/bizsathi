import { createFileRoute } from '@tanstack/react-router';

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** Temporary GET-only diagnostic. It sends one authenticated GET to the peer auth probe. */
export const Route = createFileRoute('/api/public/inventory-peer-auth-check')({
  server: {
    handlers: {
      GET: async () => {
        const secret = process.env['WEBSITE_INVENTORY_SYNC_SECRET'];
        if (!secret || secret.length < 24) {
          return json({ ok: false, localSecretConfigured: false, peerHttpStatus: null, peerAuthenticated: false, failure: 'local_secret_unavailable' }, 503);
        }
        try {
          const response = await fetch(
            'https://www.auraluxe.com.np/api/public/bizsathi-inventory-auth',
            {
              method: 'GET',
              headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
              redirect: 'manual',
              signal: AbortSignal.timeout(12000),
            },
          );
          const result: unknown = await response.json().catch(() => null);
          const authenticated = response.ok && !!result && typeof result === 'object'
            && 'ok' in result && result.ok === true
            && 'authenticated' in result && result.authenticated === true;
          return json({
            ok: authenticated,
            localSecretConfigured: true,
            peerHttpStatus: response.status,
            peerAuthenticated: authenticated,
            failure: authenticated ? null : response.status === 401 ? 'peer_rejected_secret' : response.status === 503 ? 'peer_secret_unavailable' : 'peer_probe_failed',
          }, authenticated ? 200 : 503);
        } catch (error) {
          const detail = error && typeof error === 'object' ? error as { name?: unknown; cause?: { code?: unknown; name?: unknown } } : {};
          const errorName = typeof detail.name === 'string' ? detail.name.slice(0, 40) : 'UnknownError';
          const causeCode = typeof detail.cause?.code === 'string' ? detail.cause.code.slice(0, 40) : null;
          const causeName = typeof detail.cause?.name === 'string' ? detail.cause.name.slice(0, 40) : null;
          const errorMessage = error instanceof Error ? error.message.replaceAll(secret, '[redacted]').slice(0, 160) : 'Unknown fetch error';
          return json({ ok: false, localSecretConfigured: true, peerHttpStatus: null, peerAuthenticated: false, failure: 'peer_network_or_timeout', errorName, causeCode, causeName, errorMessage }, 503);
        }
      },
    },
  },
});
