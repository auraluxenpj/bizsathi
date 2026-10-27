CREATE FUNCTION public.guard_combined_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF public.commerce_stock_balance(NEW.business_id,NEW.branch_id,NEW.variant_id)+NEW.quantity<0 THEN RAISE EXCEPTION 'Insufficient stock including confirmed invoices';END IF;IF NEW.kind='opening' AND EXISTS(SELECT 1 FROM public.commerce_stock_movements WHERE business_id=NEW.business_id AND branch_id=NEW.branch_id AND variant_id=NEW.variant_id) THEN RAISE EXCEPTION 'Opening stock must precede invoice movements';END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION public.guard_combined_stock() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER combined_stock_guard BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.guard_combined_stock();
CREATE FUNCTION public.post_cash_counter_event(_request jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b uuid:=(_request->>'businessId')::uuid;i uuid:=(_request->>'id')::uuid;br uuid:=(_request->>'branchId')::uuid;per uuid:=(_request->>'periodId')::uuid;session uuid:=(_request->>'sessionId')::uuid;k text:=_request->>'kind';amount numeric:=(_request->>'amount')::numeric;dt date:=(_request->>'date')::date;old public.cash_counter_events;expected numeric;delta numeric;
BEGIN
 IF NOT public.has_business_role(b,'staff') OR NOT public.can_access_branch(b,br) THEN RAISE EXCEPTION 'Counter access denied';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(b::text,0));SELECT * INTO old FROM public.cash_counter_events WHERE id=i;
 IF FOUND THEN IF old.business_id=b AND old.actor_id=auth.uid() AND old.request=_request THEN RETURN i;END IF;RAISE EXCEPTION 'Request identifier conflict';END IF;
 PERFORM public.commerce_open_period(b,per,dt);
 IF k NOT IN ('open','in','out','close') OR amount IS NULL OR amount<0 OR amount<>round(amount,2) OR amount::text IN ('NaN','Infinity','-Infinity') OR coalesce(length(btrim(_request->>'reference')),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid counter event';END IF;
 IF k='open' THEN
 IF EXISTS(SELECT 1 FROM public.cash_counter_events o WHERE o.business_id=b AND o.actor_id=auth.uid() AND o.kind='open' AND NOT EXISTS(SELECT 1 FROM public.cash_counter_events c WHERE c.session_id=o.session_id AND c.kind='close')) THEN RAISE EXCEPTION 'Close your existing counter first';END IF;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM public.cash_counter_events WHERE session_id=session AND business_id=b AND branch_id=br AND kind='open' AND actor_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.cash_counter_events WHERE session_id=session AND kind='close') THEN RAISE EXCEPTION 'Your open counter is required';END IF;
 END IF;
 IF k IN ('in','out') AND NOT public.has_business_role(b,'admin') THEN RAISE EXCEPTION 'Cash adjustments require administrator';END IF;
 SELECT coalesce(sum(CASE WHEN kind IN ('open','in') THEN amount WHEN kind='out' THEN -amount ELSE 0 END),0) INTO expected FROM public.cash_counter_events WHERE session_id=session;
 SELECT expected+coalesce(sum(CASE WHEN direction='in' THEN amount ELSE -amount END),0) INTO expected FROM public.commerce_payments WHERE session_id=session AND method='cash';
 IF k='out' AND amount>expected THEN RAISE EXCEPTION 'Cash out exceeds counter cash';END IF;
 delta:=CASE WHEN k='close' THEN amount-expected ELSE NULL END;
 INSERT INTO public.cash_counter_events(id,business_id,branch_id,period_id,session_id,kind,amount,expected,difference,reference,actor_id,event_date,request) VALUES(i,b,br,per,session,k,amount,CASE WHEN k='close' THEN expected ELSE NULL END,delta,btrim(_request->>'reference'),auth.uid(),dt,_request);
 IF k IN ('open','in','out') AND amount>0 THEN PERFORM public.commerce_journal(b,br,per,i,'counter',dt,'cash',CASE WHEN k IN ('open','in') THEN amount ELSE 0 END,CASE WHEN k='out' THEN amount ELSE 0 END);PERFORM public.commerce_journal(b,br,per,i,'counter',dt,'counter_clearing',CASE WHEN k='out' THEN amount ELSE 0 END,CASE WHEN k IN ('open','in') THEN amount ELSE 0 END);END IF;
 RETURN i;
END $$;
REVOKE ALL ON FUNCTION public.post_cash_counter_event(jsonb) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.post_cash_counter_event(jsonb) TO authenticated;
CREATE FUNCTION public.guard_commerce_payment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE d public.commerce_documents;original public.commerce_documents;originalpaid numeric;returns numeric;refunded numeric;expected numeric;BEGIN
 SELECT * INTO d FROM public.commerce_documents WHERE id=NEW.document_id;
 IF d.kind IN ('sale_return','purchase_return') THEN
 SELECT * INTO original FROM public.commerce_documents WHERE id=d.source_id;
 SELECT coalesce(sum(amount),0) INTO originalpaid FROM public.commerce_payments WHERE document_id=original.id;
 SELECT coalesce(sum(total),0) INTO returns FROM public.commerce_documents WHERE source_id=original.id AND kind=d.kind AND status='confirmed';
 SELECT coalesce(sum(p.amount),0) INTO refunded FROM public.commerce_payments p JOIN public.commerce_documents r ON r.id=p.document_id WHERE r.source_id=original.id AND r.kind=d.kind;
 IF refunded+NEW.amount>greatest(0,originalpaid-(original.total-returns)) THEN RAISE EXCEPTION 'Refund exceeds settled return credit';END IF;
 END IF;
 IF NEW.method='cash' AND NEW.direction='out' THEN
 SELECT coalesce(sum(CASE WHEN kind IN ('open','in') THEN amount WHEN kind='out' THEN -amount ELSE 0 END),0) INTO expected FROM public.cash_counter_events WHERE session_id=NEW.session_id;
 SELECT expected+coalesce(sum(CASE WHEN direction='in' THEN amount ELSE -amount END),0) INTO expected FROM public.commerce_payments WHERE session_id=NEW.session_id AND method='cash';
 IF NEW.amount>expected THEN RAISE EXCEPTION 'Insufficient counter cash';END IF;
 END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION public.guard_commerce_payment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER commerce_payment_guard BEFORE INSERT ON public.commerce_payments FOR EACH ROW EXECUTE FUNCTION public.guard_commerce_payment();
CREATE FUNCTION public.guard_return_settlement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE original public.commerce_documents;paid numeric;returned numeric;BEGIN
 IF NEW.kind IN ('sale_return','purchase_return') AND NEW.status='confirmed' THEN SELECT * INTO original FROM public.commerce_documents WHERE id=NEW.source_id;SELECT coalesce(sum(amount),0) INTO paid FROM public.commerce_payments WHERE document_id=original.id;SELECT coalesce(sum(total),0) INTO returned FROM public.commerce_documents WHERE source_id=original.id AND kind=NEW.kind AND status='confirmed';
 IF paid>original.total-returned AND original.party_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.commerce_payments WHERE document_id=NEW.id) THEN RAISE EXCEPTION 'Walk-in return requires immediate refund';END IF;END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION public.guard_return_settlement() FROM PUBLIC,anon,authenticated;
CREATE CONSTRAINT TRIGGER commerce_return_settlement AFTER INSERT ON public.commerce_documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_return_settlement();