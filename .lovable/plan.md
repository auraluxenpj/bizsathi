# Auraluxe-only BizSathi

## Audit findings
- The connected workspace already contains one business: **Auraluxe**, with legal name **Auraluxe Private limited**, one branch and one active member.
- Registration still allows another business to be created, and several pages still display business selectors.
- Existing permissions, stock, sales, reports and local POS drafts are scoped to business and branch identifiers. Those identifiers must remain intact to preserve records and access protections.

## Changes
1. Keep the existing Auraluxe business as the sole workspace. Automatically select it for authorized users; show an access-required state for anyone without membership. Never automatically enroll users or assign roles.
2. Remove business registration and business switching from settings, dashboard, products, contacts, inventory, trading, reports and security pages. Keep branch selectors and authorized all-branch report views.
3. Make **Auraluxe** visible in shared navigation and workspace headings, with BizSathi retained as the application name. Rename business administration to **Branches & staff**.
4. Disable new business creation in the application and for ordinary signed-in database callers. Enforce the fixed workspace through trusted database membership checks, not just hidden controls.
5. Preserve existing Auraluxe branches, products, memberships, invitations, settings, stock and financial history. Preserve local-draft encryption and account/branch scoping. Do not delete or merge records.

## Technical approach
- Use the existing Auraluxe record ID as the authoritative workspace binding; do not select by editable name or grant access based on branding.
- Keep existing `business_id` columns, foreign keys and tenant isolation as defense in depth; this is a single-business product configuration, not a ledger/schema rewrite.
- Add a narrowly scoped database guard to the shared business/role access path and prevent normal authenticated creation of additional businesses. Audit direct policies and privileged functions that bypass shared helpers before applying it.
- Reuse existing membership, invitation and branch-management operations; preserve server-side role hierarchy and explicit staff branch grants.
- Update affected route titles/descriptions for Auraluxe, without changing existing page URLs or external Auraluxe website code.

## Verification
- Test that only the bound Auraluxe workspace is selectable and another business cannot be created or accessed through this application.
- Retain tests for administrator branch management, staff branch restrictions, invitation authority and financial record isolation.
- Verify signed-in products/settings, branch selection and a non-member access state; check desktop and tablet layouts.
- No sample records, financial postings, website stock integration or deployment are included.

## Approval
This structural change is presented for approval before implementation, as required by the existing project safety preference.