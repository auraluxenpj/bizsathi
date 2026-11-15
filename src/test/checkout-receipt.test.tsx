import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheckoutReceipt } from '@/components/checkout-receipt';

describe('POS checkout receipt branding', () => {
  it('shows only the AURALUXE logo and name in the receipt header', () => {
    render(
      <CheckoutReceipt
        business="Auraluxe Private Limited"
        branch="Main"
        reference="INV-TEST"
        mobile=""
        lines={[]}
        total={0}
        tax={0}
        paid={0}
      />,
    );
    const receipt = screen.getByLabelText('Receipt preview');
    expect(receipt.querySelector('img')).toHaveAttribute('src', '/brand/auraluxe-invoice-logo.jpg');
    expect(screen.getByRole('img', { name: 'AURALUXE logo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AURALUXE' })).toBeInTheDocument();
    expect(receipt).not.toHaveTextContent('Auraluxe Private Limited');
  });
});
