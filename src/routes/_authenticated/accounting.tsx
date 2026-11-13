import {createFileRoute} from '@tanstack/react-router';
import {AccountingReports} from '@/components/accounting-reports';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
import {reportViews} from '@/lib/business-reports';
import type {ReportInput} from '@/lib/accounting';
import {validateReportSearch} from '@/lib/report-filters';
function ReportsPage(){const search=Route.useSearch();const navigate=Route.useNavigate();return <AccountingReports search={search} onSearchChange={next=>{void navigate({search:prev=>({...prev,...next}),replace:true});}}/>;}
export const Route=createFileRoute('/_authenticated/accounting')({validateSearch:validateReportSearch,head:()=>pageHead('Accounting & reports','BizSathi Nepal authorized date, branch and posting-user reports for sales, purchases, stock, party ledgers, expenses, cash, trial balance and tax, with full CSV and print exports.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:ReportsPage});