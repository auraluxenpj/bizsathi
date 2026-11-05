import {createFileRoute} from '@tanstack/react-router';
import {ReportsHub} from '@/components/reports-hub';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/reports')({head:()=>pageHead('View Reports','Sales, day book, profit and loss, party statement, cash and inventory reports.'),component:ReportsHub});
