import {describe,it,expect} from 'vitest';
import {costOfGoods} from './business-reports';
const line=(variantId:string,quantity:number,price:number,discount=0)=>({variantId,quantity,price,discount,taxRate:0});
describe('cost of goods uses last purchase price',()=>{
 it('uses the most recent purchase on or before the sale date',()=>{const c=costOfGoods([{id:'p1',kind:'purchase',document_date:'2026-01-01',lines:[line('a',10,100)]},{id:'p2',kind:'purchase',document_date:'2026-02-01',lines:[line('a',5,120)]},{id:'s',kind:'sale',document_date:'2026-02-10',lines:[line('a',2,200)]}]);expect(c.get('s')?.cost.toFixed(2)).toBe('240.00');});
 it('ignores purchases after the sale',()=>{const c=costOfGoods([{id:'p',kind:'purchase',document_date:'2026-03-01',lines:[line('a',1,90)]},{id:'s',kind:'sale',document_date:'2026-02-01',lines:[line('a',1,200)]}]);expect(c.get('s')?.cost.toFixed(2)).toBe('0.00');expect(c.get('s')?.missing).toBe(1);});
 it('spreads purchase discount across quantity',()=>{const c=costOfGoods([{id:'p',kind:'purchase',document_date:'2026-01-01',lines:[line('a',4,100,40)]},{id:'s',kind:'sale',document_date:'2026-01-02',lines:[line('a',1,200)]}]);expect(c.get('s')?.cost.toFixed(2)).toBe('90.00');});
 it('reverses cost for sale returns',()=>{const c=costOfGoods([{id:'p',kind:'purchase',document_date:'2026-01-01',lines:[line('a',1,100)]},{id:'r',kind:'sale_return',document_date:'2026-01-05',lines:[line('a',1,200)]}]);expect(c.get('r')?.cost.toFixed(2)).toBe('-100.00');});
});
