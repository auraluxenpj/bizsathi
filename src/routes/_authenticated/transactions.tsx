import {createFileRoute} from '@tanstack/react-router';
import {Transactions} from '@/components/transactions';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
import {validateReportSearch} from '@/lib/report-filters';
export const Route=createFileRoute('/_authenticated/transactions')({validateSearch:validateReportSearch,head:()=>pageHead('Transactions','All sales, purchases, returns and payments in one searchable list for BizSathi Nepal.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:Transactions});
