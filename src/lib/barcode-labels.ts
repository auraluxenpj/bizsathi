export const labelFormats = {
  'a4-24': {name:'A4 · 24 labels',columns:3,rows:8,width:63.5,height:33.9,pageWidth:210,pageHeight:297,gap:2.5,top:12.9,left:7.25},
  'a4-30': {name:'A4 · 30 labels',columns:3,rows:10,width:63.5,height:25.4,pageWidth:210,pageHeight:297,gap:2.5,top:21.5,left:7.25},
  'thermal-50': {name:'Thermal · 50 × 25 mm',columns:1,rows:1,width:50,height:25,pageWidth:50,pageHeight:25,gap:0,top:0,left:0},
  'thermal-40': {name:'Thermal · 40 × 30 mm',columns:1,rows:1,width:40,height:30,pageWidth:40,pageHeight:30,gap:0,top:0,left:0},
} as const;
export type LabelFormat = keyof typeof labelFormats;
export type LabelProduct = {id:string;sku:string;barcode?:string|null;name:string;price:number};
export function stickerValue(product:LabelProduct) { return product.barcode?.trim()||product.sku.trim(); }
export function labelPages(items:{product:LabelProduct;copies:number}[], format:LabelFormat, startSlot=1) {
  const f=labelFormats[format],capacity=f.columns*f.rows;
  if(!Number.isInteger(startSlot)||startSlot<1||startSlot>capacity)throw new Error('Invalid starting label position.');
  if(items.some(i=>!Number.isInteger(i.copies)||i.copies<0||i.copies>1000))throw new Error('Copies must be between 0 and 1000.');
  const labels=items.flatMap(i=>Array.from({length:i.copies},()=>i.product));
  if(labels.length>1000)throw new Error('Print at most 1000 labels at a time.');
  if(!labels.length)return [];
  const slots:(LabelProduct|null)[]=[...Array.from({length:startSlot-1},()=>null),...labels];
  const pages:(LabelProduct|null)[][]=[];
  for(let i=0;i<slots.length;i+=capacity)pages.push(Array.from({length:capacity},(_,j)=>slots[i+j]??null));
  return pages;
}