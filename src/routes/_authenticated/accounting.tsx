import {createFileRoute} from '@tanstack/react-router';
import {AccountingReports} from '@/components/accounting-reports';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
import {reportViews} from '@/lib/business-reports';
import type {ReportInput} from '@/lib/accounting';
export const Route=createFileRoute('/_authenticated/accounting')({validateSearch:(s:Record<string,unknown>):{view?:ReportInput['view']}=>reportViews.some(([id])=>id===s['view'])?{view:s['view'] as ReportInput['view']}:{},head:()=>pageHead('Accounting & reports','BizSathi Nepal authorized date, branch and posting-user reports for sales, purchases, stock, party ledgers, expenses, cash, trial balance and tax, with full CSV and print exports.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:()=><AccountingReports initialView={Route.useSearch().view}/>});