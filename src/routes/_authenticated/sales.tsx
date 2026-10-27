import {createFileRoute} from '@tanstack/react-router';
import {TradingDocuments} from '@/components/trading-documents';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/sales')({head:()=>pageHead('Sales and receipts','BizSathi Nepal sales invoices, payments, credit notes and printable receipts.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:()=> <TradingDocuments mode="sale"/>});