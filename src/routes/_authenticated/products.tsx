import { createFileRoute } from '@tanstack/react-router';
import { Products } from '@/components/products';
import { businessQuery } from '@/lib/inventory-queries';
import { pageHead } from '@/lib/head';
export const Route=createFileRoute('/_authenticated/products')({head:()=>pageHead('Product catalogue','Manage BizSathi Nepal products, variants, SKUs, barcodes, pricing and CSV imports.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:Products});