import {validateWorkspaceView} from '@/lib/workspace-views';
import { createFileRoute } from '@tanstack/react-router';
import { Products } from '@/components/products';
import { businessQuery } from '@/lib/inventory-queries';
import { pageHead } from '@/lib/head';
export const Route=createFileRoute('/_authenticated/products')({validateSearch:validateWorkspaceView,head:()=>pageHead('Product catalogue','Manage BizSathi Nepal products, variants, SKUs, barcodes, pricing, CSV and Google Sheets imports.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:Products});