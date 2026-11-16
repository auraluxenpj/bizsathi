# Verified team signup — Auth configuration and rollout

## Required Supabase Auth settings

Configure the **isolated BizSathi staging Supabase project** first. Do not change production during this rollout.

In Supabase Dashboard → Authentication → Sign In / Providers → Phone:

- Enable the Phone provider.
- Enable **Confirm phone** (phone confirmation must be required).
- Do not enable phone auto-confirmation / do not bypass OTP verification.
- Configure an SMS provider and its credentials in Supabase Auth. Keep provider secrets in Supabase settings, never in GitHub or browser environment variables.
- Confirm the SMS provider supports Nepal (+977), and set appropriate OTP expiry and rate limits.
- Add the staging app URL and the exact auth redirect URLs used by the staging app.

Terminology: the desired state is **Confirm phone = ON** and **phone auto-confirm = OFF**. These are not the same as simply enabling the Phone sign-in provider.

## Signup and acceptance contract

- Signup is invitation-only and requires full name, email, Nepal mobile, password (at least 8 characters), and password confirmation.
- Email confirmation must be completed before joining.
- Signup mobile is saved as untrusted profile metadata only; it does not count as verified Auth phone.
- The join screen pre-fills the supplied mobile for convenience, but the user must receive and enter the Supabase Auth OTP.
- Acceptance is performed by the server/database, which checks the confirmed Auth email and confirmed Auth phone against the invitation's bound email and mobile. Role, business, branch and inviter remain server-assigned.
- Invitation is single-use and revocable; preview/status only show masked email/mobile values.

## Staging acceptance test

1. Create an invitation for a disposable email and Nepal mobile.
2. Register with those details and confirm the email.
3. Return to the invitation, request an SMS OTP, and verify the invited mobile.
4. Accept the invitation once.
5. Confirm a second acceptance is rejected.
6. Confirm an account with a different verified email or mobile is rejected.
7. Confirm no invitation API response exposes the full invitee email, mobile or token hash.

## Release gates

- GitHub CI (unit/component tests, lint and production build) passes.
- Staging Auth setting is visually confirmed and real SMS delivery is tested.
- Staging SQL regression suite passes against the reconciled migration history.
- Production Auth configuration, database migrations and deployment each require separate approval.
