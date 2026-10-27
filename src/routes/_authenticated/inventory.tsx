import { createFileRoute } from '@tanstack/react-router';
import { StockLedger } from '@/components/stock-ledger';
import { businessQuery } from '@/lib/inventory-queries';
import { pageHead } from '@/lib/head';
export const Route=createFileRoute('/_authenticated/inventory')({head:()=>pageHead('Stock ledger','Authorized branch stock balances, low-stock alerts and traceable inventory movements for BizSathi Nepal.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:StockLedger});