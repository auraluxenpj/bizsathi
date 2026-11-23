import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const BUSINESS_ID = 'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01';
const itemSchema = z.object({
  product_id: z.string().uuid().optional(),
  variant_id: z.string().uuid().optional(),
  name: z.string().trim().max(200).optional().nullable(),
  category: z.string().trim().max(100).optional().nullable(),
  variant_name: z.string().trim().max(100).optional().nullable(),
  model_code: z.string().trim().max(64).optional().nullable(),
  sku: z.string().trim().min(1).max(80).regex(/^\\S+$/),
  unit: z.string().trim().max(30).optional().nullable(),
  sizes: z.array(z.string().trim().max(30)).max(30).optional(),
  purchase_price: z.number().finite().min(0).optional(),
  mrp: z.number().finite().min(0).optional(),
  selling_price: z.number().finite().min(0).optional(),
  wholesale_price: z.number().finite().min(0).optional(),
  reorder_level: z.number().finite().min(0).optional(),
  published: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
  barcode: z.string().trim().max(80).optional().nullable(),
}).strict();
const schema = z.object({ items: z.array(itemSchema).min(1).max(500) }).strict();

type Db = { rpc: (name: string, args: Record<string, unknown>) => Promise<{data: unknown; error: {message:string}|null}> };

function equal(a:string,b:string):boolean {
  const x=new TextEncoder().encode(a), y=new TextEncoder().encode(b);
  let d=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++) d|=(x[i]??0)^(y[i]??0);
  return d===0;
}

export const Route = createFileRoute('/api/public/auraluxe-catalogue')({
  server: { handlers: { POST: async ({request}) => {
    const expected=process.env['WEBSITE_INVENTORY_SYNC_SECRET'];
    const auth=request.headers.get('authorization')??'';
    const supplied=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!expected||expected.length<24||!supplied||!equal(expected,supplied))
      return Response.json({error:'Unauthorized'},{status:401});
    const len=Number(request.headers.get('content-length')??0);
    if(Number.isFinite(len)&&len>1_000_000) return Response.json({error:'Request too large'},{status:413});
    let parsed:z.infer<typeof schema>;
    try {
      const raw=await request.text();
      if(new TextEncoder().encode(raw).byteLength>1_000_000) return Response.json({error:'Request too large'},{status:413});
      parsed=schema.parse(JSON.parse(raw));
    } catch { return Response.json({error:'Invalid catalogue batch'},{status:400}); }
    const seen=new Set<string>();
    for(const item of parsed.items) {
      const key=item.sku.toLowerCase();
      if(seen.has(key)) return Response.json({error:'Duplicate SKU in batch'},{status:400});
      seen.add(key);
    }
    try {
      const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
      const db=supabaseAdmin as unknown as Db;
      const result=await db.rpc('upsert_shared_catalogue_from_auraluxe',{_business_id:BUSINESS_ID,_items:parsed.items});
      if(result.error||!result.data||typeof result.data!=='object') {
        console.error('[auraluxe-catalogue] import failed',result.error?.message??'invalid response');
        return Response.json({error:'Catalogue import failed'},{status:503});
      }
      return Response.json({result:result.data},{headers:{'Cache-Control':'no-store'}});
    } catch(error) {
      console.error('[auraluxe-catalogue] request failed',error);
      return Response.json({error:'Catalogue import unavailable'},{status:503});
    }
  }}}
});
