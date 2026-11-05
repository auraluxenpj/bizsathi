import {createFileRoute} from '@tanstack/react-router';
import {CashBank} from '@/components/cash-bank';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/cash-bank')({head:()=>pageHead('Cash & Bank Accounts','Overall cash, bank and wallet balances for BizSathi Nepal.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:CashBank});
