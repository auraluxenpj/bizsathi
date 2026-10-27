CREATE TABLE public.business_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
 email text NOT NULL, role_code text NOT NULL REFERENCES public.roles(code) ON DELETE RESTRICT,
 token_hash text NOT NULL UNIQUE, invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'), accepted_at timestamptz, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT invitation_role CHECK (role_code <> 'owner'),
 CONSTRAINT invitation_email CHECK (char_length(email) <= 254 AND email = lower(btrim(email)) AND position('@' in email)>1),
 CONSTRAINT invitation_hash CHECK (token_hash ~ '^[a-f0-9]{64}$')
);
REVOKE ALL ON public.business_invitations FROM anon, authenticated;
GRANT SELECT (id,business_id,email,role_code,invited_by,expires_at,accepted_at,revoked_at,created_at) ON public.business_invitations TO authenticated;
GRANT ALL ON public.business_invitations TO service_role;
ALTER TABLE public.business_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitations_manager_read ON public.business_invitations FOR SELECT TO authenticated USING (public.has_business_role(business_id,'admin'));
CREATE INDEX invitations_business_date ON public.business_invitations(business_id,created_at DESC);
CREATE TABLE public.branch_memberships (
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
 branch_id uuid NOT NULL, user_id uuid NOT NULL, granted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (business_id,branch_id,user_id),
 FOREIGN KEY (business_id,branch_id) REFERENCES public.branches(business_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (business_id,user_id) REFERENCES public.business_memberships(business_id,user_id) ON DELETE RESTRICT
);
REVOKE ALL ON public.branch_memberships FROM anon, authenticated;
GRANT SELECT ON public.branch_memberships TO authenticated;
GRANT ALL ON public.branch_memberships TO service_role;
ALTER TABLE public.branch_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY branch_memberships_read ON public.branch_memberships FOR SELECT TO authenticated USING (public.has_business_role(business_id,'admin') OR (user_id=auth.uid() AND public.is_business_member(business_id)));
CREATE INDEX branch_memberships_user ON public.branch_memberships(user_id,business_id);
CREATE FUNCTION public.can_access_branch(_business_id uuid,_branch_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_business_member(_business_id) AND EXISTS(SELECT 1 FROM public.branches b WHERE b.id=_branch_id AND b.business_id=_business_id AND b.is_active) AND (public.has_business_role(_business_id,'admin') OR EXISTS(SELECT 1 FROM public.branch_memberships bm WHERE bm.business_id=_business_id AND bm.branch_id=_branch_id AND bm.user_id=auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.can_access_branch(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_access_branch(uuid,uuid) TO authenticated,service_role;
ALTER POLICY branches_select ON public.branches USING (public.has_business_role(business_id,'admin') OR public.can_access_branch(business_id,id));
CREATE FUNCTION public.set_branch_access(_business_id uuid,_branch_id uuid,_user_id uuid,_allowed boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE my_rank smallint; target_rank smallint;
BEGIN
 my_rank:=public.business_role_rank(_business_id,auth.uid());
 SELECT r.rank INTO target_rank FROM public.business_memberships m JOIN public.roles r ON r.code=m.role_code WHERE m.business_id=_business_id AND m.user_id=_user_id AND m.status='active' FOR UPDATE OF m;
 IF my_rank IS NULL OR my_rank<80 OR target_rank IS NULL OR target_rank>=my_rank OR _user_id=auth.uid() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.branches WHERE business_id=_business_id AND id=_branch_id) THEN RAISE EXCEPTION 'Branch unavailable'; END IF;
 IF _allowed THEN INSERT INTO public.branch_memberships(business_id,branch_id,user_id,granted_by) VALUES(_business_id,_branch_id,_user_id,auth.uid()) ON CONFLICT DO NOTHING;
 ELSE DELETE FROM public.branch_memberships WHERE business_id=_business_id AND branch_id=_branch_id AND user_id=_user_id; END IF;
 PERFORM public.write_audit(_business_id,'branch_access','branch_memberships',_user_id::text,NULL,jsonb_build_object('branch_id',_branch_id,'allowed',_allowed));
END $$;
REVOKE ALL ON FUNCTION public.set_branch_access(uuid,uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_branch_access(uuid,uuid,uuid,boolean) TO authenticated,service_role;
CREATE FUNCTION public.create_business_invitation(_business_id uuid,_email text,_role text,_token_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE my_rank smallint; target_rank smallint; iid uuid;
BEGIN
 my_rank:=public.business_role_rank(_business_id,auth.uid()); SELECT rank INTO target_rank FROM public.roles WHERE code=_role;
 IF my_rank IS NULL OR my_rank<80 OR target_rank IS NULL OR target_rank>=my_rank OR _role='owner' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=_business_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Business unavailable'; END IF;
 INSERT INTO public.business_invitations(business_id,email,role_code,token_hash,invited_by) VALUES(_business_id,lower(btrim(_email)),_role,_token_hash,auth.uid()) RETURNING id INTO iid;
 PERFORM public.write_audit(_business_id,'invite','business_invitations',iid::text,NULL,jsonb_build_object('role',_role)); RETURN iid;
END $$;
REVOKE ALL ON FUNCTION public.create_business_invitation(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_business_invitation(uuid,text,text,text) TO authenticated,service_role;
CREATE FUNCTION public.revoke_business_invitation(_business_id uuid,_invitation_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.business_invitations; my_rank smallint; target_rank smallint;
BEGIN
 SELECT * INTO i FROM public.business_invitations WHERE business_id=_business_id AND id=_invitation_id FOR UPDATE;
 my_rank:=public.business_role_rank(_business_id,auth.uid()); SELECT rank INTO target_rank FROM public.roles WHERE code=i.role_code;
 IF my_rank IS NULL OR my_rank<80 OR target_rank IS NULL OR target_rank>=my_rank THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF i.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation already accepted'; END IF;
 UPDATE public.business_invitations SET revoked_at=now() WHERE id=i.id;
 PERFORM public.write_audit(_business_id,'revoke_invite','business_invitations',i.id::text,NULL,NULL);
END $$;
REVOKE ALL ON FUNCTION public.revoke_business_invitation(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_business_invitation(uuid,uuid) TO authenticated,service_role;
CREATE FUNCTION public.accept_business_invitation(_token_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.business_invitations; inviter_rank smallint; target_rank smallint; verified_email text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT lower(email) INTO verified_email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
 SELECT * INTO i FROM public.business_invitations WHERE token_hash=_token_hash FOR UPDATE;
 IF i.id IS NULL OR i.revoked_at IS NOT NULL OR i.accepted_at IS NOT NULL OR i.expires_at<=now() OR verified_email IS NULL OR verified_email<>i.email OR i.invited_by=auth.uid() THEN RAISE EXCEPTION 'Invitation unavailable for this account' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.business_memberships WHERE business_id=i.business_id AND user_id=i.invited_by FOR UPDATE;
 inviter_rank:=public.business_role_rank(i.business_id,i.invited_by); SELECT rank INTO target_rank FROM public.roles WHERE code=i.role_code;
 IF inviter_rank IS NULL OR inviter_rank<80 OR target_rank IS NULL OR target_rank>=inviter_rank OR i.role_code='owner' OR NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=i.business_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Invitation no longer authorized' USING ERRCODE='42501'; END IF;
 INSERT INTO public.business_memberships(business_id,user_id,role_code,invited_by) VALUES(i.business_id,auth.uid(),i.role_code,i.invited_by);
 UPDATE public.business_invitations SET accepted_at=now() WHERE id=i.id;
 PERFORM public.write_audit(i.business_id,'accept_invite','business_invitations',i.id::text,NULL,NULL); RETURN i.business_id;
END $$;
REVOKE ALL ON FUNCTION public.accept_business_invitation(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_business_invitation(text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.remove_business_member(_business_id uuid,_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE my_rank smallint; cur_rank smallint;
BEGIN
 my_rank:=public.business_role_rank(_business_id,auth.uid());
 SELECT r.rank INTO cur_rank FROM public.business_memberships m JOIN public.roles r ON r.code=m.role_code WHERE m.business_id=_business_id AND m.user_id=_user_id FOR UPDATE OF m;
 IF cur_rank IS NULL THEN RAISE EXCEPTION 'Membership not found'; END IF;
 IF cur_rank=100 THEN RAISE EXCEPTION 'Owner cannot be removed; transfer ownership first' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL OR NOT COALESCE((_user_id=auth.uid() OR (my_rank>=80 AND cur_rank<my_rank)),false) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 DELETE FROM public.branch_memberships WHERE business_id=_business_id AND user_id=_user_id;
 DELETE FROM public.business_memberships WHERE business_id=_business_id AND user_id=_user_id;
END $$;