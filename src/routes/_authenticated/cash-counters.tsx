import {createFileRoute} from '@tanstack/react-router';
import {CashCounters} from '@/components/cash-counters';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/cash-counters')({head:()=>pageHead('Cash counters','BizSathi Nepal cashier opening cash, confirmed cash activity and closing reconciliation.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:CashCounters});