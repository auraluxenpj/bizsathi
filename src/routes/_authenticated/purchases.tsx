import {createFileRoute} from '@tanstack/react-router';
import {TradingDocuments} from '@/components/trading-documents';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/purchases')({validateSearch:(s:Record<string,unknown>):{new?:'1'}=>s['new']==='1'?{new:'1'}:{},head:()=>pageHead('Purchases and receiving','BizSathi Nepal purchase orders, supplier invoices, goods receiving, returns and payments.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:()=> <TradingDocuments mode="purchase"/>});