import {createFileRoute} from '@tanstack/react-router';
import {ExpenseReceipts} from '@/components/expense-receipts';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/expense-receipts')({head:()=>pageHead('Scan Receipts','Scan bills and receipts, review the details and post them as expenses.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:ExpenseReceipts});
