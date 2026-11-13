import {createFileRoute} from '@tanstack/react-router';
import {ReportsHub} from '@/components/reports-hub';
import {pageHead} from '@/lib/head';
import {validateReportSearch} from '@/lib/report-filters';
export const Route=createFileRoute('/_authenticated/reports')({validateSearch:validateReportSearch,head:()=>pageHead('View Reports','Sales, day book, profit and loss, party statement, cash and inventory reports.'),component:ReportsHub});
