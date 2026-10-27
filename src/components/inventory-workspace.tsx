import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Building2, Package, UsersRound, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { businessQuery } from '@/lib/inventory-queries';
import { getBusinessAccess } from '@/lib/business.functions';
import { getInventory } from '@/lib/inventory.functions';
import { authorizedSelection } from '@/lib/dashboard-data';
export function useInventoryWorkspace() {
 const businesses=useSuspenseQuery(businessQuery); const [selected,setSelected]=useState(''); const businessId=authorizedSelection(businesses.data,selected); const getAccess=useServerFn(getBusinessAccess); const load=useServerFn(getInventory);
 const access=useQuery({queryKey:['business-access',businessId],queryFn:()=>getAccess({data:{businessId}}),enabled:!!businessId});
 const inventory=useQuery({queryKey:['inventory',businessId],queryFn:()=>load({data:{businessId}}),enabled:!!businessId});
 const business=businesses.data.find(b=>b.id===businessId);
 return {businesses:businesses.data,businessId,setSelected,access,inventory,manager:business?.role==='owner'||business?.role==='admin',canPost:['owner','admin','accountant','staff'].includes(business?.role ?? '')};
}
export type Workspace = ReturnType<typeof useInventoryWorkspace>;
export function InventoryWorkspace({workspace:w,title,active,children}:{workspace:Workspace;title:string;active:string;children:ReactNode}) {
 return <main className="mx-auto max-w-7xl px-5 py-8 md:px-9"><header className="flex flex-wrap items-end justify-between gap-5 border-b pb-6"><div><p className="text-xs font-semibold text-primary">BIZSATHI NEPAL</p><h1 className="brand mt-3 text-3xl font-semibold">{title}</h1></div><label className="w-full text-sm sm:w-64">Business<select aria-label="Inventory business" className="mt-2 h-10 w-full rounded-md border bg-card px-3" value={w.businessId} disabled={!w.businesses.length} onChange={e=>w.setSelected(e.target.value)}><option value="">No business selected</option>{w.businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></header><nav aria-label="Inventory sections" className="flex flex-wrap gap-2 border-b py-4">{[{to:'/products',label:'Products',icon:Package},{to:'/contacts',label:'Customers & suppliers',icon:UsersRound},{to:'/inventory',label:'Stock ledger',icon:ArrowLeftRight}].map(item=><Button key={item.to} asChild variant={active===item.to?'secondary':'ghost'}><Link to={item.to}><item.icon className="size-4"/>{item.label}</Link></Button>)}</nav>{!w.businessId ? <section className="py-16 text-center"><Building2 className="mx-auto mb-4 size-9 text-primary"/><h2 className="brand text-xl">No business linked yet</h2><Button asChild className="mt-5"><Link to="/businesses">Business setup</Link></Button></section> : <>{(w.access.isPending||w.inventory.isPending)&&<p role="status" className="py-6">Loading records…</p>}{(w.access.error||w.inventory.error)&&<div className="flex flex-wrap items-center gap-3 py-6"><p role="alert" className="text-sm text-destructive">{w.access.error?.message||w.inventory.error?.message}</p><Button variant="outline" onClick={()=>{w.access.refetch();w.inventory.refetch();}}>Try again</Button></div>}{w.inventory.data && children}</>}</main>;
}