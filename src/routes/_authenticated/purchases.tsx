import {validateWorkspaceView} from '@/lib/workspace-views';
import {createFileRoute} from '@tanstack/react-router';
import {TradingDocuments} from '@/components/trading-documents';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/purchases')({validateSearch:(s:Record<string,unknown>):{new?:'1';kind?:string;panel?:string}=>({...validateWorkspaceView(s),...(s['new']==='1'?{new:'1' as const}:{})}),head:()=>pageHead('Purchases and receiving','BizSathi Nepal purchase orders, supplier invoices, goods receiving, returns and payments.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:()=> <TradingDocuments mode="purchase"/>});