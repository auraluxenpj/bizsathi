import { formatBsAd, formatNPR } from './format';

export type InvoiceLine = { sku: string; name: string; quantity: number; price: number; total: number };
export type InvoiceMessageInput = { business: string; reference: string; date: string; kind: string; party: string; lines: InvoiceLine[]; total: number; paid: number; outstanding: number };

const titles: Record<string, string> = { sale: 'Invoice', purchase: 'Bill', sale_return: 'Credit note', purchase_return: 'Debit note', purchase_order: 'Purchase order', goods_receipt: 'Goods receipt' };
export const invoiceTitle = (kind: string) => titles[kind] ?? kind.replaceAll('_', ' ');

/** Plain-text invoice for WhatsApp, SMS or the clipboard. */
export function invoiceMessage(i: InvoiceMessageInput): string {
  const shown = i.lines.slice(0, 12);
  const rows = shown.map(l => `${l.name} × ${l.quantity} = ${formatNPR(l.total)}`);
  if (i.lines.length > shown.length) rows.push(`+ ${i.lines.length - shown.length} more item${i.lines.length - shown.length === 1 ? '' : 's'}`);
  return [
    `${i.business}`,
    `${invoiceTitle(i.kind)} ${i.reference}`,
    formatBsAd(i.date),
    i.party ? `To: ${i.party}` : '',
    '',
    ...rows,
    '',
    `Total: ${formatNPR(i.total)}`,
    i.paid > 0 ? `Paid: ${formatNPR(i.paid)}` : '',
    i.outstanding > 0 ? `Balance due: ${formatNPR(i.outstanding)}` : '',
    '',
    'Thank you!',
  ].filter((line, idx, all) => line !== '' || (all[idx - 1] !== '' && idx !== 0)).join('\n').trim();
}
