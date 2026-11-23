import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/auraluxe-catalogue')({
  server: { handlers: { POST: async () => Response.json(
    { error: 'BizSathi is the sole catalogue authority. Auraluxe-origin catalogue writes are rejected.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  ) } },
});
