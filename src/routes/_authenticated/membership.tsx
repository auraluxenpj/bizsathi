import { createFileRoute } from '@tanstack/react-router';
import { MembershipLoyalty } from '@/components/membership-loyalty';
import { businessQuery } from '@/lib/inventory-queries';
import { pageHead } from '@/lib/head';

export const Route = createFileRoute('/_authenticated/membership')({
  head: () => pageHead('Membership & Loyalty', 'Customer memberships, rewards balances and loyalty point history for BizSathi Nepal.'),
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  component: MembershipLoyalty,
});
