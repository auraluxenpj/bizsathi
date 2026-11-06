# Receipt & invoice scanning into reviewed expenses

## What you get
- An **Expenses inbox** page: upload photos (JPG/PNG) or PDF invoices, one or many at once.
- Lovable AI reads each file and fills in a draft: supplier, date, invoice number, amount, VAT, and a suggested category with a short reason.
- Each draft stays **unposted** until an accountant or administrator checks it, edits anything wrong, picks the branch and payment method (bank or wallet), and confirms. Confirming posts it to the books as a normal expense entry.
- Expenses table with filters (date, branch, category, status: needs review / posted / rejected) and CSV export, including a link back to the original file.
- Expanded categories: rent, utilities, salaries, transport, marketing, supplies, repairs & maintenance, professional fees, and other operating costs.

## Safeguards
- AI never posts anything. Its suggestions are saved separately from what you approve.
- Original files stay in private storage and only your team can see them.
- Duplicate check: warns if the same supplier, invoice number and amount were already posted.
- Rejected drafts are kept, never deleted, so there's a full history.
- Posting uses the existing expense entry flow, so closed periods, branch access and repeat-click protection still apply.
- Cash payments stay out of scope (same as today's expense entries).

## Technical details
- Private storage bucket for receipts, with file paths scoped to the business, plus access rules for business members.
- New `expense_receipts` table: file path, AI extraction stored as received, reviewed fields, status, the voucher it was posted as, and who did what. Only status moves forward. Uses tenant/branch row-level security, explicit grants, and ON DELETE RESTRICT.
- Extend the expense account list with new expense account codes. The voucher posting function accepts them; reports and the trial balance list them.
- Server function, available to accountants and above: signs a URL for the file, then calls the Lovable AI Gateway with the default vision model and a structured output schema. Amounts are validated as two-decimal values. Credit and rate-limit errors appear in the app and are not retried.
- Confirm runs `post_accounting_voucher` and then links the receipt, all inside one database operation.
- Tests: category/amount validation, duplicate detection, the posting link, and denial for other businesses and roles.
