CREATE FUNCTION public.commerce_journal(_business uuid,_branch uuid,_period uuid,_source uuid,_type text,_date date,_account text,_debit numeric,_credit numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF _debit>0 OR _credit>0 THEN INSERT INTO public.commerce_journal_entries(business_id,branch_id,period_id,source_id,source_type,entry_date,account_code,debit,credit,actor_id) VALUES(_business,_branch,_period,_source,_type,_date,_account,_debit,_credit,auth.uid());END IF;END $$;
REVOKE ALL ON FUNCTION public.commerce_journal(uuid,uuid,uuid,uuid,text,date,text,numeric,numeric) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.post_commerce_payment(_request jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid:=(_request->>'businessId')::uuid;i uuid:=(_request->>'id')::uuid;d public.commerce_documents;p public.commerce_payments;amount numeric:=(_request->>'amount')::numeric;method text:=_request->>'method';dt date:=(_request->>'date')::date;period uuid:=(_request->>'periodId')::uuid;session uuid:=(_request->>'sessionId')::uuid;paid numeric;returned numeric;direction text;control text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(b::text,0));
 SELECT * INTO d FROM public.commerce_documents WHERE id=(_request->>'documentId')::uuid AND business_id=b AND status='confirmed';
 IF NOT FOUND OR NOT public.can_access_branch(b,d.branch_id) THEN RAISE EXCEPTION 'Document access denied';END IF;
 IF NOT public.has_business_role(b,'accountant') AND NOT (public.has_business_role(b,'staff') AND d.kind='sale' AND d.actor_id=auth.uid()) THEN RAISE EXCEPTION 'Payment access denied';END IF;
 IF d.kind IN ('sale_return','purchase_return') AND NOT public.has_business_role(b,'admin') THEN RAISE EXCEPTION 'Refund administrator required';END IF;
 SELECT * INTO p FROM public.commerce_payments WHERE id=i;
 IF FOUND THEN IF p.business_id=b AND p.actor_id=auth.uid() AND p.request=_request THEN RETURN i;END IF;RAISE EXCEPTION 'Request identifier conflict';END IF;
 PERFORM public.commerce_open_period(b,period,dt);
 IF method NOT IN ('cash','bank','wallet') OR amount IS NULL OR amount<=0 OR amount<>round(amount,2) OR amount::text IN ('NaN','Infinity','-Infinity') OR length(btrim(_request->>'reference')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid payment';END IF;
 IF d.kind NOT IN ('sale','purchase','sale_return','purchase_return') THEN RAISE EXCEPTION 'This document cannot receive a payment';END IF;
 SELECT coalesce(sum(total),0) INTO returned FROM public.commerce_documents WHERE source_id=d.id AND business_id=b AND kind IN ('sale_return','purchase_return') AND status='confirmed';
 SELECT coalesce(sum(amount),0) INTO paid FROM public.commerce_payments WHERE document_id=d.id;
 IF paid+amount>d.total-returned THEN RAISE EXCEPTION 'Payment exceeds outstanding amount';END IF;
 direction:=CASE WHEN d.kind IN ('sale','purchase_return') THEN 'in' ELSE 'out' END;
 control:=CASE WHEN d.kind IN ('sale','sale_return') THEN 'receivable' ELSE 'payable' END;
 IF method='cash' THEN
 IF session IS NULL OR NOT EXISTS(SELECT 1 FROM public.cash_counter_events WHERE session_id=session AND business_id=b AND branch_id=d.branch_id AND kind='open' AND actor_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.cash_counter_events WHERE session_id=session AND kind='close') THEN RAISE EXCEPTION 'Your open cash counter is required';END IF;
 END IF;
 INSERT INTO public.commerce_payments(id,business_id,branch_id,period_id,document_id,method,amount,direction,session_id,reference,actor_id,payment_date,request) VALUES(i,b,d.branch_id,period,d.id,method,amount,direction,session,btrim(_request->>'reference'),auth.uid(),dt,_request);
 PERFORM public.commerce_journal(b,d.branch_id,period,i,'payment',dt,method,CASE WHEN direction='in' THEN amount ELSE 0 END,CASE WHEN direction='out' THEN amount ELSE 0 END);
 PERFORM public.commerce_journal(b,d.branch_id,period,i,'payment',dt,control,CASE WHEN direction='out' THEN amount ELSE 0 END,CASE WHEN direction='in' THEN amount ELSE 0 END);
 RETURN i;
END $$;
REVOKE ALL ON FUNCTION public.post_commerce_payment(jsonb) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.post_commerce_payment(jsonb) TO authenticated;
CREATE FUNCTION public.post_commerce_document(_request jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid:=(_request->>'businessId')::uuid;i uuid:=(_request->>'id')::uuid;br uuid:=(_request->>'branchId')::uuid;per uuid:=(_request->>'periodId')::uuid;src uuid:=(_request->>'sourceId')::uuid;party uuid:=(_request->>'partyId')::uuid;dt date:=(_request->>'date')::date;k text:=_request->>'kind';st text:=_request->>'status';existing public.commerce_documents;original public.commerce_documents;r jsonb;source_line jsonb;v public.product_variants;lines jsonb:='[]';qty numeric;price numeric;discount numeric;rate numeric;base numeric;taxline numeric;subtotal numeric:=0;taxsum numeric:=0;total numeric;already numeric;sourceqty numeric;paid numeric;payments numeric:=0;pay jsonb;settings public.business_settings;sign numeric;control text;account text;idx integer:=0;reqrole text;
BEGIN
 reqrole:=CASE WHEN k IN ('sale_return','purchase_return') THEN 'admin' WHEN k='sale' THEN 'staff' ELSE 'accountant' END;
 IF NOT public.has_business_role(b,reqrole) OR NOT public.can_access_branch(b,br) THEN RAISE EXCEPTION 'Document access denied';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(b::text,0));
 SELECT * INTO existing FROM public.commerce_documents WHERE id=i;
 IF FOUND THEN IF existing.business_id=b AND existing.actor_id=auth.uid() AND existing.request=_request THEN RETURN i;END IF;RAISE EXCEPTION 'Request identifier conflict';END IF;
 PERFORM public.commerce_open_period(b,per,dt);
 IF k NOT IN ('sale','purchase','sale_return','purchase_return','purchase_order','goods_receipt') OR st NOT IN ('draft','confirmed') OR jsonb_typeof(_request->'lines')<>'array' OR jsonb_array_length(_request->'lines') NOT BETWEEN 1 AND 100 OR coalesce(length(btrim(_request->>'reference')),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid document';END IF;
 SELECT * INTO settings FROM public.business_settings WHERE business_id=b;
 IF NOT FOUND THEN RAISE EXCEPTION 'Business settings required';END IF;
 IF party IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.parties WHERE id=party AND business_id=b AND is_active AND kind=CASE WHEN k IN ('sale','sale_return') THEN 'customer' ELSE 'supplier' END) THEN RAISE EXCEPTION 'Active matching contact required';END IF;
 IF k NOT IN ('sale') AND party IS NULL THEN RAISE EXCEPTION 'Contact required';END IF;
 IF src IS NOT NULL THEN SELECT * INTO original FROM public.commerce_documents WHERE id=src AND business_id=b AND branch_id=br AND status='confirmed';IF NOT FOUND OR original.party_id IS DISTINCT FROM party THEN RAISE EXCEPTION 'Matching source document required';END IF;END IF;
 IF k IN ('sale_return','purchase_return','goods_receipt') AND (src IS NULL OR original.kind<>CASE WHEN k='sale_return' THEN 'sale' ELSE 'purchase' END) THEN RAISE EXCEPTION 'Original invoice required';END IF;
 IF k='purchase' AND src IS NOT NULL AND original.kind NOT IN ('purchase_order','purchase') THEN RAISE EXCEPTION 'Purchase source required';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(_request->'lines') LOOP
 idx:=idx+1;SELECT * INTO v FROM public.product_variants WHERE id=(r->>'variantId')::uuid AND business_id=b AND is_active;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=v.product_id AND business_id=b AND is_active) THEN RAISE EXCEPTION 'Active product variant required';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(lines) l WHERE l->>'variantId'=v.id::text) THEN RAISE EXCEPTION 'Combine duplicate variant lines';END IF;
 qty:=(r->>'quantity')::numeric;price:=(r->>'price')::numeric;discount:=coalesce((r->>'discount')::numeric,0);rate:=coalesce((r->>'taxRate')::numeric,0);
 IF qty IS NULL OR qty<=0 OR qty<>round(qty,3) OR qty::text IN ('NaN','Infinity','-Infinity') OR price IS NULL OR price<0 OR price<>round(price,2) OR price::text IN ('NaN','Infinity','-Infinity') OR discount<0 OR discount<>round(discount,2) OR rate<0 OR rate>100 OR rate<>round(rate,2) THEN RAISE EXCEPTION 'Invalid line amounts';END IF;
 IF k IN ('sale_return','purchase_return','goods_receipt') THEN
 SELECT l INTO source_line FROM jsonb_array_elements(original.lines) l WHERE l->>'variantId'=v.id::text;
 IF source_line IS NULL THEN RAISE EXCEPTION 'Variant absent from source';END IF;
 sourceqty:=(source_line->>'quantity')::numeric;
 SELECT coalesce(sum((l->>'quantity')::numeric),0) INTO already FROM public.commerce_documents d CROSS JOIN LATERAL jsonb_array_elements(d.lines) l WHERE d.business_id=b AND d.source_id=src AND d.kind=k AND d.status='confirmed' AND l->>'variantId'=v.id::text;
 IF qty+already>sourceqty THEN RAISE EXCEPTION 'Quantity exceeds unreturned or unreceived source quantity';END IF;
 price:=(source_line->>'price')::numeric;discount:=round((source_line->>'discount')::numeric*qty/sourceqty,2);rate:=(source_line->>'taxRate')::numeric;
 END IF;
 IF rate>0 AND (NOT settings.vat_registered OR rate<>settings.vat_rate) THEN RAISE EXCEPTION 'Tax rate must match business VAT settings or zero';END IF;
 base:=round(qty*price,2)-discount;IF base<0 THEN RAISE EXCEPTION 'Discount exceeds line amount';END IF;taxline:=round(base*rate/100,2);subtotal:=subtotal+base;taxsum:=taxsum+taxline;
 lines:=lines||jsonb_build_array(jsonb_build_object('variantId',v.id,'sku',v.sku,'name',v.name,'quantity',qty,'price',price,'discount',discount,'taxRate',rate,'base',base,'tax',taxline,'total',base+taxline));
 IF st='confirmed' AND k IN ('sale','purchase_return') AND public.commerce_stock_balance(b,br,v.id)<qty THEN RAISE EXCEPTION 'Insufficient stock';END IF;
 IF st='confirmed' AND k='purchase_return' THEN
 SELECT coalesce(sum((l->>'quantity')::numeric),0) INTO already FROM public.commerce_documents d CROSS JOIN LATERAL jsonb_array_elements(d.lines) l WHERE d.business_id=b AND d.source_id=src AND d.kind='goods_receipt' AND d.status='confirmed' AND l->>'variantId'=v.id::text;
 SELECT already-coalesce(sum((l->>'quantity')::numeric),0) INTO already FROM public.commerce_documents d CROSS JOIN LATERAL jsonb_array_elements(d.lines) l WHERE d.business_id=b AND d.source_id=src AND d.kind='purchase_return' AND d.status='confirmed' AND l->>'variantId'=v.id::text;
 IF qty>already THEN RAISE EXCEPTION 'Cannot return unreceived goods';END IF;END IF;
 END LOOP;
 total:=subtotal+taxsum;
 IF k IN ('sale_return','purchase_return') AND st='confirmed' THEN SELECT coalesce(sum(total),0) INTO already FROM public.commerce_documents WHERE business_id=b AND source_id=src AND kind=k AND status='confirmed';IF total+already>original.total THEN RAISE EXCEPTION 'Return exceeds original value';END IF;END IF;
 IF jsonb_typeof(coalesce(_request->'payments','[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'Invalid payments';END IF;
 FOR pay IN SELECT value FROM jsonb_array_elements(coalesce(_request->'payments','[]'::jsonb)) LOOP payments:=payments+(pay->>'amount')::numeric;END LOOP;
 IF k='sale' AND st='confirmed' AND party IS NULL AND payments<>total THEN RAISE EXCEPTION 'Walk-in sale must be paid in full';END IF;
 IF st='draft' AND payments<>0 OR k IN ('purchase_order','goods_receipt') AND payments<>0 THEN RAISE EXCEPTION 'No payments on this document';END IF;
 INSERT INTO public.commerce_documents(id,business_id,branch_id,period_id,kind,source_id,party_id,status,document_date,reference,lines,subtotal,tax,total,actor_id,request) VALUES(i,b,br,per,k,src,party,st,dt,btrim(_request->>'reference'),lines,subtotal,taxsum,total,auth.uid(),_request);
 IF st='confirmed' THEN
 IF k IN ('sale','goods_receipt','sale_return','purchase_return') THEN sign:=CASE WHEN k IN ('sale','purchase_return') THEN -1 ELSE 1 END;INSERT INTO public.commerce_stock_movements(business_id,branch_id,variant_id,document_id,quantity,kind,reference,reason,actor_id) SELECT b,br,(l->>'variantId')::uuid,i,sign*(l->>'quantity')::numeric,k,btrim(_request->>'reference'),k||' '||i::text,auth.uid() FROM jsonb_array_elements(lines) l;END IF;
 IF k IN ('sale','purchase','sale_return','purchase_return') THEN
 control:=CASE WHEN k IN ('sale','sale_return') THEN 'receivable' ELSE 'payable' END;account:=CASE WHEN k IN ('sale','sale_return') THEN 'sales' ELSE 'purchases' END;
 IF k IN ('sale','purchase_return') THEN PERFORM public.commerce_journal(b,br,per,i,'document',dt,control,total,0);PERFORM public.commerce_journal(b,br,per,i,'document',dt,account,0,subtotal);PERFORM public.commerce_journal(b,br,per,i,'document',dt,CASE WHEN k='sale' THEN 'vat_output' ELSE 'vat_input' END,0,taxsum);
 ELSE PERFORM public.commerce_journal(b,br,per,i,'document',dt,control,0,total);PERFORM public.commerce_journal(b,br,per,i,'document',dt,account,subtotal,0);PERFORM public.commerce_journal(b,br,per,i,'document',dt,CASE WHEN k='purchase' THEN 'vat_input' ELSE 'vat_output' END,taxsum,0);END IF;
 END IF;
 FOR pay IN SELECT value FROM jsonb_array_elements(coalesce(_request->'payments','[]'::jsonb)) LOOP PERFORM public.post_commerce_payment(pay||jsonb_build_object('businessId',b,'documentId',i,'periodId',per,'date',dt));END LOOP;
 END IF;
 RETURN i;
END $$;
REVOKE ALL ON FUNCTION public.post_commerce_document(jsonb) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.post_commerce_document(jsonb) TO authenticated;