import {createFileRoute} from '@tanstack/react-router';
import {ItemCategories} from '@/components/item-categories';
import {businessQuery} from '@/lib/inventory-queries';
import {pageHead} from '@/lib/head';
export const Route=createFileRoute('/_authenticated/categories')({head:()=>pageHead('Item Categories','Rename or merge the categories used by your items.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:ItemCategories});
