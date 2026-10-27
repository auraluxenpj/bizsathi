<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Tenant data: every tenant table has `business_id`, RLS via `is_business_member`/`has_business_role` (rank from `roles` table); membership writes only through SECURITY DEFINER RPCs. Why: permissions must come from DB records, never client input.
- After any new table, REVOKE platform default grants and grant least privilege explicitly. Why: defaults give authenticated full write access.
- Financial/posted records use ON DELETE RESTRICT, never CASCADE. Why: accounting history must not vanish.
- Security review history uses append-only tenant events with administrator RLS and server-side membership verification; findings, analyses, and decisions remain separate evidence. Why: preserve attribution and prevent AI advice from becoming an approval.
- AI reviews use server-only Lovable Gateway Responses streaming with persisted access pauses and no automatic retries. Why: keep secrets private and avoid repeated billing or denied calls.
- Business onboarding reuses the atomic create_business RPC; invitations store only hashed email-bound tokens and accept through a locked database operation that rechecks inviter authority. Why: prevent duplicate infrastructure and stale invitation privilege grants.
- Branch-scoped data uses can_access_branch plus operation-specific role checks; administrators have manager access and lower roles require explicit branch_memberships. Why: business membership alone must not expose every branch.
