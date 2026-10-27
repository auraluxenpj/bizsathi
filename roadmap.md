# Security review workspace
- [x] Audit the uploaded BizSathi business-suite brief against current pages, live schema, grants, and tests.
- [ ] Phase 1: business onboarding, password recovery, invitations, staff administration, branch authorization, and explicit review permissions — approved; in progress.
- [ ] Phase 2 and later: business dashboard and operational modules — awaiting review after Phase 1.
- [x] Add administrator-only security review history and append-only decisions.
- [x] Add sign-in and optional avatar profile data.
- [x] Add AI finding impact and prioritized remediation summaries.
- [x] Verify unit permission rules, database policies, signed-out access, and a real AI call.
- [ ] Verify signed-in finding/decision/profile saves and AI read-back — one auth user now exists, but no business or administrator membership exists.
- [ ] Run live two-business mutation tests for review events — blocked by no privileged transactional test connection.