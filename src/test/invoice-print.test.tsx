import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { InvoiceActions, InvoiceSheet, type InvoiceData, type InvoiceLayout } from '@/components/invoice-print';

const data: InvoiceData = { business: 'Auraluxe Private Limited', pan: '123456789', reference: 'INV-20261106-AB12', date: '2026-11-06', status: 'confirmed', kind: 'sale', branch: 'Main', party: 'Ram Traders', phone: '9812345678', lines: [{ sku: 'S1', name: 'Silk Saree', quantity: 2, price: 1500, total: 3000 }], subtotal: 3000, tax: 0, total: 3000, paid: 1000, returned: 0, outstanding: 2000, docId: 'doc-1', payments: [{ method: 'bank', date: '2026-11-06', reference: 'FONEPAY-778899', amount: 600, direction: 'in' }, { method: 'cash', date: '2026-11-06', reference: 'INV-20261106-AB12', amount: 400, direction: 'in' }], invoiceFooter: 'Visit again soon.', invoiceTerms: 'Goods once sold cannot be returned.', invoiceSignatureLabel: 'For Auraluxe · Authorized Signatory' };

function Harness({ initial = 'a4' as InvoiceLayout, d = data }) {
  const [layout, setLayout] = useState<InvoiceLayout>(initial);
  return <><InvoiceActions data={d} layout={layout} onLayout={setLayout} onStatus={() => {}} /><InvoiceSheet data={d} layout={layout} /></>;
}

describe('Invoice print and share', () => {
  it('A4 layout shows the business, customer, items and balance', () => {
    render(<Harness />);
    const sheet = screen.getByLabelText('Invoice receipt');
    expect(sheet).toHaveAttribute('data-layout', 'a4');
    expect(screen.getByRole('img', { name: 'AURALUXE' })).toHaveAttribute('src', '/brand/auraluxe-invoice-logo.jpg');
    expect(sheet).not.toHaveTextContent('FASHION | BEAUTY | LIFESTYLE');
    for (const t of ['PAN/VAT 123456789', 'Ram Traders', 'Silk Saree', 'INV-20261106-AB12', 'Rs. 3,000.00', 'Rs. 2,000.00', 'Goods once sold cannot be returned.', 'For Auraluxe · Authorized Signatory', 'Visit again soon.', 'Payment details', 'bank', 'FONEPAY-778899', 'cash', 'Rs. 600.00', 'Rs. 400.00']) expect(sheet).toHaveTextContent(t);
    expect(sheet).toHaveTextContent('2083-07-20 BS');
  });
  it('switches to the 80mm thermal layout with the right paper size', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '80mm' }));
    expect(screen.getByLabelText('Invoice receipt')).toHaveAttribute('data-layout', 'thermal');
    expect(screen.getByRole('img', { name: 'AURALUXE logo' })).toHaveAttribute('src', '/brand/auraluxe-invoice-logo.jpg');
    expect(screen.getByRole('heading', { name: 'AURALUXE' })).toBeInTheDocument();
    expect(document.querySelectorAll('style')[1]?.textContent).toContain('.thermal-receipt__logo');
    expect(document.querySelector('style')?.textContent).toContain('80mm auto');
    expect(screen.getByLabelText('Invoice receipt')).toHaveClass('w-[76mm]');
    expect(screen.getByLabelText('Invoice receipt')).toHaveClass('box-border');
    const receipt = screen.getByLabelText('Invoice receipt');
    expect(receipt).toHaveTextContent('Payment details');
    expect(receipt).toHaveTextContent('FONEPAY-778899');
    fireEvent.click(screen.getByRole('button', { name: 'A4' }));
    expect(document.querySelector('style')?.textContent).toContain('size: A4');
  });
  it('prints the invoice', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Print/ }));
    expect(print).toHaveBeenCalledTimes(1);
  });
  it('WhatsApp goes to the customer with the invoice text; SMS only when there is a phone', () => {
    render(<Harness />);
    const wa = screen.getByRole('link', { name: /WhatsApp/ });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/9779812345678\?text=/);
    expect(decodeURIComponent(wa.getAttribute('href')!)).toContain('Balance due: Rs. 2,000.00');
    expect(screen.getByRole('link', { name: /SMS/ }).getAttribute('href')).toMatch(/^sms:9812345678\?body=/);
  });
  it('a walk-in sale opens a blank WhatsApp chooser and has no SMS button', () => {
    render(<Harness d={{ ...data, party: '', phone: '' }} />);
    expect(screen.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(screen.queryByRole('link', { name: /SMS/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Invoice receipt')).toHaveTextContent('Walk-in customer');
  });
});
