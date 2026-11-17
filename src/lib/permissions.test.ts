import {describe,it,expect} from 'vitest';
import {isAllowed,permissionInput,allPermissions,rolePresets,permissionForRoute,hasEffectivePermission} from './permissions';
const id='00000000-0000-4000-8000-000000000000';

describe('custom permissions',()=>{
 it('never grants beyond the role',()=>expect(isAllowed(false,[],'sales.create')).toBe(false));
 it('keeps role permissions when nothing is unticked',()=>expect(isAllowed(true,[],'sales.create')).toBe(true));
 it('removes unticked permissions',()=>expect(isAllowed(true,['sales.create'],'sales.create')).toBe(false));
 it('rejects unknown permissions',()=>expect(permissionInput.safeParse({businessId:id,userId:id,denied:['not.a.real.permission']}).success).toBe(false));
 it('includes explicitly configured delete permissions and excludes them from restricted roles',()=>{
  expect(allPermissions).toContain('sales.delete');
  const staff=rolePresets['staff'];
  expect(staff).toBeDefined();
  if(!staff)throw new Error('Staff preset is missing');
  expect(staff.allowed).toEqual(expect.arrayContaining(['sales.create','sales.view','inventory.view','categories.view','customers.view','customers.create']));
  expect(staff.allowed).not.toContain('sales.delete');
  expect(staff.allowed).not.toContain('purchases.view');
  expect(staff.allowed).not.toContain('hr.employees.view');
 });
 it('fails closed until the server returns effective permissions',()=>{
  expect(hasEffectivePermission(undefined,'sales.create')).toBe(false);
  expect(hasEffectivePermission(['sales.create'],'sales.create')).toBe(true);
  expect(hasEffectivePermission(['sales.create'],'inventory.view')).toBe(false);
 });
 it('maps every business module route to an effective permission',()=>{
  for(const path of ['/reports','/accounting','/businesses','/sales','/quotations','/purchases','/purchase-orders','/expenses','/expense-receipts','/products','/inventory','/categories','/cash-bank','/parties','/hrm','/pos','/cash-counters','/membership','/credit-reminder','/calculators','/notebook','/transactions','/bill-gallery']){
   expect(permissionForRoute(path)).toBeTruthy();
  }
  expect(permissionForRoute('/contacts',{kind:'supplier'})).toBe('suppliers.view');
  expect(permissionForRoute('/contacts',{kind:'customer'})).toBe('customers.view');
  expect(permissionForRoute('/accounting',{view:'sales'})).toBe('reports.view');
  expect(permissionForRoute('/products/variant/123')).toBe('inventory.view');
 });
});
