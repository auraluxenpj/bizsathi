import { describe, expect, it } from 'vitest';
import { levelPrice, priceWarnings, repriceLine } from './price-levels';

const shirt = { selling_price: 1999, wholesale_price: 1750 };
const noWholesale = { selling_price: 500, wholesale_price: 0 };

describe('levelPrice', () => {
  it('uses the selling price for retail', () => {
    expect(levelPrice(shirt, 'retail')).toBe(1999);
  });
  it('uses the wholesale price for wholesale', () => {
    expect(levelPrice(shirt, 'wholesale')).toBe(1750);
  });
  it('falls back to retail when no wholesale price is set', () => {
    expect(levelPrice(noWholesale, 'wholesale')).toBe(500);
    expect(levelPrice({ selling_price: 500 }, 'wholesale')).toBe(500);
    expect(levelPrice({ selling_price: 500, wholesale_price: null }, 'wholesale')).toBe(500);
  });
  it('accepts numeric strings and treats junk as zero', () => {
    expect(levelPrice({ selling_price: '1999.00', wholesale_price: '1750.50' }, 'wholesale')).toBe(1750.5);
    expect(levelPrice({ selling_price: 'abc' }, 'retail')).toBe(0);
  });
});

describe('repriceLine', () => {
  it('moves an untouched line to the new level and back', () => {
    expect(repriceLine(1999, shirt, 'retail', 'wholesale')).toBe(1750);
    expect(repriceLine(1750, shirt, 'wholesale', 'retail')).toBe(1999);
  });
  it('keeps a price the cashier typed by hand', () => {
    expect(repriceLine(1800, shirt, 'retail', 'wholesale')).toBe(1800);
  });
  it('leaves a line alone when the item has no wholesale price', () => {
    expect(repriceLine(500, noWholesale, 'retail', 'wholesale')).toBe(500);
  });
  it('ignores sub-paisa float noise', () => {
    expect(repriceLine(1999.001, shirt, 'retail', 'wholesale')).toBe(1750);
  });
});

describe('priceWarnings', () => {
  it('is quiet when prices are consistent or unset', () => {
    expect(priceWarnings({ selling_price: 1999, mrp: 2499, wholesale_price: 1750 })).toEqual([]);
    expect(priceWarnings({ selling_price: 1999, mrp: 0, wholesale_price: 0 })).toEqual([]);
  });
  it('flags a selling price above MRP', () => {
    expect(priceWarnings({ selling_price: 3000, mrp: 2499, wholesale_price: 0 })).toEqual(['Selling price is above the MRP.']);
  });
  it('flags a wholesale price above the retail price', () => {
    expect(priceWarnings({ selling_price: 1000, mrp: 0, wholesale_price: 1200 })).toEqual(['Wholesale price is above the retail price.']);
  });
});
