-- 0036: Customer mobile numbers may be any 10 digits (they no longer have to start with 97 or 98).
-- Only the accepted pattern changes: +977 / 977 prefixes are still removed first, and everything else is as before.
-- Existing memberships all satisfy the wider rule, so no data changes. Safe to re-run.
CREATE OR REPLACE FUNCTION public.normalize_member_mobile(_mobile text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$ DECLARE n text; BEGIN IF _mobile IS NULL OR length(_mobile)>40 OR _mobile !~ '^[+0-9 ()-]+$' THEN RETURN NULL; END IF; n:=regexp_replace(_mobile,'[ ()-]','','g'); IF n ~ '^\+977' THEN n:=substr(n,5); ELSIF n ~ '^977' AND length(n)=13 THEN n:=substr(n,4); END IF; IF n !~ '^[0-9]{10}$' THEN RETURN NULL; END IF; RETURN n; END $$;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.customer_memberships'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%9[78]%' LOOP
  EXECUTE format('ALTER TABLE public.customer_memberships DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE public.customer_memberships DROP CONSTRAINT IF EXISTS customer_memberships_mobile_check;
ALTER TABLE public.customer_memberships ADD CONSTRAINT customer_memberships_mobile_check CHECK(mobile ~ '^[0-9]{10}$');
