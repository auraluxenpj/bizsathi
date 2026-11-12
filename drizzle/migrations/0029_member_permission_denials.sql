CREATE TABLE public.member_permission_denials(
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 permission text NOT NULL CHECK (permission IN ('sales.create','sales.edit','sales.view','purchases.create','purchases.edit','purchases.view','expenses.create','expenses.view','parties.create','parties.edit','parties.view','products.create','products.edit','products.view','products.import','reports.view','staff.view')),
 granted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(business_id,user_id,permission));
REVOKE ALL ON public.member_permission_denials FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.member_permission_denials TO authenticated;
GRANT ALL ON public.member_permission_denials TO service_role;
ALTER TABLE public.member_permission_denials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own or admins read all denials" ON public.member_permission_denials FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_business_role(business_id,'admin'));

CREATE FUNCTION public.has_permission(_business uuid,_perm text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.member_permission_denials WHERE business_id=_business AND user_id=auth.uid() AND permission=_perm) $$;
REVOKE ALL ON FUNCTION public.has_permission(uuid,text) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.has_permission(uuid,text) TO authenticated;

CREATE FUNCTION public.set_member_permissions(_business uuid,_user uuid,_denied text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old jsonb;BEGIN
 IF NOT public.has_business_role(_business,'admin') THEN RAISE EXCEPTION 'Administrator required';END IF;
 IF _user=auth.uid() THEN RAISE EXCEPTION 'You cannot change your own permissions';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.business_memberships WHERE business_id=_business AND user_id=_user) THEN RAISE EXCEPTION 'Member not found';END IF;
 IF public.business_role_rank(_business,_user)>=public.business_role_rank(_business,auth.uid()) THEN RAISE EXCEPTION 'You cannot change permissions for this member';END IF;
 SELECT coalesce(jsonb_agg(permission ORDER BY permission),'[]') INTO old FROM public.member_permission_denials WHERE business_id=_business AND user_id=_user;
 DELETE FROM public.member_permission_denials WHERE business_id=_business AND user_id=_user;
 INSERT INTO public.member_permission_denials(business_id,user_id,permission,granted_by) SELECT _business,_user,p,auth.uid() FROM unnest(coalesce(_denied,'{}')) p GROUP BY p;
 PERFORM public.write_audit(_business,'permissions.update','member_permission_denials',_user::text,jsonb_build_object('denied',old),jsonb_build_object('denied',to_jsonb(coalesce(_denied,'{}'))));
END $$;
REVOKE ALL ON FUNCTION public.set_member_permissions(uuid,uuid,text[]) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.set_member_permissions(uuid,uuid,text[]) TO authenticated;

CREATE FUNCTION public.enforce_member_permission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE area text:=TG_ARGV[0];k text;action text:=CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'edit' END;BEGIN
 IF area='commerce' THEN k:=NEW.kind;
 ELSIF area='payment' THEN SELECT kind INTO k FROM public.commerce_documents WHERE id=NEW.document_id;END IF;
 IF k IS NOT NULL THEN area:=CASE WHEN k IN ('sale','sale_return') THEN 'sales' ELSE 'purchases' END;END IF;
 IF NOT public.has_permission(NEW.business_id,area||'.'||action) THEN RAISE EXCEPTION 'Permission denied: % %',action,area;END IF;
 RETURN NEW;END $$;
REVOKE ALL ON FUNCTION public.enforce_member_permission() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER perm_commerce BEFORE INSERT ON public.commerce_documents FOR EACH ROW EXECUTE FUNCTION public.enforce_member_permission('commerce');
CREATE TRIGGER perm_payment BEFORE INSERT ON public.commerce_payments FOR EACH ROW EXECUTE FUNCTION public.enforce_member_permission('payment');
CREATE TRIGGER perm_quotation BEFORE INSERT OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.enforce_member_permission('sales');
CREATE TRIGGER perm_voucher BEFORE INSERT ON public.accounting_vouchers FOR EACH ROW EXECUTE FUNCTION public.enforce_member_permission('expenses');
CREATE TRIGGER perm_party BEFORE INSERT OR UPDATE ON public.parties FOR EACH ROW EXECUTE FUNCTION public.enforce_member_permission('parties');
CREATE TRIGGER perm_product BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_member_permission('products');
CREATE TRIGGER perm_variant BEFORE INSERT OR UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.enforce_member_permission('products');