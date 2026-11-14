import {allPermissions} from './permissions';
/** Karobar-style staff roles. Each sits on top of an existing security role, so all existing role checks keep working. */
const only=(...rx:RegExp[])=>allPermissions.filter(p=>rx.some(r=>r.test(p)));
export const jobTitles={
 partner:{label:'Partner',base:'admin',allowed:only(/^(?!settings\.delete_business$).*$/)},
 manager:{label:'Manager',base:'accountant',allowed:only(/^(sales|purchases|expenses|inventory|stock|customers|suppliers|notebook)\./,/^categories\./,/^reports\./,/^features\./,/^accounts\.(create|edit|view|adjust_create)$/,/^staff\.view$/,/^other\./)},
 accountant:{label:'Accountant',base:'accountant',allowed:only(/^(sales|purchases|expenses)\.(create|edit|view)$/,/^accounts\.(create|edit|view|adjust_create)$/,/^reports\./,/^(inventory|customers|suppliers|categories)\.view$/,/^stock\.(create|edit)$/,/^notebook\./,/^other\.(party_adjustments|purchase_price|change_date)$/,/^features\.import$/)},
 sales_person:{label:'Sales Person',base:'staff',allowed:only(/^sales\.(create|edit|view)$/,/^customers\.(create|edit|view)$/,/^inventory\.view$/,/^categories\.view$/,/^reports\.home_stats$/,/^notebook\./,/^features\.(business_cards|greeting_cards)$/)},
 stock_manager:{label:'Stock Manager',base:'staff',allowed:only(/^(inventory|stock)\./,/^categories\./,/^purchases\.(create|edit|view)$/,/^suppliers\.(create|edit|view)$/,/^reports\.(items|home_stats)$/,/^features\.import$/,/^notebook\./,/^other\.purchase_price$/)},
 entry_person:{label:'Entry Person',base:'staff',allowed:only(/^(sales|purchases|expenses)\.(create|view)$/,/^(customers|suppliers)\.(create|view)$/,/^(inventory|categories)\.view$/,/^reports\.home_stats$/,/^notebook\.(create|view)$/)}
} as const;
export type JobTitle=keyof typeof jobTitles;
export const jobTitleCodes=Object.keys(jobTitles) as JobTitle[];
/** The unticked permissions to store for a title's defaults. */
export const deniedForTitle=(t:JobTitle)=>allPermissions.filter(p=>!jobTitles[t].allowed.includes(p));
