import {z} from 'zod';
type Item={code:string;label:string};
const crud=(area:string,noun:string,actions:readonly ('create'|'edit'|'view')[]=['create','edit','view']):Item[]=>actions.map(a=>({code:`${area}.${a}`,label:`${a[0]!.toUpperCase()+a.slice(1)} ${noun}`}));
export const permissionGroups:{title:string;items:Item[]}[]=[
 {title:'Sales Vouchers (Sales, Quotation, Payment In, Sales Return)',items:crud('sales','Sale')},
 {title:'Purchase Vouchers (Purchase, Purchase Order, Payment Out, Purchase Return)',items:crud('purchases','Purchase')},
 {title:'Income & Expenses',items:crud('expenses','Income Expense')},
 {title:'Inventory (Item, Category)',items:crud('inventory','Item')},
 {title:'Stock Adjustments',items:crud('stock','Stock Adjustment',['create','edit'])},
 {title:'Customers',items:crud('customers','Customer')},
 {title:'Suppliers',items:crud('suppliers','Supplier')},
 {title:'App Features',items:[{code:'features.import',label:'Import Bulk'}]},
 {title:'Manage Accounts (Bank, Wallet)',items:[{code:'accounts.create',label:'Add Account'},{code:'accounts.view',label:'View Account'}]},
 {title:'Reports',items:[{code:'reports.view',label:'View Reports'}]},
 {title:'Manage Staff',items:[{code:'staff.view',label:'View Staff'},{code:'staff.edit',label:'Edit Staff'}]},
 {title:'Business Settings',items:[{code:'settings.edit',label:'Edit Settings'}]},
 {title:'Other Permissions',items:[{code:'other.purchase_price',label:'See Purchase Price (untick to hide)'},{code:'other.change_date',label:'Change Transaction Date (untick to lock)'}]},
];
export const allPermissions=permissionGroups.flatMap(g=>g.items.map(i=>i.code));
export const permissionInput=z.object({businessId:z.string().uuid(),userId:z.string().uuid(),denied:z.array(z.string().refine(p=>allPermissions.includes(p),'Unknown permission')).max(allPermissions.length)});
/** The checklist only restricts: a permission is allowed when the role already allows it and it is not unticked. */
export function isAllowed(roleAllows:boolean,denied:readonly string[],permission:string){return roleAllows&&!denied.includes(permission);}
/** Route paths hidden when the matching view permission is unticked. */
export const routePermission:Record<string,string>={'/reports':'reports.view','/accounting':'reports.view','/businesses':'staff.view','/sales':'sales.view','/quotations':'sales.view','/purchases':'purchases.view','/purchase-orders':'purchases.view','/expenses':'expenses.view','/products':'inventory.view','/categories':'inventory.view','/cash-bank':'accounts.view','/parties':'customers.view'};
