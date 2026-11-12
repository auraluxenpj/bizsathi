import {describe,it,expect} from 'vitest';
import {isAllowed,permissionInput,allPermissions} from './permissions';
const id='00000000-0000-4000-8000-000000000000';
describe('custom permissions',()=>{
 it('never grants beyond the role',()=>expect(isAllowed(false,[],'sales.create')).toBe(false));
 it('keeps role permissions when nothing is unticked',()=>expect(isAllowed(true,[],'sales.create')).toBe(true));
 it('removes unticked permissions',()=>expect(isAllowed(true,['sales.create'],'sales.create')).toBe(false));
 it('rejects unknown permissions',()=>expect(permissionInput.safeParse({businessId:id,userId:id,denied:['sales.delete']}).success).toBe(false));
 it('has no delete permissions',()=>expect(allPermissions.some(p=>p.endsWith('.delete'))).toBe(false));
});
