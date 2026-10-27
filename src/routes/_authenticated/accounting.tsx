import {createFileRoute} from '@tanstack/react-router';
import {AccountingReports} from '@/components/accounting-reports';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/accounting')({head:()=>pageHead('Accounting & reports','BizSathi Nepal authorized date, branch and posting-user reports for sales, purchases, stock, party ledgers, expenses, cash, trial balance and tax, with full CSV and print exports.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:AccountingReports});