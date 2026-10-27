# Expanded operational reports

## Available reports and filters

Accounting & reports now includes sales/returns, purchases/returns, combined stock movement, as-of low stock, separate customer/supplier ledgers, receivables/payables, expenses, cash/bank/wallet books, recorded trial balance and configured VAT postings. Existing general-ledger, party-statement and posting-account views remain. Sales and purchases show net-of-returns totals. Cash flow exposes the recorded money-movement book, not a classified cash-flow statement.

Financial reports use inclusive document/journal dates. Stock movement uses the business timezone date of its recorded timestamp. Low stock and outstanding balances include prior history through the end date, regardless of start date. Invoice age does not mean overdue age. Quantity balances combine legacy and document-linked movements, never current selling prices as costs.

The posting-user filter selects each register/movement/journal actor. In receivables/payables it selects the original invoice creator; all linked settlements, returns and refunds remain in the balance. A user's ledger activity is a subset, not a full business balance. Whole trial/account balances, low stock and VAT totals ignore user selection and the control is disabled, preventing partial balances. User selectors derive only from evidence visible in authorized branches through the end date; users with only earlier evidence may appear. Profile names use existing profile RLS, falling back to immutable identifiers.

CSV and full print fetch every matching row rather than a displayed page. CSV includes filter context, numeric values, attribution and source identifiers, and escapes spreadsheet formulas. The complete print preview supports browser Print/Save as PDF and repeat table headers. Screen pagination is independent of totals and exports.

## Financial reports not yet supported

- Inventory valuation: no approved movement costs/opening costs or reliable costing policy.
- Profit/P&L: no COGS and complete expense/account classification.
- Full balance sheet: no established openings or complete assets/liabilities/equity chart.
- Classified cash flow: source classification and reconciliation are incomplete.
- Statutory Nepal tax returns: configured VAT evidence is not certified filing output.

These reports explicitly state unavailable/limited scope; none uses fabricated estimates, sales-minus-purchases as profit, or assumed stock costs. Existing accounting correction/opening-balance work remains separate.

## Security and consistency

The additive `read_business_report_snapshot` function is security-invoker, verifies authenticated membership and explicit branch access, and inherits existing tenant/branch RLS. Anonymous/default execution is revoked and authenticated/service execution explicitly granted. The existing accounting snapshot remains the only accounting evidence source; combined quantity evidence and minimal variants/users/settings are appended. No new tables, ledger or financial write contracts were introduced. Authenticated response caching is disabled.

A single database snapshot underlies report calculations, numeric values travel as text, and server Decimal aggregation precedes pagination. All-history JSON volume still requires load testing before large-scale use; no silent truncation is permitted. The date and actor selectors are not a permission boundary: the database still enforces current access.

## Verification and recovery

Calculation tests cover date/actor/branch filters, creator-versus-settlement attribution, return/refund balances, full opening rows, as-of stock, complete trial totals, pagination/full export and spreadsheet safety. UI integration checks fetch all 65 fixture rows for CSV/print while the screen shows 50. Separate SQL fixtures check Kathmandu midnight boundaries, exact stock text, both ledgers, retained actor attribution, excluded raw requests, evidence-only user selectors and branch/tenant/anonymous denials. No test fixtures are inserted into the live business.

Live browser checks cover authenticated/signed-out access, all requested report choices, disabled user filters for complete balances, invalid dates and tablet overflow without page errors. The live business still has zero branches/products/documents: populated real CSV/print/ledger read-back remains unverified. The tests use isolated records, not a claim of live reporting correctness with business activity.

To recover from a report defect, disable the affected view or correct read-only projections/calculations. Preserve posted financial/quantity history and encrypted local drafts. Do not repost, delete or mutate financial records to repair a report. The previous accounting snapshot and ordinary operational modules remain intact; remove the new read surface rather than destructively rolling back tables.