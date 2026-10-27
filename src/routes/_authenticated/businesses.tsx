import { createFileRoute } from '@tanstack/react-router';
import { BusinessAccess } from '@/components/business-access';
import { pageHead } from '@/lib/head';
export const Route = createFileRoute('/_authenticated/businesses')({ head: () => pageHead('Businesses and staff', 'Register your business and manage authorized BizSathi Nepal staff and branch access.'), component: BusinessAccess });