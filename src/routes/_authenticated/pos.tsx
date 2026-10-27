import {createFileRoute} from '@tanstack/react-router';
import {Pos} from '@/components/pos';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/pos')({head:()=>pageHead('Point of sale','BizSathi Nepal POS with stock-checked invoices, split payments and protected transaction confirmation.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:Pos});