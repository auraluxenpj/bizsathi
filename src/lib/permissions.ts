import {z} from 'zod';
type Item={code:string;label:string};
const I=(code:string,label:string):Item=>({code,label});
const crud=(area:string,noun:string,actions:readonly ('create'|'edit'|'delete'|'view')[]=['create','delete','edit','view']):Item[]=>actions.map(a=>I(`${area}.${a}`,`${a[0]!.toUpperCase()+a.slice(1)} ${noun}`));
export const permissionGroups:{title:string;items:Item[]}[]=[
 {title:'Sales Vouchers (Sales, Quotation, Payment In, Sales Return, Other Income)',items:crud('sales','Sale')},
 {title:'Purchase Vouchers (Purchase, Purchase Order, Payment Out, Purchase Return)',items:crud('purchases','Purchase')},
 {title:'Income & Expenses',items:crud('expenses','Income Expense')},
 {title:'Inventory (Item, Category)',items:[...crud('inventory','Item'),I('categories.edit_delete','Edit Delete Item Category'),I('categories.view','View Item Category')]},
 {title:'Stock Adjustments',items:crud('stock','Adjustments',['create','delete','edit'])},
 {title:'Customers',items:crud('customers','Customer')},
 {title:'Suppliers',items:crud('suppliers','Supplier')},
 {title:'App Features',items:[I('features.import','Import Bulk'),I('features.business_cards','Use Business Cards'),I('features.greeting_cards','Use Greeting Cards')]},
 {title:'Manage Staffs',items:crud('staff','Staff')},
 {title:'Business Settings',items:[I('settings.edit','Edit Business'),I('settings.invoice','Edit Invoice Settings'),I('settings.item','Edit Item Settings'),I('settings.party','Edit Party Settings'),I('settings.transaction','Edit Transaction Settings'),I('settings.delete_business','Delete Business')]},
 {title:'Manage Accounts (Bank, Wallet)',items:[I('accounts.create','Add Account'),I('accounts.adjust_create','Create Transaction Adjustment'),I('accounts.delete','Delete Account'),I('accounts.edit','Edit Account'),I('accounts.adjust_edit_delete','Edit Delete Transaction Adjustment'),I('accounts.view','View Account')]},
 {title:'Reports',items:[I('reports.business_status','View Business Status Reports'),I('reports.home_stats','View Homepage Stats'),I('reports.expenses','View Income Expense Reports'),I('reports.items','View Item Reports'),I('reports.parties','View Party Reports'),I('reports.transactions','View Transaction Reports'),I('reports.view','View Reports (all screens)')]},
 {title:'HR & People Management',items:[I('hr.self.view','View my HR workspace'),I('hr.employees.view','View employee directory'),I('hr.employees.create','Create employee records'),I('hr.employees.edit','Edit employee records'),I('hr.attendance.view','View attendance'),I('hr.attendance.create','Record attendance'),I('hr.attendance.edit','Correct attendance'),I('hr.leave.view','View leave requests'),I('hr.leave.create','Request leave'),I('hr.leave.approve','Approve leave'),I('hr.shifts.view','View shift roster'),I('hr.shifts.manage','Manage shifts'),I('hr.payroll.view','View payroll and payslips'),I('hr.payroll.manage','Manage salary and generate payroll'),I('hr.payroll.approve','Approve payroll')]},
 {title:'Notebook',items:crud('notebook','Notebook',['create','view','delete','edit'])},
 {title:'Other Permissions',items:[I('other.party_adjustments','Manage Party Adjustments'),I('other.purchase_price','See Purchase Price (untick to hide)'),I('other.change_date','Change Transaction Date (untick to lock)')]},
];
export const allPermissions=permissionGroups.flatMap(g=>g.items.map(i=>i.code));
export const permissionInput=z.object({businessId:z.string().uuid(),userId:z.string().uuid(),denied:z.array(z.string().refine(p=>allPermissions.includes(p),'Unknown permission')).max(allPermissions.length)});
/** The checklist only restricts: a permission is allowed when the role already allows it and it is not unticked. */
export function isAllowed(roleAllows:boolean,denied:readonly string[],permission:string){return roleAllows&&!denied.includes(permission);}
/** Route paths hidden when the matching view permission is unticked. */
export const routePermission:Record<string,string>={'/reports':'reports.view','/accounting':'accounts.view','/businesses':'staff.view','/sales':'sales.view','/quotations':'sales.view','/purchases':'purchases.view','/purchase-orders':'purchases.view','/expenses':'expenses.view','/products':'inventory.view','/categories':'categories.view','/cash-bank':'accounts.view','/parties':'customers.view','/hrm':'hr.self.view'};

/** Default permissions for each role. A preset lists what the role may do; everything else is stored as "denied". */
const not=(...rx:RegExp[])=>allPermissions.filter(p=>!rx.some(r=>r.test(p)));
const only=(...rx:RegExp[])=>allPermissions.filter(p=>rx.some(r=>r.test(p)));
export const rolePresets:Record<string,{label:string;allowed:string[]}>={
 owner:{label:'Owner',allowed:allPermissions},
 admin:{label:'Administrator',allowed:not(/^settings\.delete_business$/)},
 branch_manager:{label:'Branch Manager',allowed:only(/^hr\.(self\.view|attendance\.view|leave\.(view|create)|shifts\.view)$/,/^sales\.(create|view)$/,/^expenses\.view$/,/^inventory\.view$/,/^categories\.view$/,/^stock\.(create|edit)$/,/^customers\.view$/,/^suppliers\.view$/,/^staff\.view$/,/^reports\.(view|home_stats|items|parties|transactions|expenses)$/)},
 accountant:{label:'Accountant',allowed:only(/^hr\.(self\.view|employees\.view|attendance\.view|leave\.(view|create)|shifts\.view|payroll\.(view|manage|approve))$/,/^(sales|purchases|expenses)\.(create|edit|view)$/,/^accounts\.(create|edit|view|adjust_create)$/,/^reports\./,/^(inventory|customers|suppliers|categories|notebook)\.(view)$/,/^stock\.(create|edit)$/,/^notebook\./,/^other\.(party_adjustments|purchase_price|change_date)$/,/^features\.import$/)},
 staff:{label:'Staff (Sales Person)',allowed:only(/^hr\.(self\.view|attendance\.view|leave\.(view|create)|shifts\.view)$/,/^sales\.(create|view)$/,/^customers\.(create|edit|view)$/,/^inventory\.view$/,/^categories\.view$/)},
 viewer:{label:'Viewer',allowed:only(/\.view$/,/^reports\.home_stats$/).filter(p=>p!=='staff.view'&&p!=='accounts.view'&&p!=='reports.view')},
};
/** What to store (the unticked ones) for a role's defaults. */
export function deniedForRole(role:string):string[]{const preset=rolePresets[role];return preset?allPermissions.filter(p=>!preset.allowed.includes(p)):[];}
