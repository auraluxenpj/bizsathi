import {describe,it,expect} from 'vitest';
import {orderStatus,daysOpen} from './purchase-orders';
const po={id:'po',kind:'purchase_order',status:'confirmed',source_id:null,reference:'PO-1',document_date:'2026-11-01',total:100,party_id:null,lines:[{variantId:'v1',quantity:5},{variantId:'v2',quantity:2}]};
const bill=(id:string,quantity:number,variantId='v1',status='confirmed')=>({...po,id,kind:'purchase',status,source_id:'po',lines:[{variantId,quantity}]});
describe('purchase order status',()=>{
 it('is draft until the order is confirmed',()=>expect(orderStatus({...po,status:'draft'},[])).toBe('draft'));
 it('is pending until a bill is linked',()=>expect(orderStatus(po,[])).toBe('pending'));
 it('shows a bill in progress for an unconfirmed linked bill',()=>expect(orderStatus(po,[bill('draft',2,'v1','draft')])).toBe('billed_draft'));
 it('shows a partial bill as partially billed',()=>expect(orderStatus(po,[bill('b1',2)])).toBe('partially_billed'));
 it('adds quantities across multiple partial bills',()=>expect(orderStatus(po,[bill('b1',2),bill('b2',3)])).toBe('partially_billed'));
 it('marks fully invoiced quantities as billed',()=>expect(orderStatus(po,[bill('b1',3),bill('b2',2),bill('b3',2,'v2')])).toBe('billed'));
 it('does not treat an overbilled first variant as completing a different variant',()=>expect(orderStatus(po,[bill('b1',7)])).toBe('partially_billed'));
 it('ignores bills for other orders',()=>expect(orderStatus(po,[{...bill('b',5),source_id:'x'}])).toBe('pending'));
 it('counts days open',()=>expect(daysOpen(po,'2026-11-12')).toBe(11));
});
