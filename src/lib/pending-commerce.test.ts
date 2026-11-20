import {describe,it,expect} from 'vitest';
import {isConfirmedCommerceDocument} from './pending-commerce';

describe('pending commerce recovery',()=>{
 it('recognizes only confirmed documents as completed sales',()=>{
  expect(isConfirmedCommerceDocument('confirmed')).toBe(true);
  expect(isConfirmedCommerceDocument('draft')).toBe(false);
  expect(isConfirmedCommerceDocument(null)).toBe(false);
  expect(isConfirmedCommerceDocument(undefined)).toBe(false);
 });
});
