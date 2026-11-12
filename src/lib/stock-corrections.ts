import { z } from 'zod';
import { stockInput } from './inventory-schemas';
export const correctionInput = z.object({
  mode: z.enum(['adjust', 'dispose']), quantity: z.coerce.number().finite(),
  classification: z.enum(['damaged', 'expired']).default('damaged'),
  notes: z.string().trim().min(1, 'A reason is required.').max(450),
}).superRefine((v, ctx) => {
  if (v.quantity === 0 || Math.abs(v.quantity*1000-Math.round(v.quantity*1000))>0.00001)
    ctx.addIssue({code:'custom',path:['quantity'],message:'Use a nonzero quantity with at most 3 decimals.'});
  if (v.mode==='dispose' && v.quantity<=0)
    ctx.addIssue({code:'custom',path:['quantity'],message:'Enter a positive quantity to dispose.'});
});
export function correctionRequest(base: {businessId:string;id:string;variantId:string;branchId:string;reference:string}, correction: z.input<typeof correctionInput>) {
  const c=correctionInput.parse(correction);
  return stockInput.parse({...base,kind:'adjustment',destinationBranchId:null,
    quantity:c.mode==='dispose'?-c.quantity:c.quantity,
    reason:c.mode==='dispose'?`Disposal · ${c.classification}: ${c.notes}`:`Stock adjustment: ${c.notes}`});
}