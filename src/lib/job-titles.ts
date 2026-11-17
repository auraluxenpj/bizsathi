import {allPermissions} from './permissions';
/** Karobar-style staff roles. Each sits on top of an existing security role, so all existing role checks keep working.
 *  The "allowed" lists are defaults. Owners may further restrict templates; Branch Manager also has a database-enforced branch-only ceiling. */
const only=(...rx:RegExp[])=>allPermissions.filter(p=>rx.some(r=>r.test(p)));
export const jobTitles={
 partner:{label:'Partner',base:'admin',allowed:only(/^(?!settings\.delete_business$).*$/)},
 manager:{label:'Manager (legacy)',base:'accountant',allowed:only(/^hr\\.(self\\.view|employees\\.view|attendance\\.view|leave\\.(view|create)|shifts\\.view|payroll\\.(view|manage|approve))$/,/^(sales|purchases|expenses|inventory|stock|customers|suppliers|notebook)\./,/^categories\./,/^reports\./,/^features\./,/^accounts\.(create|edit|view|adjust_create)$/,/^staff\.view$/,/^other\./)},
 branch_manager:{label:'Branch Manager',base:'branch_manager',allowed:only(/^hr\\.(self\\.view|attendance\\.view|leave\\.(view|create)|shifts\\.view)$/,/^sales\.view$/,/^expenses\.view$/,/^inventory\.view$/,/^categories\.view$/,/^stock\.(create|edit)$/,/^customers\.view$/,/^suppliers\.view$/,/^staff\.view$/,/^reports\.(view|home_stats|items|parties|transactions|expenses)$/)},
 accountant:{label:'Accountant',base:'accountant',allowed:only(/^hr\\.(self\\.view|employees\\.view|attendance\\.view|leave\\.(view|create)|shifts\\.view|payroll\\.(view|manage|approve))$/,/^(sales|purchases|expenses)\.(create|edit|view)$/,/^accounts\.(create|edit|view|adjust_create)$/,/^reports\./,/^(inventory|customers|suppliers|categories)\.view$/,/^stock\.(create|edit)$/,/^notebook\./,/^other\.(party_adjustments|purchase_price|change_date)$/,/^features\.import$/)},
 sales_person:{label:'Sales Person',base:'staff',allowed:only(/^hr\\.(self\\.view|attendance\\.view|leave\\.(view|create)|shifts\\.view)$/,/^sales\.(create|view)$/,/^expenses\.(create|view)$/,/^inventory\.(create|edit|view)$/,/^categories\.view$/,/^customers\.(create|edit|view)$/,/^reports\.home_stats$/,/^notebook\./,/^features\.(business_cards|greeting_cards)$/)},
 stock_manager:{label:'Stock Manager',base:'staff',allowed:only(/^hr\\.(self\\.view|attendance\\.view|leave\\.(view|create)|shifts\\.view)$/,/^(inventory|stock)\./,/^categories\./,/^purchases\.(create|edit|view)$/,/^suppliers\.(create|edit|view)$/,/^reports\.(items|home_stats)$/,/^features\.import$/,/^notebook\./,/^other\.purchase_price$/)},
 entry_person:{label:'Entry Person',base:'staff',allowed:only(/^hr\\.(self\\.view|attendance\\.view|leave\\.(view|create)|shifts\\.view)$/,/^(sales|purchases|expenses)\.(create|view)$/,/^(customers|suppliers)\.(create|view)$/,/^(inventory|categories)\.view$/,/^reports\.home_stats$/,/^notebook\.(create|view)$/)}
} as const;
export type JobTitle=keyof typeof jobTitles;
export const jobTitleCodes=Object.keys(jobTitles) as JobTitle[];
/** The unticked permissions to store for a title's defaults. */
export const deniedForTitle=(t:JobTitle)=>allPermissions.filter(p=>!jobTitles[t].allowed.includes(p));
