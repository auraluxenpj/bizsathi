-- Isolated database only. Final exception deliberately rolls back all fixtures.
-- Pass = error 'WORKSPACE ISOLATION TESTS PASSED'.
DO $tests$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); ba uuid; bb uuid; n uuid; bill uuid; rejected boolean;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) SELECT u,'test+'||u||'@example.invalid',now(),'{}',now(),now() FROM unnest(ARRAY[a,b,s,v]) u;
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 ba:=public.create_business('Workspace A'); PERFORM public.add_business_member(ba,s,'staff'); PERFORM public.add_business_member(ba,v,'viewer');
 PERFORM set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 bb:=public.create_business('Workspace B');

 -- Notes: owner writes, staff writes, viewer reads only, outsider sees nothing.
 PERFORM set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 INSERT INTO public.business_notes(business_id,title,body) VALUES(ba,'Stock order','Call supplier') RETURNING id INTO n;
 ASSERT (SELECT created_by FROM public.business_notes WHERE id=n)=a,'created_by defaults to caller';
 rejected:=false; BEGIN INSERT INTO public.business_notes(business_id,title,created_by) VALUES(ba,'Forged',s); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'Cannot forge created_by';
 rejected:=false; BEGIN INSERT INTO public.business_notes(business_id,title) VALUES(bb,'Other tenant'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'Cannot write into another business';
 rejected:=false; BEGIN INSERT INTO public.business_notes(business_id,title) VALUES(ba,'   '); EXCEPTION WHEN check_violation THEN rejected:=true; END; ASSERT rejected,'Blank title rejected';
 rejected:=false; BEGIN UPDATE public.business_notes SET business_id=bb WHERE id=n; EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'Cannot move a note to another business';
 rejected:=false; BEGIN UPDATE public.business_notes SET created_by=s WHERE id=n; EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'Cannot reassign author';
 UPDATE public.business_notes SET pinned=true WHERE id=n; ASSERT (SELECT pinned FROM public.business_notes WHERE id=n),'Owner can edit';

 PERFORM set_config('request.jwt.claims',json_build_object('sub',s,'role','authenticated')::text,true);
 ASSERT (SELECT count(*) FROM public.business_notes)=1,'Staff can read business notes';
 UPDATE public.business_notes SET body='staff edit' WHERE id=n; ASSERT (SELECT body FROM public.business_notes WHERE id=n)='Call supplier','Staff cannot edit another person''s note';
 INSERT INTO public.business_notes(business_id,title) VALUES(ba,'Staff note');
 DELETE FROM public.business_notes WHERE id=n; ASSERT (SELECT count(*) FROM public.business_notes WHERE id=n)=1,'Staff cannot delete another person''s note';

 PERFORM set_config('request.jwt.claims',json_build_object('sub',v,'role','authenticated')::text,true);
 ASSERT (SELECT count(*) FROM public.business_notes)=2,'Viewer can read notes';
 rejected:=false; BEGIN INSERT INTO public.business_notes(business_id,title) VALUES(ba,'Viewer note'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'Viewer cannot write';

 PERFORM set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 ASSERT (SELECT count(*) FROM public.business_notes)=0,'Outsider sees no notes';

 -- Bills: path must sit inside the business folder; storage objects follow the same membership rules.
 PERFORM set_config('request.jwt.claims',json_build_object('sub',s,'role','authenticated')::text,true);
 INSERT INTO public.business_bills(business_id,storage_path,caption,mime_type,size_bytes) VALUES(ba,ba::text||'/'||gen_random_uuid()||'.jpg','Supplier bill','image/jpeg',2048) RETURNING id INTO bill;
 rejected:=false; BEGIN INSERT INTO public.business_bills(business_id,storage_path,mime_type,size_bytes) VALUES(ba,bb::text||'/x.jpg','image/jpeg',1); EXCEPTION WHEN check_violation THEN rejected:=true; END; ASSERT rejected,'Path must be inside own business folder';
 rejected:=false; BEGIN INSERT INTO public.business_bills(business_id,storage_path,mime_type,size_bytes) VALUES(ba,ba::text||'/../'||bb::text||'/x.jpg','image/jpeg',1); EXCEPTION WHEN check_violation THEN rejected:=true; END; ASSERT rejected,'Path traversal rejected';
 rejected:=false; BEGIN INSERT INTO public.business_bills(business_id,storage_path,mime_type,size_bytes) VALUES(ba,ba::text||'/x.exe','application/x-msdownload',1); EXCEPTION WHEN check_violation THEN rejected:=true; END; ASSERT rejected,'Only images and PDFs';
 rejected:=false; BEGIN INSERT INTO public.business_bills(business_id,storage_path,mime_type,size_bytes) VALUES(ba,ba::text||'/big.jpg','image/jpeg',10485761); EXCEPTION WHEN check_violation THEN rejected:=true; END; ASSERT rejected,'10 MB limit';
 UPDATE public.business_bills SET caption='Edited' WHERE id=bill; ASSERT (SELECT caption FROM public.business_bills WHERE id=bill)='Edited','Uploader can edit caption';
 rejected:=false; BEGIN UPDATE public.business_bills SET storage_path=bb::text||'/x.jpg' WHERE id=bill; EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'Cannot repoint a bill';

 INSERT INTO storage.objects(bucket_id,name) VALUES('bills',ba::text||'/ok.jpg');
 rejected:=false; BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('bills',bb::text||'/steal.jpg'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'Cannot upload into another business folder';
 rejected:=false; BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('bills','not-a-uuid/x.jpg'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'Malformed folder rejected';
 ASSERT (SELECT count(*) FROM storage.objects WHERE bucket_id='bills')=1,'Staff sees own business files';

 PERFORM set_config('request.jwt.claims',json_build_object('sub',v,'role','authenticated')::text,true);
 ASSERT (SELECT count(*) FROM public.business_bills)=1,'Viewer can see bills';
 ASSERT (SELECT count(*) FROM storage.objects WHERE bucket_id='bills')=1,'Viewer can read files';
 rejected:=false; BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('bills',ba::text||'/v.jpg'); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END; ASSERT rejected,'Viewer cannot upload';
 DELETE FROM public.business_bills WHERE id=bill; ASSERT (SELECT count(*) FROM public.business_bills)=1,'Viewer cannot delete';

 PERFORM set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 ASSERT (SELECT count(*) FROM public.business_bills)=0,'Outsider sees no bills';
 ASSERT (SELECT count(*) FROM storage.objects WHERE bucket_id='bills')=0,'Outsider sees no files';

 PERFORM set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 DELETE FROM public.business_notes WHERE id=n; ASSERT (SELECT count(*) FROM public.business_notes WHERE id=n)=0,'Owner can delete any note';
 DELETE FROM public.business_bills WHERE id=bill; ASSERT (SELECT count(*) FROM public.business_bills)=0,'Owner can delete a bill';
 -- Item categories: administrators can rename across products; staff cannot (existing product policies).
 PERFORM set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 INSERT INTO public.products(business_id,name,category) VALUES(ba,'Saree','Clothes'),(ba,'Dupatta','Clothes'),(ba,'Bag','Accessories');
 PERFORM set_config('request.jwt.claims',json_build_object('sub',s,'role','authenticated')::text,true);
 UPDATE public.products SET category='Hacked' WHERE business_id=ba AND category='Clothes'; ASSERT (SELECT count(*) FROM public.products WHERE category='Clothes')=2,'Staff cannot rename categories';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 UPDATE public.products SET category='Apparel' WHERE business_id=ba AND category='Clothes'; ASSERT (SELECT count(*) FROM public.products WHERE category='Apparel')=2,'Admin renames a category';
 UPDATE public.products SET category='Apparel' WHERE business_id=ba AND category='Accessories'; ASSERT (SELECT count(DISTINCT category) FROM public.products WHERE business_id=ba)=1,'Merge into an existing name';
 RESET ROLE; RAISE EXCEPTION 'WORKSPACE ISOLATION TESTS PASSED';
END $tests$;
