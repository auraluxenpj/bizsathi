import {createFileRoute} from '@tanstack/react-router';
import {BillGallery} from '@/components/bill-gallery';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/bill-gallery')({head:()=>pageHead('Bill Gallery','Photos and PDFs of supplier and expense bills.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:BillGallery});
