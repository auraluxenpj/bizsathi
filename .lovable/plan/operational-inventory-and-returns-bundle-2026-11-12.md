# Operational inventory and returns bundle

## Audit findings
- The stock ledger already supports protected, reason-logged adjustments, but damage write-offs are hidden inside the general movement form.
- Sale and purchase invoices already have a return action and protected posting. The editor currently copies all original quantities rather than showing remaining returnable items, and refund tracking needs clearer separation from unpaid invoice credit.
- Products have SKU/barcode values and checkout can scan them, but there is no barcode sticker printing screen.

## 1. Stock adjustments and disposals
- Add separate **Adjust stock** and **Dispose stock** actions in the Stock Ledger for existing authorized administrators.
- Adjustments use a signed quantity change with current and resulting stock displayed before confirmation.
- Disposals accept a positive quantity to remove, a damaged/expired reason choice, explanatory notes, branch, product and reference. Post a negative adjustment through the existing protected stock operation, with the disposal classification retained in the logged reason.
- Preserve nonnegative stock checks, immutable history and unchanged-request retries. These are quantity write-offs, not invented accounting valuation or expense postings.

## 2. Invoice-item returns and credit notes
- Keep a one-click entry action on confirmed sale and purchase invoice details, opening a review screen rather than immediately posting.
- Show original items, quantities already returned and remaining returnable quantities. Purchase returns also respect goods actually received and stock available in that branch.
- Allow selecting individual items and quantities; calculate proportional original discounts and tax with existing exact-money helpers.
- Clearly display the return credit, amount applied against the unpaid original invoice, refundable amount, recorded refunds and remaining refund due.
- Keep walk-in immediate-refund requirements, authorized administrator confirmation, cash-counter checks, original-invoice linkage and duplicate/over-return prevention.
- Show linked credit notes and refund records on invoice details and retain printable credit-note receipts and loyalty adjustments.

## 3. Printable barcode stickers
- Add **Print barcode labels** to Products, with searchable product selection, copies per SKU and a preview.
- Support A4 24-label (3 × 8) and 30-label (3 × 10) sheets, plus thermal 50 × 25 mm and 40 × 30 mm stickers.
- Include product/variant name, SKU and a scannable barcode; optional selling price. Encode the existing barcode, or the exact SKU when no barcode exists, so checkout matches without changing catalogue records.
- Add starting-slot selection for partially used A4 sheets and print only labels, never the surrounding app.
- Use actual millimetre dimensions and page breaks; physical printer alignment will still need a sample print on the user's label stock.

## Technical approach
- Reuse existing stock, commerce and payment functions and tenant/branch permissions; no new ledger, financial posting system or database schema is planned.
- Introduce focused return-calculation and barcode-print helpers/components, using a proven barcode library for encoding rather than hand-written barcode patterns.
- Keep monetary calculations in Decimal.js and retain existing request identifiers on retries.

## Verification
- Add and run tests for negative disposal quantities, reason requirements, remaining item quantities, received-goods limits, proportional credit and refund calculations, and exact 24/30 label placement.
- Run existing stock, commerce, barcode, receipt and checkout regression tests.
- Verify signed-in desktop/mobile actions, real-product label previews and print-page dimensions without creating synthetic live records or posting unrequested stock/returns.
- Where live invoices or physical printers are unavailable, report those confirmation/physical-print checks as unverified.