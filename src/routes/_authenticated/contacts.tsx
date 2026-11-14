import {validateWorkspaceView} from '@/lib/workspace-views';
import { createFileRoute } from '@tanstack/react-router';
import { Contacts } from '@/components/contacts';
import { businessQuery } from '@/lib/inventory-queries';
import { pageHead } from '@/lib/head';
export const Route=createFileRoute('/_authenticated/contacts')({validateSearch:validateWorkspaceView,head:()=>pageHead('Customers and suppliers','Manage your BizSathi Nepal customer and supplier contact records.'),loader:({context})=>context.queryClient.ensureQueryData(businessQuery),component:Contacts});