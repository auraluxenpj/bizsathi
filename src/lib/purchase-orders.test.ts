import {describe,it,expect} from 'vitest';
import {orderStatus,daysOpen} from './purchase-orders';
const po={id:'po',kind:'purchase_order',status:'confirmed',source_id:null,reference:'PO-1',document_date:'2026-11-01',total:100,party_id:null,lines:[]};
describe('purchase order status',()=>{
 it('is draft until the order is confirmed',()=>expect(orderStatus({...po,status:'draft'},[])).toBe('draft'));
 it('is pending until a bill is linked',()=>expect(orderStatus(po,[])).toBe('pending'));
 it('shows a bill in progress for an unconfirmed linked bill',()=>expect(orderStatus(po,[{...po,id:'b',kind:'purchase',status:'draft',source_id:'po'}])).toBe('billed_draft'));
 it('is billed once a linked bill is confirmed',()=>expect(orderStatus(po,[{...po,id:'b',kind:'purchase',status:'confirmed',source_id:'po'}])).toBe('billed'));
 it('ignores bills for other orders',()=>expect(orderStatus(po,[{...po,id:'b',kind:'purchase',status:'confirmed',source_id:'x'}])).toBe('pending'));
 it('counts days open',()=>expect(daysOpen(po,'2026-11-12')).toBe(11));
});
