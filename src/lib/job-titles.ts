import {allPermissions} from './permissions';
/** Karobar-style staff roles. Each sits on top of an existing security role, so all existing role checks keep working.
 *  The "allowed" lists are defaults. Owners may further restrict templates; Branch Manager also has a database-enforced branch-only ceiling. */
const only=(...rx:RegExp[])=>allPermissions.filter(p=>rx.some(r=>r.test(p)));
export const jobTitles={
 partner:{label:'Partner / Administrator',base:'admin',allowed:only(/^(?!settings\.delete_business$).*$/)},
 manager:{label:'Manager',base:'accountant',allowed:only(/^hr\.(self\.view|employees\.view|attendance\.view|leave\.(view|create)|shifts\.view|payroll\.(view|manage|approve))$/,/^(sales|purchases|expenses|inventory|stock|customers|suppliers|notebook)\./,/^categories\./,/^reports\./,/^features\./,/^accounts\.(create|edit|view|adjust_create)$/,/^staff\.view$/,/^other\./)},
 branch_manager:{label:'Branch Manager',base:'branch_manager',allowed:only(/^hr\.(self\.view|attendance\.view|leave\.(view|create)|shifts\.view)$/,/^sales\.(create|view)$/,/^expenses\.view$/,/^inventory\.view$/,/^categories\.view$/,/^stock\.(create|edit)$/,/^customers\.(create|edit|view)$/,/^suppliers\.view$/,/^staff\.(view|edit)$/,/^reports\.(view|home_stats|items|parties|transactions|expenses)$/)},
 department_manager:{label:'Department Manager',base:'staff',allowed:only(/^hr\.(self\.view|attendance\.view|leave\.(view|create)|shifts\.view)$/,/^sales\.(create|view)$/,/^inventory\.view$/,/^categories\.view$/,/^stock\.(create|edit)$/,/^customers\.(create|edit|view)$/,/^suppliers\.view$/,/^reports\.(home_stats|items)$/,/^staff\.view$/)},
 accountant:{label:'Accountant',base:'accountant',allowed:only(/^hr\.(self\.view|employees\.view|attendance\.view|leave\.(view|create)|shifts\.view|payroll\.(view|manage|approve))$/,/^(sales|purchases|expenses)\.(create|edit|view)$/,/^accounts\.(create|edit|view|adjust_create)$/,/^reports\./,/^(inventory|customers|suppliers|categories)\.view$/,/^stock\.(create|edit)$/,/^notebook\./,/^other\.(party_adjustments|purchase_price|change_date)$/,/^features\.import$/)},
 sales_person:{label:'Cashier / POS',base:'staff',allowed:only(/^sales\.(create|view)$/,/^inventory\.view$/,/^categories\.view$/,/^customers\.(create|view)$/)},
 stock_manager:{label:'Inventory Manager',base:'staff',allowed:only(/^hr\.(self\.view|attendance\.view|leave\.(view|create)|shifts\.view)$/,/^(inventory|stock)\./,/^categories\./,/^purchases\.(create|edit|view)$/,/^suppliers\.(create|edit|view)$/,/^reports\.(items|home_stats)$/,/^features\.import$/,/^notebook\./,/^other\.purchase_price$/)},
 entry_person:{label:'Store Assistant',base:'staff',allowed:only(/^hr\.(self\.view|attendance\.view|leave\.(view|create)|shifts\.view)$/,/^(sales|purchases|expenses)\.(create|view)$/,/^(customers|suppliers)\.(create|view)$/,/^(inventory|categories)\.view$/,/^reports\.home_stats$/,/^notebook\.(create|view)$/)},
 viewer:{label:'Read-only Viewer',base:'viewer',allowed:only(/^categories\.view$/,/^customers\.view$/,/^expenses\.view$/,/^hr\.(attendance|employees|leave|payroll|self|shifts)\.view$/,/^inventory\.view$/,/^notebook\.view$/,/^purchases\.view$/,/^reports\.home_stats$/,/^sales\.view$/,/^suppliers\.view$/)}
} as const;
export type JobTitle=keyof typeof jobTitles;
export const jobTitleCodes=Object.keys(jobTitles) as JobTitle[];
/** The unticked permissions to store for a title's defaults. */
export const deniedForTitle=(t:JobTitle)=>allPermissions.filter(p=>!jobTitles[t].allowed.includes(p));
