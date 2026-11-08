-- Isolated database only. Final exception deliberately rolls back all fixtures.
-- Pass = error 'INVENTORY SYNC TESTS PASSED'.
DO $tests$
DECLARE
  p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); p3 uuid:=gen_random_uuid(); v_m uuid:=gen_random_uuid(); v_l uuid:=gen_random_uuid();
  r jsonb; acks jsonb; ack_id uuid; denied boolean;
BEGIN
 -- Fixtures: P1 has two size rows, P2 has no sizes, P3 has size rows but its own SKU is also set.
 INSERT INTO public.products(id,name,sku,stock) VALUES(p1,'Kurti','AL-K-100',15),(p2,'Scarf','AL-S-200',8),(p3,'Saree','AL-P-300',5);
 INSERT INTO public.product_variants(id,product_id,size,sku,stock) VALUES(v_m,p1,'M','AL-K-100-M',10),(v_l,p1,'L','AL-K-100-L',5),(gen_random_uuid(),p3,'Free','AL-P-300-F',5);

 -- Matching rules, case and spaces ignored.
 r:=public.inv_sync_state(ARRAY['al-k-100-m ',' AL-S-200','AL-K-100','AL-P-300','NOPE','']);
 ASSERT r->0->>'match'='variant' AND (r->0->>'current')::int=10,'size SKU matches a size row';
 ASSERT r->1->>'match'='product' AND (r->1->>'current')::int=8,'product SKU matches when it has no sizes';
 ASSERT r->2->>'match'='ambiguous','product with size rows is ambiguous';
 ASSERT r->3->>'match'='ambiguous','product SKU with size rows is ambiguous';
 ASSERT r->4->>'match'='none' AND r->5->>'match'='none','unknown and blank SKUs do not match';

 -- First contact only baselines; nothing to record.
 acks:=public.inv_sync_ack(ARRAY['AL-K-100-M','AL-S-200']);
 ASSERT jsonb_array_length(acks)=0,'first sync only baselines';
 ASSERT (SELECT last_stock FROM public.inventory_sync_state WHERE sku='al-k-100-m')=10,'baseline stored';

 -- Online order sells 2 of size M: acknowledgement appears once, even if asked twice.
 UPDATE public.product_variants SET stock=8 WHERE id=v_m; UPDATE public.products SET stock=13 WHERE id=p1;
 acks:=public.inv_sync_ack(ARRAY['AL-K-100-M']);
 ASSERT jsonb_array_length(acks)=1 AND (acks->0->>'delta')::int=-2 AND acks->0->>'sku'='al-k-100-m','sale seen as delta -2';
 ack_id:=(acks->0->>'id')::uuid;
 acks:=public.inv_sync_ack(ARRAY['AL-K-100-M']);
 ASSERT jsonb_array_length(acks)=1 AND (acks->0->>'id')::uuid=ack_id,'same pending ack returned, not duplicated';
 ASSERT (SELECT count(*) FROM public.inventory_sync_acks)=1,'only one ack row';

 -- Push is refused while an ack is pending, so a sale can never be skipped over.
 r:=public.inv_sync_push('[{"sku":"AL-K-100-M","stock":20,"expected":8}]');
 ASSERT r->0->>'result'='pending','push blocked until the ack is recorded';
 ASSERT public.inv_sync_recorded(ARRAY[ack_id])=1,'ack recorded';
 ASSERT public.inv_sync_recorded(ARRAY[ack_id])=0,'recording twice changes nothing';
 ASSERT jsonb_array_length(public.inv_sync_ack(ARRAY['AL-K-100-M']))=0,'recorded ack no longer returned';

 -- An order lands between acknowledging and pushing: the push is skipped, the order is kept, next sync sees it.
 UPDATE public.product_variants SET stock=7 WHERE id=v_m; UPDATE public.products SET stock=12 WHERE id=p1;
 r:=public.inv_sync_push('[{"sku":"AL-K-100-M","stock":8,"expected":8}]');
 ASSERT r->0->>'result'='changed' AND (SELECT stock FROM public.product_variants WHERE id=v_m)=7,'concurrent order is never overwritten';
 acks:=public.inv_sync_ack(ARRAY['AL-K-100-M']);
 ASSERT (acks->0->>'delta')::int=-1,'next sync sees the missed order as -1';
 PERFORM public.inv_sync_recorded(ARRAY[(acks->0->>'id')::uuid]);

 -- Successful push: size row set, product total moves by the same amount, state and log written.
 r:=public.inv_sync_push('[{"sku":"AL-K-100-M","stock":12,"expected":7}]');
 ASSERT r->0->>'result'='applied','push applied';
 ASSERT (SELECT stock FROM public.product_variants WHERE id=v_m)=12,'size stock set';
 ASSERT (SELECT stock FROM public.products WHERE id=p1)=17,'product total moved by the same amount (12 + 5)';
 ASSERT (SELECT last_stock FROM public.inventory_sync_state WHERE sku='al-k-100-m')=12,'state follows the push';
 ASSERT (SELECT before_stock||'>'||after_stock FROM public.inventory_sync_log WHERE sku='al-k-100-m' ORDER BY id DESC LIMIT 1)='7>12','log records before and after';

 -- Product with no sizes is updated directly; ambiguous or unknown SKUs are never touched.
 r:=public.inv_sync_push('[{"sku":"AL-S-200","stock":3,"expected":8},{"sku":"AL-K-100","stock":1,"expected":0},{"sku":"NOPE","stock":1,"expected":0}]');
 ASSERT r->0->>'result'='applied' AND (SELECT stock FROM public.products WHERE id=p2)=3,'plain product updated';
 ASSERT r->1->>'result'='no-match' AND r->2->>'result'='no-match','ambiguous and unknown SKUs are skipped';
 ASSERT (SELECT stock FROM public.products WHERE id=p3)=5,'ambiguous product untouched';

 -- Late reader: an order lands after the acknowledgement, and the caller reads that new stock as "expected".
 PERFORM public.inv_sync_ack(ARRAY['AL-S-200']);
 UPDATE public.products SET stock=2 WHERE id=p2;
 r:=public.inv_sync_push('[{"sku":"AL-S-200","stock":3,"expected":2}]');
 ASSERT r->0->>'result'='changed' AND (SELECT stock FROM public.products WHERE id=p2)=2,'order placed after acknowledgement is not overwritten even if expected was read late';
 PERFORM public.inv_sync_ack(ARRAY['AL-S-200']); PERFORM public.inv_sync_recorded(ARRAY[(SELECT id FROM public.inventory_sync_acks WHERE sku='al-s-200' AND status='pending')]);
 r:=public.inv_sync_push('[{"sku":"AL-S-200","stock":3,"expected":2}]');
 ASSERT r->0->>'result'='applied','push works again once the sale has been acknowledged and recorded';
 -- A SKU that was never acknowledged has no agreed baseline, so it is not pushed.
 INSERT INTO public.products(id,name,sku,stock) VALUES(gen_random_uuid(),'Fresh','AL-N-400',4);
 r:=public.inv_sync_push('[{"sku":"AL-N-400","stock":9,"expected":4}]');
 ASSERT r->0->>'result'='changed','never-acknowledged SKU is skipped';
 -- Bad input is rejected as a whole.
 denied:=false; BEGIN PERFORM public.inv_sync_push('[{"sku":"AL-S-200","stock":-1,"expected":3}]'); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'negative stock rejected';
 denied:=false; BEGIN PERFORM public.inv_sync_push('{"sku":"x"}'); EXCEPTION WHEN OTHERS THEN denied:=true; END; ASSERT denied,'non-array rejected';

 -- Only the service role may call these functions or read the tables.
 SET LOCAL ROLE anon;
 denied:=false; BEGIN PERFORM public.inv_sync_state(ARRAY['AL-S-200']); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; ASSERT denied,'anon cannot call state';
 denied:=false; BEGIN PERFORM public.inv_sync_push('[]'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; ASSERT denied,'anon cannot push';
 denied:=false; BEGIN PERFORM count(*) FROM public.inventory_sync_state; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; ASSERT denied,'anon cannot read state table';
 RESET ROLE;
 SET LOCAL ROLE authenticated;
 denied:=false; BEGIN PERFORM public.inv_sync_ack(ARRAY['AL-S-200']); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; ASSERT denied,'signed-in users cannot call ack';
 denied:=false; BEGIN PERFORM count(*) FROM public.inventory_sync_log; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; ASSERT denied,'signed-in users cannot read the log';
 RESET ROLE;
 SET LOCAL ROLE service_role;
 ASSERT jsonb_array_length(public.inv_sync_state(ARRAY['AL-S-200']))=1,'service role can call';
 RESET ROLE;
 RAISE EXCEPTION 'INVENTORY SYNC TESTS PASSED';
END $tests$;
