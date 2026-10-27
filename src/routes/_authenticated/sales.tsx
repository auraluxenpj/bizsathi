import {createFileRoute} from '@tanstack/react-router';
import {TradingDocuments} from '@/components/trading-documents';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/sales')({head:()=>pageHead('Sales and receipts','BizSathi Nepal mobile memberships, purchase loyalty points, sales invoices, payments and printable receipts.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:()=> <TradingDocuments mode="sale"/>});