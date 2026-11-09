# Auraluxe mobile-only OTP sign-in

## Result
All sign-ins use a mobile number and an SMS one-time code. Remove email/password, Google and Lovable sign-in options once mobile sign-in is working for existing users.

## Protect existing access first
- Both existing accounts currently have no verified login phone number. While signed in, let each user attach a mobile number to their **existing** account and verify it with an SMS code. Preserve account IDs, roles, branch access and all records.
- Do not copy editable profile phone numbers into login identities, create replacement accounts or assign membership from a mobile number.
- Check SMS delivery settings under **More → Users → Auth settings → Phone settings**. If setup requires a paid SMS service, explain the requirement and obtain approval before connecting it.
- Keep existing sign-in temporarily during phone verification. Disable alternative providers only after successful real SMS sign-in and existing-member access checks; never leave the app with no working sign-in method.

## Sign-in experience
- A mobile-number form, followed by a code-entry form, with resend, change-number, pending and clear failure states.
- Accept Nepal mobile numbers and normalize them to the international +977 format; support explicitly entered valid international numbers.
- Request and verify codes through Lovable Cloud authentication, not a custom OTP generator or table.
- Initially sign in existing accounts only; an unknown mobile number must not create a new account or gain Auraluxe access.
- Keep the existing dashboard/invitation destination and ordered sign-out cleanup. Retire password-recovery UI when password login is disabled.

## Staff invitations
Existing invitations verify the recipient's confirmed email. Retain that protection for existing accounts with verified emails; do not silently convert them to phone invitations or weaken acceptance checks. New phone-only staff provisioning requires a separate reviewed invitation change, rather than granting access automatically at login.

## Verification
- Tests for number normalization, invalid inputs, OTP request/verification failures, resends, and no automatic signup.
- Check mobile and desktop sign-in and account-phone verification screens.
- Verify real SMS receipt, code sign-in, retained Auraluxe membership, sign-out and route denial before disabling old providers. This needs an account holder who can receive the SMS; do not invent test phone numbers or mark SMS delivery verified without receipt.

## Technical details
Reuse the existing profiles table and authentication session handling. Attach and verify the phone on the existing authenticated identity through supported Cloud Auth calls; profile contact information is not proof of phone ownership. Continue enforcing trusted database membership and branch authorization independently of the sign-in method. No financial or stock schema changes.