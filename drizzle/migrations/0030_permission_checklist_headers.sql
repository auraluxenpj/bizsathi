ALTER TABLE public.member_permission_denials DROP CONSTRAINT member_permission_denials_permission_check;
ALTER TABLE public.member_permission_denials ADD CONSTRAINT member_permission_denials_permission_check CHECK (permission IN ('sales.create','sales.edit','sales.view','purchases.create','purchases.edit','purchases.view','expenses.create','expenses.edit','expenses.view','inventory.create','inventory.edit','inventory.view','stock.create','stock.edit','customers.create','customers.edit','customers.view','suppliers.create','suppliers.edit','suppliers.view','features.import','accounts.create','accounts.view','reports.view','staff.view','staff.edit','settings.edit','other.purchase_price','other.change_date'));
CREATE OR REPLACE FUNCTION public.enforce_member_permission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE area text:=TG_ARGV[0];k text;action text:=CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'edit' END;BEGIN
 IF area='commerce' THEN k:=NEW.kind;
 ELSIF area='payment' THEN SELECT kind INTO k FROM public.commerce_documents WHERE id=NEW.document_id;
 ELSIF area='parties' THEN area:=CASE WHEN NEW.kind='customer' THEN 'customers' ELSE 'suppliers' END;
 ELSIF area IN ('settings','staff') THEN action:='edit';END IF;
 IF k IS NOT NULL THEN area:=CASE WHEN k IN ('sale','sale_return') THEN 'sales' ELSE 'purchases' END;END IF;
 IF NOT public.has_permission(NEW.business_id,area||'.'||action) THEN RAISE EXCEPTION 'Permission denied: % %',action,area;END IF;
 RETURN NEW;END $$;
DROP TRIGGER perm_product ON public.products;DROP TRIGGER perm_variant ON public.product_variants;
CREATE TRIGGER perm_product BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_member_permission('inventory');
CREATE TRIGGER perm_variant BEFORE INSERT OR UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.enforce_member_permission('inventory');
CREATE TRIGGER perm_stock BEFORE INSERT ON public.stock_operations FOR EACH ROW EXECUTE FUNCTION public.enforce_member_permission('stock');
CREATE TRIGGER perm_account BEFORE INSERT ON public.payment_accounts FOR EACH ROW EXECUTE FUNCTION public.enforce_member_permission('accounts');
CREATE TRIGGER perm_settings BEFORE UPDATE ON public.business_settings FOR EACH ROW EXECUTE FUNCTION public.enforce_member_permission('settings');
CREATE TRIGGER perm_staff BEFORE UPDATE ON public.business_memberships FOR EACH ROW EXECUTE FUNCTION public.enforce_member_permission('staff');