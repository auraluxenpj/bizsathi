import {describe,it,expect} from 'vitest';
import {normalizeMobile,membershipNumber,earnedPoints,remainingPoints} from './loyalty';
import {documentInput} from './commerce-schemas';
const id='11111111-1111-4111-8111-111111111111';
const request={id,businessId:id,branchId:id,periodId:id,date:'2026-10-27',kind:'sale',status:'confirmed',reference:'SALE',lines:[{variantId:id,quantity:1,price:250}]};
describe('Mobile membership rules',()=>{
 it('requires mobile for confirmed sales',()=>expect(documentInput.safeParse(request).success).toBe(false));
 it('permits incomplete unconfirmed drafts',()=>expect(documentInput.safeParse({...request,status:'draft'}).success).toBe(true));
 it('uses AL- plus the normalized mobile as membership number',()=>expect(membershipNumber('+977 984-123-4567')).toBe('AL-9841234567'));
 it('normalizes country prefixes to the same member',()=>expect(normalizeMobile('9779841234567')).toBe(normalizeMobile('9841234567')));
 it('rejects invalid Nepal mobiles and alphabetic input',()=>{expect(normalizeMobile('9612345678')).toBe('');expect(normalizeMobile('9841234567abc')).toBe('');});
 it('earns one point per NPR 100 rounded down per purchase',()=>{expect(earnedPoints(100)).toBe(1);expect(earnedPoints(250)).toBe(2);expect(earnedPoints(99)).toBe(0);});
 it('accumulates points across purchases',()=>expect(earnedPoints(250)+earnedPoints(399)).toBe(5));
 it('uses final discounted tax-inclusive total',()=>expect(earnedPoints('101.70')).toBe(1));
 it('returns reduce only original net sale points',()=>{expect(remainingPoints(250,50)).toBe(2);expect(remainingPoints(250,100)).toBe(1);expect(remainingPoints(250,250)).toBe(0);});
});