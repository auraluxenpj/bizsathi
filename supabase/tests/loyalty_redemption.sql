-- Scratch-database test of the redemption rules (migrations 0018 + 0032 + 0034). Run the harness file first, then 0034, then this file.
-- Direct inserts into the stubbed commerce_documents fire the real posting trigger. The final exception rolls everything back.
SET test.uid='00000000-0000-0000-0000-0000000000aa';
INSERT INTO profiles VALUES('00000000-0000-0000-0000-0000000000aa'); 
DO $t$
DECLARE b uuid:=gen_random_uuid(); br uuid:=gen_random_uuid(); u uuid:='00000000-0000-0000-0000-0000000000aa';
 s1 uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid(); r1 uuid:=gen_random_uuid(); r2 uuid:=gen_random_uuid(); m1 uuid; m2 uuid; m3 uuid;
 msg text; ok boolean;
BEGIN
 INSERT INTO businesses VALUES(b); INSERT INTO branches VALUES(br,b); INSERT INTO business_settings VALUES(b,'NPR');
 -- helper to make a sale document: total, line discount (manual+loyalty), loyalty label, redeem points, mobile, status
 CREATE TEMP TABLE IF NOT EXISTS h(x int);
 -- 1. plain sale earns ten points per NPR 100
 INSERT INTO commerce_documents VALUES(s1,b,br,'sale',NULL,'confirmed',1000,'[{"discount":0}]','{"mobile":"9841234567","lines":[{"discount":0}]}',u);
 SELECT id INTO m1 FROM customer_memberships WHERE business_id=b AND mobile='9841234567';
 ASSERT public.loyalty_balance(b,m1)=100,'earned 100';
 -- 2. redeem 50 points = NPR 0.50 on a 500 sale (discount 0.50, total 499.50)
 INSERT INTO commerce_documents VALUES(s2,b,br,'sale',NULL,'confirmed',499.50,'[{"discount":0.50}]','{"mobile":"9841234567","redeemPoints":50,"lines":[{"discount":0.5,"loyaltyDiscount":0.5}]}',u);
 ASSERT (SELECT points FROM loyalty_redemptions WHERE sale_id=s2 AND kind='spend')=-50,'spent 50';
 ASSERT (SELECT discount FROM loyalty_redemptions WHERE sale_id=s2)=0.50,'worth NPR 0.50';
 ASSERT (SELECT points FROM loyalty_point_events WHERE document_id=s2)=40,'earns on discounted total 499.50 = 40';
 ASSERT public.loyalty_balance(b,m1)=90,'balance 100-50+40';
 -- 3. cannot spend more than the balance, and the failed sale leaves nothing behind
 ok:=false; BEGIN INSERT INTO commerce_documents VALUES(gen_random_uuid(),b,br,'sale',NULL,'confirmed',900,'[{"discount":0.91}]','{"mobile":"9841234567","redeemPoints":91,"lines":[{"discount":0.91,"loyaltyDiscount":0.91}]}',u); EXCEPTION WHEN raise_exception THEN ok:=true; GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT; END;
 ASSERT ok AND msg LIKE 'Loyalty points balance is lower%','overspend blocked: '||coalesce(msg,'none');
 ASSERT public.loyalty_balance(b,m1)=90,'balance unchanged after rejection';
 -- 4. label must match points, and not exceed the line discount
 ok:=false; BEGIN INSERT INTO commerce_documents VALUES(gen_random_uuid(),b,br,'sale',NULL,'confirmed',900,'[{"discount":0.10}]','{"mobile":"9841234567","redeemPoints":10,"lines":[{"discount":0.1,"loyaltyDiscount":0.2}]}',u); EXCEPTION WHEN raise_exception THEN ok:=true; END; ASSERT ok,'label/points mismatch';
 ok:=false; BEGIN INSERT INTO commerce_documents VALUES(gen_random_uuid(),b,br,'sale',NULL,'confirmed',900,'[{"discount":0}]','{"mobile":"9841234567","redeemPoints":10,"lines":[{"discount":0,"loyaltyDiscount":0.1}]}',u); EXCEPTION WHEN raise_exception THEN ok:=true; GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT; END; ASSERT ok AND msg LIKE '%exceeds the line discount%','discount not actually applied: '||coalesce(msg,'none');
 ok:=false; BEGIN INSERT INTO commerce_documents VALUES(gen_random_uuid(),b,br,'sale',NULL,'confirmed',900,'[{"discount":0.5}]','{"mobile":"9841234567","lines":[{"discount":0.5,"loyaltyDiscount":0.5}]}',u); EXCEPTION WHEN raise_exception THEN ok:=true; END; ASSERT ok,'label without points';
 ok:=false; BEGIN INSERT INTO commerce_documents VALUES(gen_random_uuid(),b,br,'sale',NULL,'confirmed',900,'[{"discount":0.5}]','{"mobile":"9841234567","redeemPoints":50,"lines":[{"discount":0.5}]}',u); EXCEPTION WHEN raise_exception THEN ok:=true; END; ASSERT ok,'points without label';
 ok:=false; BEGIN INSERT INTO commerce_documents VALUES(gen_random_uuid(),b,br,'sale',NULL,'confirmed',900,'[{"discount":0.5}]','{"mobile":"9841234567","redeemPoints":"5x","lines":[{"discount":0.5,"loyaltyDiscount":0.5}]}',u); EXCEPTION WHEN raise_exception THEN ok:=true; END; ASSERT ok,'garbage points';
 -- 5. a sale cannot fund its own discount (new customer, no prior points)
 ok:=false; BEGIN INSERT INTO commerce_documents VALUES(gen_random_uuid(),b,br,'sale',NULL,'confirmed',4999,'[{"discount":1}]','{"mobile":"9851111111","redeemPoints":100,"lines":[{"discount":1,"loyaltyDiscount":1}]}',u); EXCEPTION WHEN raise_exception THEN ok:=true; END; ASSERT ok,'own earnings cannot fund redemption';
 ASSERT NOT EXISTS(SELECT 1 FROM loyalty_redemptions WHERE membership_id IN (SELECT id FROM customer_memberships WHERE mobile='9851111111')),'no stray spend';
 -- 6. drafts never spend
 INSERT INTO commerce_documents VALUES(gen_random_uuid(),b,br,'sale',NULL,'draft',499.5,'[{"discount":0.5}]','{"mobile":"9841234567","redeemPoints":50,"lines":[{"discount":0.5,"loyaltyDiscount":0.5}]}',u);
 ASSERT public.loyalty_balance(b,m1)=90,'draft spends nothing';
 -- 7. whole-sale coverage refused
 ok:=false; BEGIN INSERT INTO commerce_documents VALUES(gen_random_uuid(),b,br,'sale',NULL,'confirmed',0,'[{"discount":0.5}]','{"mobile":"9841234567","redeemPoints":50,"lines":[{"discount":0.5,"loyaltyDiscount":0.5}]}',u); EXCEPTION WHEN raise_exception THEN ok:=true; END; ASSERT ok,'zero-total refused';
 -- 8. a second spend row for the same sale is impossible
 ok:=false; BEGIN INSERT INTO loyalty_redemptions(business_id,branch_id,membership_id,sale_id,document_id,kind,points,discount,actor_id) VALUES(b,br,m1,s2,s2,'spend',-1,0.01,u); EXCEPTION WHEN unique_violation THEN ok:=true; END; ASSERT ok,'one spend per sale';
 -- 9. half return restores half the points; earned points reverse as before
 INSERT INTO commerce_documents VALUES(r1,b,br,'sale_return',s2,'confirmed',249.75,'[{}]','{}',u);
 ASSERT (SELECT points FROM loyalty_redemptions WHERE document_id=r1)=25,'half back';
 ASSERT public.loyalty_balance(b,m1)=95,'90+25-20';
 -- 10. final return restores the rest, never more than spent
 INSERT INTO commerce_documents VALUES(r2,b,br,'sale_return',s2,'confirmed',249.75,'[{}]','{}',u);
 ASSERT (SELECT points FROM loyalty_redemptions WHERE document_id=r2)=25,'rest back';
 ASSERT (SELECT sum(points) FROM loyalty_redemptions WHERE sale_id=s2)=0,'all spent points returned';
 ok:=false; BEGIN INSERT INTO loyalty_redemptions(business_id,branch_id,membership_id,sale_id,document_id,kind,points,discount,actor_id) VALUES(b,br,m1,s2,gen_random_uuid(),'restore',1,0.01,u); EXCEPTION WHEN foreign_key_violation OR raise_exception THEN ok:=true; END; ASSERT ok,'cannot restore more than spent';
 ASSERT public.loyalty_balance(b,m1)=100,'back to the original 100 after full return of the redeemed sale';
 -- 11. return of an earlier sale after points were spent elsewhere leaves a negative balance that blocks spending
 INSERT INTO commerce_documents VALUES(gen_random_uuid(),b,br,'sale',NULL,'confirmed',10000,'[{"discount":0}]','{"mobile":"9861111111","lines":[{"discount":0}]}',u) RETURNING id INTO s1;
 SELECT id INTO m3 FROM customer_memberships WHERE business_id=b AND mobile='9861111111';
 ASSERT public.loyalty_balance(b,m3)=1000,'1000 earned';
 INSERT INTO commerce_documents VALUES(gen_random_uuid(),b,br,'sale',NULL,'confirmed',9990,'[{"discount":10}]','{"mobile":"9861111111","redeemPoints":1000,"lines":[{"discount":10,"loyaltyDiscount":10}]}',u);
 ASSERT public.loyalty_balance(b,m3)=990,'1000-1000+990';
 INSERT INTO commerce_documents VALUES(gen_random_uuid(),b,br,'sale_return',s1,'confirmed',10000,'[{}]','{}',u);
 ASSERT public.loyalty_balance(b,m3)=-10,'earned points reversed, negative balance retained';
 ok:=false; BEGIN INSERT INTO commerce_documents VALUES(gen_random_uuid(),b,br,'sale',NULL,'confirmed',900,'[{"discount":0.01}]','{"mobile":"9861111111","redeemPoints":1,"lines":[{"discount":0.01,"loyaltyDiscount":0.01}]}',u); EXCEPTION WHEN raise_exception THEN ok:=true; END; ASSERT ok,'negative balance blocks redemption';
 -- 12. immutability
 ok:=false; BEGIN UPDATE loyalty_redemptions SET points=-1; EXCEPTION WHEN raise_exception THEN ok:=true; END; ASSERT ok,'no edits';
 ok:=false; BEGIN DELETE FROM loyalty_redemptions; EXCEPTION WHEN raise_exception THEN ok:=true; END; ASSERT ok,'no deletes';
 -- 13. customer summary: balance includes redemptions, purchase count counts sales only
 ASSERT (SELECT points FROM read_customer_loyalty(b) WHERE mobile='9841234567')='100','summary balance';
 ASSERT (SELECT purchase_count FROM read_customer_loyalty(b) WHERE mobile='9841234567')='2','summary purchases';
 ASSERT (SELECT points FROM read_customer_loyalty(b) WHERE mobile='9861111111')='-10','summary shows negative';
 ASSERT public.loyalty_available_points(b,'+977 984-123-4567')=100,'lookup by mobile';
 ASSERT public.loyalty_available_points(b,'9871234567')=0,'unknown mobile is zero';
 RAISE EXCEPTION 'REDEMPTION TESTS PASSED';
END $t$;
