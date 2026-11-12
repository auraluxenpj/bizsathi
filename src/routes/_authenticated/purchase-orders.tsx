import {createFileRoute} from '@tanstack/react-router';
import {PurchaseOrders} from '@/components/purchase-orders';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/purchase-orders')({head:()=>pageHead('Auraluxe purchase orders','Draft and send supplier orders, track pending shipments and convert them to purchase bills.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:PurchaseOrders});
