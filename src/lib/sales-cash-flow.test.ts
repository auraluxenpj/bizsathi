import {describe,it,expect} from 'vitest';
import {creditAlert,creditInput,quotationInput,statementMessage,customerSnapshot} from './sales-cash-flow';
import {documentInput} from './commerce-schemas';
const id='11111111-1111-4111-8111-111111111111';
describe('Customer credit limits',()=>{
 it('blank leaves credit unconfigured',()=>expect(creditAlert(100,null)).toBeNull());
 it('zero alerts for any outstanding credit',()=>expect(creditAlert(0.01,0)?.exceeded).toBe(true));
 it('exact limit is not exceeded',()=>expect(creditAlert(100,100)?.exceeded).toBe(false));
 it('unpaid proposed sale can trigger an alert without changing current credit',()=>expect(creditAlert(90,100,11)).toMatchObject({exceeded:false,wouldExceed:true,proposed:101,excess:1}));
 it('does not count paid sale amount or negative party credit',()=>expect(creditAlert(-50,100,0)?.wouldExceed).toBe(false));
 it('rejects negative and fractional-cent limits',()=>{expect(creditInput.safeParse({businessId:id,partyId:id,limit:-1}).success).toBe(false);expect(creditInput.safeParse({businessId:id,partyId:id,limit:1.001}).success).toBe(false);});
});
describe('Quotation and statement rules',()=>{
 const q={businessId:id,id,branchId:id,partyId:id,revision:0,reference:'EST-1',date:'2026-11-12',expiresOn:null,status:'draft',mobile:'9812345678',lines:[{variantId:id,quantity:2,price:123.45,discount:6.78,taxRate:0}]};
 it('preserves quantity, pricing and discounts in quotation input',()=>expect(quotationInput.parse(q).lines).toEqual(q.lines));
 it('rejects expiry before quotation date',()=>expect(quotationInput.safeParse({...q,expiresOn:'2026-11-11'}).success).toBe(false));
 it('retains quotation linkage on sale confirmation without return source',()=>{const r=documentInput.parse({...q,periodId:id,status:'confirmed',kind:'sale',sourceId:null,quotationId:id,customerSnapshot:{name:'Customer',phone:q.mobile,address:'Address',pan:'PAN'},payments:[]});expect(r.quotationId).toBe(id);expect(r.sourceId).toBeNull();expect(r.lines).toEqual(q.lines);expect(r.customerSnapshot?.address).toBe('Address');});
 it('keeps source customer details independent of updated party fields',()=>expect(customerSnapshot({name:'Original',phone:'9812345678',address:'Original address',pan:'123'})).toEqual({name:'Original',phone:'9812345678',address:'Original address',pan:'123'}));
 it('supplier negative balance uses payable direction and omits collection instructions',()=>{const m=statementMessage({business:'Auraluxe',party:'Supplier',date:'2026-11-12',balance:-500,invoices:[],scope:'Authorized branches',payment:{url:null,provider:'Fonepay',payee:'Auraluxe',instructions:'Bank account 123'}});expect(m).toContain('To pay to party');expect(m).not.toContain('Bank account 123');});
 it('customer positive balance includes unpaid reference and payment details, not private QR URL',()=>{const m=statementMessage({business:'Auraluxe',party:'Customer',date:'2026-11-12',balance:200,invoices:[{reference:'INV-1',outstanding:200}],scope:'Authorized branches',payment:{url:'https://private.invalid/token',provider:'Fonepay',payee:'Auraluxe',instructions:'Account 123'}});expect(m).toContain('To receive from party');expect(m).toContain('INV-1');expect(m).toContain('Account 123');expect(m).not.toContain('private.invalid');});
});