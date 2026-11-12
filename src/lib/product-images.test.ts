import { describe, it, expect } from 'vitest';
import { fitWithin, productImagePath, extensionFor, sourceProblem } from './product-images';
const b = '11111111-1111-4111-8111-111111111111', p = '22222222-2222-4222-8222-222222222222', f = '33333333-3333-4333-8333-333333333333';
describe('Product photo helpers', () => {
  it('shrinks large photos to fit 900px and keeps the shape', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 900, height: 675 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 675, height: 900 });
  });
  it('never enlarges small photos', () => expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 }));
  it('handles empty or invalid sizes', () => expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 }));
  it('builds the path the database requires: business/product/file.ext', () => {
    expect(productImagePath(b, p, f, 'image/webp')).toBe(`${b}/${p}/${f}.webp`);
    expect(productImagePath(b, p, f, 'image/jpeg')).toBe(`${b}/${p}/${f}.jpg`);
  });
  it('refuses file types that are not photos', () => {
    expect(extensionFor('application/pdf')).toBeNull();
    expect(productImagePath(b, p, f, 'image/svg+xml')).toBeNull();
    expect(sourceProblem({ type: 'image/gif', size: 100 })).toMatch(/JPG, PNG or WebP/);
  });
  it('refuses empty and oversized files, accepts a normal photo', () => {
    expect(sourceProblem({ type: 'image/png', size: 0 })).toMatch(/empty/);
    expect(sourceProblem({ type: 'image/png', size: 16 * 1024 * 1024 })).toMatch(/15 MB/);
    expect(sourceProblem({ type: 'image/jpeg', size: 2_000_000 })).toBeNull();
  });
});
