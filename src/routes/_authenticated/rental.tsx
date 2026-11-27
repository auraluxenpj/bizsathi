import { createFileRoute } from '@tanstack/react-router';
import { RentalWorkspace } from '@/components/rental-workspace';
import { pageHead } from '@/lib/head';

export const Route = createFileRoute('/_authenticated/rental')({
  head: () => pageHead('Rental Property Management', 'Manage rental properties, tenants, monthly rent, electricity, water charges, invoices and collections.'),
  component: RentalWorkspace,
});
