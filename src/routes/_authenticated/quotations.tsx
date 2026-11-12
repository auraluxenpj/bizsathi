import {createFileRoute} from '@tanstack/react-router';
import {Quotations} from '@/components/quotations';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/quotations')({head:()=>pageHead('Auraluxe quotations & estimates','Create, print and convert Auraluxe customer estimates into linked sale invoices.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:Quotations});