-- 0115: approval-gated, immutable stock-event delivery to Auraluxe.
-- No historical stock is replayed and no stock is changed by this migration.
-- Stock events start only after SKU/variant mappings and physical baselines are approved.

CREATE TABLE public.auraluxe_sync_control (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE RESTRICT,
  catalogue_enabled boolean NOT NULL DEFAULT false,
  stock_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.auraluxe_sync_control(business_id,catalogue_enabled,stock_enabled)
VALUES('c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid,false,false)
ON CONFLICT(business_id) DO NOTHING;
ALTER TABLE public.auraluxe_sync_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auraluxe_sync_control FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.auraluxe_sync_control TO service_role;

-- The existing catalogue outbox remains dormant until mapping review is approved.
CREATE OR REPLACE FUNCTION public.claim_auraluxe_catalogue_outbox(_business_id uuid,_lease uuid,_limit integer DEFAULT 50)
RETURNS SETOF public.auraluxe_catalogue_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' OR _business_id<>'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid
     OR _lease IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Service authorization and valid lease required';
  END IF;
  IF NOT coalesce((SELECT catalogue_enabled FROM public.auraluxe_sync_control WHERE business_id=_business_id),false) THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.auraluxe_catalogue_outbox
     WHERE business_id=_business_id
       AND ((status='pending' AND available_at<=now()) OR (status='processing' AND locked_until<now()))
       AND NOT EXISTS (
         SELECT 1 FROM public.auraluxe_catalogue_outbox earlier
          WHERE earlier.business_id=public.auraluxe_catalogue_outbox.business_id
            AND earlier.sku=public.auraluxe_catalogue_outbox.sku
            AND earlier.id<public.auraluxe_catalogue_outbox.id
            AND earlier.status<>'delivered'
       )
     ORDER BY id FOR UPDATE SKIP LOCKED LIMIT _limit
  )
  UPDATE public.auraluxe_catalogue_outbox o
     SET status='processing',lease_token=_lease,locked_until=now()+interval '2 minutes',attempts=attempts+1
    FROM picked WHERE o.id=picked.id RETURNING o.*;
END $$;

CREATE TABLE public.auraluxe_stock_sync_versions (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  sku text NOT NULL CHECK(length(btrim(sku)) BETWEEN 1 AND 80),
  last_version bigint NOT NULL DEFAULT 0 CHECK(last_version>=0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(business_id,sku)
);
ALTER TABLE public.auraluxe_stock_sync_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auraluxe_stock_sync_versions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.auraluxe_stock_sync_versions TO service_role;

CREATE TABLE public.auraluxe_stock_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  sku text NOT NULL CHECK(length(btrim(sku)) BETWEEN 1 AND 80),
  sku_version bigint NOT NULL CHECK(sku_version>=1),
  source_table text NOT NULL CHECK(source_table IN ('stock_movements','commerce_stock_movements','website_inventory_movements','website_inventory_return_movements')),
  source_id uuid NOT NULL,
  bizsathi_product_id uuid NOT NULL,
  bizsathi_variant_id uuid NOT NULL,
  auraluxe_product_id uuid NOT NULL,
  auraluxe_variant_id uuid NOT NULL,
  delta numeric(18,3) NOT NULL CHECK(delta<>0),
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','delivered','dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  locked_until timestamptz,
  delivered_at timestamptz,
  last_error text CHECK(last_error IS NULL OR length(last_error)<=1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id,source_table,source_id),
  UNIQUE(business_id,sku,sku_version),
  FOREIGN KEY(business_id,branch_id) REFERENCES public.branches(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(business_id,bizsathi_product_id) REFERENCES public.products(business_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(business_id,bizsathi_variant_id) REFERENCES public.product_variants(business_id,id) ON DELETE RESTRICT
);
CREATE INDEX auraluxe_stock_outbox_ready
  ON public.auraluxe_stock_outbox(business_id,available_at,id)
  WHERE status IN ('pending','processing');
ALTER TABLE public.auraluxe_stock_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auraluxe_stock_outbox FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.auraluxe_stock_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_auraluxe_stock_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  row_data jsonb:=to_jsonb(NEW);
  source_business uuid;
  source_branch uuid;
  source_id uuid;
  source_variant uuid;
  source_sku text;
  remote_product uuid;
  remote_variant uuid;
  version_no bigint;
  delta_qty numeric;
  occurred timestamptz;
  enabled boolean;
BEGIN
  IF current_setting('app.stock_sync_origin',true)='auraluxe' THEN RETURN NEW; END IF;
  source_business:=(row_data->>'business_id')::uuid;
  IF source_business<>'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid THEN RETURN NEW; END IF;

  SELECT stock_enabled INTO enabled FROM public.auraluxe_sync_control WHERE business_id=source_business;
  IF NOT coalesce(enabled,false) THEN RETURN NEW; END IF;

  source_branch:=(row_data->>'branch_id')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.website_inventory_integrations i
     WHERE i.business_id=source_business AND i.branch_id=source_branch AND i.enabled
  ) THEN RETURN NEW; END IF;

  source_id:=(row_data->>'id')::uuid;
  source_variant:=(row_data->>'variant_id')::uuid;
  delta_qty:=(row_data->>'quantity')::numeric;
  occurred:=coalesce((row_data->>'created_at')::timestamptz,now());

  IF EXISTS (
    SELECT 1 FROM public.auraluxe_stock_outbox
     WHERE business_id=source_business AND source_table=TG_TABLE_NAME AND source_id=source_id
  ) THEN RETURN NEW; END IF;

  SELECT v.sku,v.auraluxe_variant_id,p.auraluxe_product_id
    INTO source_sku,remote_variant,remote_product
    FROM public.product_variants v
    JOIN public.products p ON p.business_id=v.business_id AND p.id=v.product_id
   WHERE v.business_id=source_business AND v.id=source_variant;

  IF NOT FOUND OR remote_variant IS NULL OR remote_product IS NULL OR coalesce(source_sku,'')='' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.auraluxe_stock_sync_versions(business_id,sku,last_version)
  VALUES(source_business,source_sku,1)
  ON CONFLICT(business_id,sku) DO UPDATE
    SET last_version=public.auraluxe_stock_sync_versions.last_version+1,updated_at=now()
  RETURNING last_version INTO version_no;

  INSERT INTO public.auraluxe_stock_outbox(
    business_id,branch_id,sku,sku_version,source_table,source_id,
    bizsathi_product_id,bizsathi_variant_id,auraluxe_product_id,auraluxe_variant_id,
    delta,occurred_at,payload,status,last_error
  ) VALUES (
    source_business,source_branch,source_sku,version_no,TG_TABLE_NAME,source_id,
    (SELECT product_id FROM public.product_variants WHERE business_id=source_business AND id=source_variant),
    source_variant,remote_product,remote_variant,delta_qty,occurred,
    jsonb_build_object(
      'eventId',gen_random_uuid(),'sourceTable',TG_TABLE_NAME,'sourceId',source_id,
      'businessId',source_business,'branchId',source_branch,'sku',source_sku,
      'skuVersion',version_no,'delta',delta_qty,'bizsathiProductId',
      (SELECT product_id FROM public.product_variants WHERE business_id=source_business AND id=source_variant),
      'bizsathiVariantId',source_variant,'auraluxeProductId',remote_product,
      'auraluxeVariantId',remote_variant,'occurredAt',occurred
    ),
    CASE WHEN delta_qty=trunc(delta_qty) THEN 'pending' ELSE 'dead' END,
    CASE WHEN delta_qty=trunc(delta_qty) THEN NULL ELSE 'Fractional quantity cannot be represented by Auraluxe whole-unit stock' END
  );
  -- Keep the persisted event UUID and payload UUID identical.
  UPDATE public.auraluxe_stock_outbox
     SET payload=jsonb_set(payload,'{eventId}',to_jsonb(event_id))
   WHERE business_id=source_business AND source_table=TG_TABLE_NAME AND source_id=source_id;
  RETURN NEW;
END $$;

CREATE TRIGGER auraluxe_stock_outbox_stock_movements
  AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.enqueue_auraluxe_stock_event();
CREATE TRIGGER auraluxe_stock_outbox_commerce_movements
  AFTER INSERT ON public.commerce_stock_movements FOR EACH ROW EXECUTE FUNCTION public.enqueue_auraluxe_stock_event();
CREATE TRIGGER auraluxe_stock_outbox_website_movements
  AFTER INSERT ON public.website_inventory_movements FOR EACH ROW EXECUTE FUNCTION public.enqueue_auraluxe_stock_event();
CREATE TRIGGER auraluxe_stock_outbox_website_returns
  AFTER INSERT ON public.website_inventory_return_movements FOR EACH ROW EXECUTE FUNCTION public.enqueue_auraluxe_stock_event();

CREATE OR REPLACE FUNCTION public.claim_auraluxe_stock_outbox(_business_id uuid,_lease uuid,_limit integer DEFAULT 25)
RETURNS SETOF public.auraluxe_stock_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' OR _business_id<>'c0f0ed15-97e4-4859-ac8f-a2d4e81f5b01'::uuid
     OR _lease IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Service authorization and valid lease required';
  END IF;
  IF NOT coalesce((SELECT stock_enabled FROM public.auraluxe_sync_control WHERE business_id=_business_id),false)
     OR NOT EXISTS(SELECT 1 FROM public.website_inventory_integrations WHERE business_id=_business_id AND enabled) THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.auraluxe_stock_outbox o
     WHERE o.business_id=_business_id
       AND ((o.status='pending' AND o.available_at<=now()) OR (o.status='processing' AND o.locked_until<now()))
       AND NOT EXISTS (
         SELECT 1 FROM public.auraluxe_stock_outbox earlier
          WHERE earlier.business_id=o.business_id AND earlier.sku=o.sku
            AND earlier.sku_version<o.sku_version AND earlier.status<>'delivered'
       )
     ORDER BY id FOR UPDATE SKIP LOCKED LIMIT _limit
  )
  UPDATE public.auraluxe_stock_outbox o
     SET status='processing',lease_token=_lease,locked_until=now()+interval '2 minutes',attempts=attempts+1
    FROM picked WHERE o.id=picked.id RETURNING o.*;
END $$;

CREATE OR REPLACE FUNCTION public.ack_auraluxe_stock_outbox(_id bigint,_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service authorization required'; END IF;
  UPDATE public.auraluxe_stock_outbox SET status='delivered',delivered_at=now(),
    lease_token=NULL,locked_until=NULL,last_error=NULL
   WHERE id=_id AND status='processing' AND lease_token=_lease;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.fail_auraluxe_stock_outbox(_id bigint,_lease uuid,_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service authorization required'; END IF;
  UPDATE public.auraluxe_stock_outbox
     SET status=CASE WHEN attempts>=12 THEN 'dead' ELSE 'pending' END,
         available_at=now()+make_interval(secs=>least(3600,power(2,least(attempts,10))::integer*5)),
         lease_token=NULL,locked_until=NULL,last_error=left(coalesce(_error,'stock event delivery failed'),1000)
   WHERE id=_id AND status='processing' AND lease_token=_lease;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.enqueue_auraluxe_stock_event() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_auraluxe_stock_outbox(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ack_auraluxe_stock_outbox(bigint,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fail_auraluxe_stock_outbox(bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auraluxe_stock_outbox(uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ack_auraluxe_stock_outbox(bigint,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_auraluxe_stock_outbox(bigint,uuid,text) TO service_role;

-- Website-originated manual stock adjustments already changed Auraluxe first.
-- Block that legacy absolute-delta workflow after BizSathi becomes the authority,
-- and mark its historical writes so they cannot echo back into Auraluxe.
DO $patch_website_ack$
DECLARE body text; changed text;
BEGIN
  SELECT pg_get_functiondef('public.record_website_stock_ack(uuid,uuid,uuid,uuid,text,integer)'::regprocedure) INTO body;
  changed:=replace(body,
    E'BEGIN\n IF auth.uid()',
    E'BEGIN\n IF coalesce((SELECT enabled FROM public.website_inventory_integrations WHERE business_id=_business_id),false) THEN RAISE EXCEPTION ''BizSathi is the stock authority; post stock operations in BizSathi''; END IF;\n PERFORM set_config(''app.stock_sync_origin'',''auraluxe'',true);\n IF auth.uid()');
  IF changed=body THEN RAISE EXCEPTION 'Could not install website stock acknowledgement authority guard'; END IF;
  EXECUTE changed;
END $patch_website_ack$;

COMMENT ON TABLE public.auraluxe_stock_outbox IS
  'Immutable source movement events for Auraluxe-mapped SKUs. Disabled until SKU mapping and physical stock baselines are approved.';
COMMENT ON TABLE public.auraluxe_sync_control IS
  'Fail-closed controls for Auraluxe catalogue and stock sync. Both flags default false.';
