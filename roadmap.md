# Security review workspace
- [x] Audit the uploaded BizSathi business-suite brief against current pages, live schema, grants, and tests.
- [ ] Implement the business suite incrementally — waiting for approval of the audit and phased plan; no structural changes authorized yet.
- [x] Add administrator-only security review history and append-only decisions.
- [x] Add sign-in and optional avatar profile data.
- [x] Add AI finding impact and prioritized remediation summaries.
- [x] Verify unit permission rules, database policies, signed-out access, and a real AI call.
- [ ] Verify signed-in finding/decision/profile saves and AI read-back — one auth user now exists, but no business or administrator membership exists.
- [ ] Run live two-business mutation tests for review events — blocked by no privileged transactional test connection.