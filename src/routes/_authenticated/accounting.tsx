import {createFileRoute} from '@tanstack/react-router';
import {AccountingReports} from '@/components/accounting-reports';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/accounting')({head:()=>pageHead('Accounting & reports','BizSathi Nepal authorized recorded-postings ledgers, trial balance, registers, party statements and VAT activity.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:AccountingReports});