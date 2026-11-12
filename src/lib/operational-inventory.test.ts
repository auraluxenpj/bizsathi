import {describe,it,expect} from 'vitest';
import { correctionInput, correctionRequest } from './stock-corrections';
import {returnableLines, returnLine, returnCredit, returnSettlement, type ReturnDocument} from './invoice-returns';
import {labelPages,labelFormats,stickerValue,type LabelProduct} from './barcode-labels';
const id='11111111-1111-4111-8111-111111111111';
const base={businessId:id,id,branchId:id,variantId:id,reference:'DAMAGE-1'};
describe('Stock adjustments and disposals',()=>{
 it('records a disposal as a negative adjustment with its damage reason',()=>{expect(correctionRequest(base,{mode:'dispose',quantity:3,classification:'damaged',notes:'Broken packaging'})).toMatchObject({kind:'adjustment',quantity:-3,reason:'Disposal · damaged: Broken packaging'});});
 it('rejects negative disposal quantities',()=>{expect(correctionInput.safeParse({mode:'dispose',quantity:-3,notes:'Expired'}).success).toBe(false);});
 it('requires a logged reason',()=>{expect(correctionInput.safeParse({mode:'adjust',quantity:2,notes:' '}).success).toBe(false);});
 it('preserves signed adjustment changes',()=>{expect(correctionRequest(base,{mode:'adjust',quantity:-1.25,notes:'Recount'}).quantity).toBe(-1.25);});
});
const line={variantId:id,quantity:10,price:100,discount:30,taxRate:13};
const original:ReturnDocument={id:'invoice',source_id:null,kind:'sale',status:'confirmed',total:1096.1,lines:[line]};
describe('Invoice return quantities and settlements',()=>{
 it('subtracts confirmed returns but not drafts',()=>{const rows=[{...original,id:'r',source_id:'invoice',kind:'sale_return',lines:[{...line,quantity:3}]},{...original,id:'draft',source_id:'invoice',kind:'sale_return',status:'draft',lines:[{...line,quantity:5}]}];expect(returnableLines(original,rows)[0]).toMatchObject({returned:3,remaining:7,maximum:7});});
 it('limits purchase returns to goods received less earlier returns and current stock',()=>{const p={...original,kind:'purchase'};const docs=[{...p,id:'g',source_id:p.id,kind:'goods_receipt',lines:[{...line,quantity:6}]},{...p,id:'r',source_id:p.id,kind:'purchase_return',lines:[{...line,quantity:2}]}];expect(returnableLines(p,docs,new Map([[id,3]]))[0]).toMatchObject({received:6,returned:2,remaining:8,maximum:3});});
 it('prorates original discount and VAT for selected return quantities',()=>{const r=returnLine(line,2);expect(r.discount).toBe(6);expect(returnCredit([r])).toBe(219.22);});
 it('applies a partial return to unpaid invoice credit before any refund',()=>{expect(returnSettlement(1000,400,0,0,500)).toMatchObject({applied:500,newRefund:0,refundable:0,outstanding:100});});
 it('separates refund owed from prior recorded refunds',()=>{expect(returnSettlement(1000,900,300,100,200)).toMatchObject({applied:0,newRefund:200,refundable:300,refundsPaid:100,outstanding:0});});
 it('requires a fully paid walk-in sale return to be refunded in full',()=>{expect(returnSettlement(1000,1000,0,0,300).refundable).toBe(300);});
});
const product:LabelProduct={id,sku:'AL-SKU-01',name:'Item',price:200,barcode:null};
describe('Barcode label sheet layouts',()=>{
 it('matches the reference 40-label A4 cells without margins or gaps',()=>{expect(labelFormats['a4-40']).toMatchObject({columns:4,rows:10,width:52.5,height:29.7,gap:0,top:0,left:0,pageWidth:210,pageHeight:297});expect(labelPages([{product,copies:41}],'a4-40').map(p=>p.filter(Boolean).length)).toEqual([40,1]);});
 it('matches the reference 48-label size, sheet margins and horizontal pitch',()=>{expect(labelFormats['a4-48']).toMatchObject({columns:4,rows:12,width:48.63,height:23.92,gap:2.5,top:4.98,left:6.99,pageWidth:210,pageHeight:297});expect(labelPages([{product,copies:49}],'a4-48').map(p=>p.filter(Boolean).length)).toEqual([48,1]);});
 it('respects used slots on the new 48-label sheet',()=>{const pages=labelPages([{product,copies:2}],'a4-48',48);expect(pages[0]?.[46]).toBeNull();expect(pages[0]?.[47]).toBe(product);expect(pages[1]?.[0]).toBe(product);});
 it('places 24 labels on each 3 by 8 A4 sheet',()=>{const pages=labelPages([{product,copies:25}],'a4-24');expect(pages.map(p=>p.filter(Boolean).length)).toEqual([24,1]);expect(labelFormats['a4-24'].columns).toBe(3);expect(labelFormats['a4-24'].rows).toBe(8);});
 it('places 30 labels on each 3 by 10 A4 sheet',()=>{const pages=labelPages([{product,copies:31}],'a4-30');expect(pages.map(p=>p.filter(Boolean).length)).toEqual([30,1]);expect(labelFormats['a4-30'].columns).toBe(3);expect(labelFormats['a4-30'].rows).toBe(10);});
 it('keeps used starting slots empty on only the first sheet',()=>{const pages=labelPages([{product,copies:24}],'a4-24',3);expect(pages[0]?.slice(0,3)).toEqual([null,null,product]);expect(pages[1]?.[0]).toEqual(product);});
 it('prints one label per thermal page with exact dimensions',()=>{expect(labelPages([{product,copies:2}],'thermal-50')).toHaveLength(2);expect(labelFormats['thermal-50']).toMatchObject({pageWidth:50,pageHeight:25});expect(labelFormats['thermal-40']).toMatchObject({pageWidth:40,pageHeight:30});});
 it('encodes existing barcode or the exact SKU, never an unregistered generated code',()=>{expect(stickerValue(product)).toBe('AL-SKU-01');expect(stickerValue({...product,barcode:' 1234567890123 '})).toBe('1234567890123');});
});