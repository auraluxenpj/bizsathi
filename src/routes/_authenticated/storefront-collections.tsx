import { createFileRoute } from '@tanstack/react-router';
import { StorefrontCollectionsWorkspace } from '@/components/storefront-collections-workspace';
import { pageHead } from '@/lib/head';
export const Route = createFileRoute('/_authenticated/storefront-collections')({
  head: () => pageHead('Storefront Collections', 'Manage AURALUXE seasonal and occasion collections.'),
  component: StorefrontCollectionsWorkspace,
});
