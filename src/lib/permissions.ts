import {z} from 'zod';
export const permissionGroups=[
 {title:'Sales (Sales, Quotation, Payment in, Sales return)',area:'sales',actions:['create','edit','view']},
 {title:'Purchases (Purchase, Purchase order, Payment out, Purchase return)',area:'purchases',actions:['create','edit','view']},
 {title:'Income & Expenses',area:'expenses',actions:['create','view']},
 {title:'Customers & Suppliers',area:'parties',actions:['create','edit','view']},
 {title:'Products & Stock',area:'products',actions:['create','edit','view','import']},
 {title:'Reports',area:'reports',actions:['view']},
 {title:'Manage staff',area:'staff',actions:['view']},
] as const;
export const allPermissions=permissionGroups.flatMap(g=>g.actions.map(a=>`${g.area}.${a}`));
export const permissionInput=z.object({businessId:z.string().uuid(),userId:z.string().uuid(),denied:z.array(z.string().refine(p=>allPermissions.includes(p),'Unknown permission')).max(allPermissions.length)});
/** The checklist only restricts: a permission is allowed when the role already allows it and it is not unticked. */
export function isAllowed(roleAllows:boolean,denied:readonly string[],permission:string){return roleAllows&&!denied.includes(permission);}
export const actionLabel=(a:string)=>a==='import'?'Import bulk':a[0]!.toUpperCase()+a.slice(1);
