import { createFileRoute } from '@tanstack/react-router';
import { HrmWorkspace } from '@/components/hrm-workspace';
import { businessQuery } from '@/lib/inventory-queries';
import { pageHead } from '@/lib/head';

export const Route = createFileRoute('/_authenticated/hrm')({
  head: () => pageHead('HR & People Management', 'Manage employees, attendance, leave, shifts and payroll in BizSathi Nepal.'),
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  component: HrmWorkspace,
});
