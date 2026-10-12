# BizSathi Nepal — database foundation

## Migrations
1. `0000` — roles, profiles, businesses, business_memberships, branches, financial_periods, business_settings, audit_logs; RLS, helpers, triggers, privileged functions.
2. `0001` — resets table privileges to least privilege (removes platform default grants).

## Running the tests
Run `supabase/tests/tenant_isolation.sql` as a privileged SQL user. It creates synthetic users, runs all checks, then aborts on purpose.
**Pass = error `ALL TESTS PASSED`.** Any other error names the failing test. Nothing is kept.

Covers: atomic business creation, two-business isolation (all 7 tables), cross-tenant writes, tenant move, outsider/self-join, staff self-promotion, owner/admin grant limits, owner removal, closed-period protection, business/audit deletion, anonymous access.

## Recovery
- **Prefer roll-forward**: write a new migration that fixes the issue. Never edit applied migrations.
- **Restore**: use a point-in-time backup from the Cloud panel when data is damaged.
- **Full teardown (empty database only — destroys everything):**
```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.create_business(text,text,text), public.add_business_member(uuid,uuid,text),
  public.update_business_member(uuid,uuid,text,text), public.remove_business_member(uuid,uuid),
  public.transfer_business_ownership(uuid,uuid), public.set_financial_period_status(uuid,text),
  public.archive_business(uuid), public.handle_new_user() CASCADE;
DROP TABLE IF EXISTS public.audit_logs, public.business_settings, public.financial_periods, public.branches,
  public.business_memberships, public.businesses, public.profiles, public.roles CASCADE;
DROP FUNCTION IF EXISTS public.write_audit(uuid,text,text,text,jsonb,jsonb), public.audit_row(),
  public.guard_closed_period(), public.block_mutation(), public.prevent_tenant_change(), public.touch_updated_at(),
  public.shares_business_with(uuid), public.has_business_role(uuid,text), public.is_business_member(uuid),
  public.business_role_rank(uuid,uuid);
```
Audit logs block DELETE/TRUNCATE by trigger; `DROP TABLE` is the only removal path, by design.

## Needs manual review
1. `business_memberships.user_id` uses ON DELETE RESTRICT: deleting a sign-in account that still has memberships fails. Decide on an offboarding flow.
2. `add_business_member` takes a user id; there is no invite-by-email flow yet (avoids exposing emails).
3. Security linter flags 10 signed-in-callable SECURITY DEFINER functions — intended RPCs/helpers, each checks `auth.uid()` and DB role rank. Review on every change.
4. `audit_logs` stores full row snapshots (may include PAN/VAT). Confirm retention policy.
5. Owner can transfer ownership; no second-factor or delay.
6. Service-role code bypasses all RLS — keep it server-side only.
7. Future posted-transaction tables must reference `financial_periods` with ON DELETE RESTRICT and block edits when the period is closed.
