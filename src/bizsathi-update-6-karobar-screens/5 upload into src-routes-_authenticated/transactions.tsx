import {createFileRoute} from '@tanstack/react-router';
import {Transactions} from '@/components/transactions';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/transactions')({head:()=>pageHead('Transactions','All sales, purchases, returns and payments in one searchable list for BizSathi Nepal.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:Transactions});
