import { createFileRoute } from '@tanstack/react-router';
import { SecurityWorkspace } from '@/components/security-workspace';
import { pageHead } from '@/lib/head';
export const Route = createFileRoute('/_authenticated/security')({ head: () => pageHead('Security findings', 'Administrator security findings, impact summaries, and prioritized remediation.'), component: SecurityWorkspace });