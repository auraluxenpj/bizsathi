import { createFileRoute } from '@tanstack/react-router';
import { SecurityWorkspace } from '@/components/security-workspace';
import { pageHead } from '@/lib/head';
export const Route = createFileRoute('/_authenticated/security-history')({ head: () => pageHead('Security review history', 'Administrator history of security report updates, warning dispositions, and approval decisions.'), component: HistoryPage });
function HistoryPage() { return <SecurityWorkspace history />; }