import {createFileRoute} from '@tanstack/react-router';
import {Notebook} from '@/components/notebook';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/notebook')({head:()=>pageHead('Notebook','Shared business notes for staff and owners.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:Notebook});
