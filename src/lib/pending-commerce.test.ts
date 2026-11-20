import {describe,it,expect} from 'vitest';
import {isConfirmedCommerceDocument,sourceIdForDocument} from './pending-commerce';

describe('pending commerce recovery',()=>{
 it('recognizes only confirmed documents as completed sales',()=>{
  expect(isConfirmedCommerceDocument('confirmed')).toBe(true);
  expect(isConfirmedCommerceDocument('draft')).toBe(false);
  expect(isConfirmedCommerceDocument(null)).toBe(false);
  expect(isConfirmedCommerceDocument(undefined)).toBe(false);
 });
 it('resumes a draft goods receipt against its original confirmed purchase invoice',()=>{
  expect(sourceIdForDocument({status:'draft',source_id:'purchase-invoice-id'},'draft-receipt-id')).toBe('purchase-invoice-id');
 });
 it('resumes a draft purchase against its original confirmed purchase order',()=>{
  expect(sourceIdForDocument({status:'draft',source_id:'purchase-order-id'},'draft-bill-id')).toBe('purchase-order-id');
 });
 it('does not invent a source for an unlinked draft',()=>{
  expect(sourceIdForDocument({status:'draft',source_id:null},'draft-id')).toBeNull();
 });
 it('preserves the selected source when creating a document from a confirmed source',()=>{
  expect(sourceIdForDocument({status:'confirmed',source_id:null},'confirmed-purchase-id')).toBe('confirmed-purchase-id');
 });
});
