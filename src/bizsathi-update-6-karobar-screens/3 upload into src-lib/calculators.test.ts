import { describe, expect, it } from 'vitest';
import { addVat, discountPrice, margin, removeVat } from './calculators';
import { normalizePhone, reminderMessage, smsLink, whatsappLink } from './reminders';

describe('calculators', () => {
  it('adds and removes 13% VAT', () => {
    expect(addVat(1000)).toEqual({ base: 1000, vat: 130, total: 1130 });
    expect(removeVat(1130)).toEqual({ base: 1000, vat: 130, total: 1130 });
    expect(removeVat(100)).toEqual({ base: 88.5, vat: 11.5, total: 100 });
  });
  it('calculates discount and margin', () => {
    expect(discountPrice(2500, 10)).toEqual({ discount: 250, final: 2250 });
    expect(margin(800, 1000)).toEqual({ profit: 200, marginPct: 20, markupPct: 25 });
    expect(margin(0, 0)).toEqual({ profit: 0, marginPct: 0, markupPct: 0 });
  });
});

describe('reminders', () => {
  it('normalizes Nepal numbers', () => {
    expect(normalizePhone('9800000000')).toBe('9779800000000');
    expect(normalizePhone('+977 980-000-0000')).toBe('9779800000000');
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
  });
  it('builds message and links', () => {
    const m = reminderMessage('Ram', 'Auraluxe', 600);
    expect(m).toContain('Rs. 600.00');
    expect(whatsappLink('9800000000', m)).toMatch(/^https:\/\/wa\.me\/9779800000000\?text=/);
    expect(whatsappLink('nope', m)).toBeNull();
    expect(smsLink('980-000-0000', m)).toMatch(/^sms:9800000000\?body=/);
  });
});
