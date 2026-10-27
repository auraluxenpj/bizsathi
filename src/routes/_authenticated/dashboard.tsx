import { createFileRoute } from '@tanstack/react-router';
import { Dashboard } from '@/components/dashboard';
import { pageHead } from '@/lib/head';
export const Route = createFileRoute('/_authenticated/dashboard')({ head: () => pageHead('Business overview', 'Your BizSathi Nepal business and authorized branch overview with real-record financial summaries.'), component: Dashboard });