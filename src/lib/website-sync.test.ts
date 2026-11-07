import { describe, expect, it, vi } from 'vitest';
import { compareStock, eligibleStock, runWebsiteSync } from './website-sync';
const id = '11111111-1111-4111-8111-111111111111';
const ack = { id, sku: 'al-1', delta: -2 };
const row = { id, sku: 'AL-1', stock: '10' };
const local = [row];
const remote = { sku: 'AL-1', match: 'variant' as const, current: 8, last: 10, pending: 0 };
const state = { items: [remote] };
describe('website stock sync', () => {
  it('matches trimmed active SKU input case-insensitively and compares stock', () => {
    expect(compareStock(eligibleStock([{ ...row, sku: ' AL-1 ' }]).valid, [{ ...remote, sku: 'al-1' }])[0]).toMatchObject({ sku: 'AL-1', local: 10, website: 8, matched: true });
  });
  it('rejects ambiguous local SKUs and fractional stock instead of rounding', () => {
    expect(eligibleStock([row, { ...row, sku: 'al-1' }]).valid).toHaveLength(0);
    expect(eligibleStock([{ ...row, stock: '2.5' }]).valid).toHaveLength(0);
  });
  it('records a website sale adjustment before acknowledging it and pushes the reread balance', async () => {
    const order: string[] = [];
    const snapshot = vi.fn().mockResolvedValueOnce(local).mockResolvedValueOnce([{ ...row, stock: '8' }]);
    const call = vi.fn(async (r: Record<string, unknown>) => {
      order.push(String(r['action']));
      if (r['action'] === 'state') return state;
      if (r['action'] === 'ack') return { acks: [ack] };
      if (r['action'] === 'recorded') return { count: 1 };
      expect(r['items']).toEqual([{ sku: 'AL-1', stock: 8, expected: 8 }]);
      return { results: [{ sku: 'AL-1', result: 'applied' }] };
    });
    const report = await runWebsiteSync({ snapshot, call, record: async a => { order.push('local'); expect(a.delta).toBe(-2); return true; } });
    expect(order).toEqual(['state','ack','local','recorded','state','push']);
    expect(report).toMatchObject({ recorded: 1, updated: 1, error: null });
  });
  it('recovers a previously recorded acknowledgement without duplicating the local adjustment', async () => {
    const call = vi.fn(async (r: Record<string, unknown>) => r['action'] === 'state' ? state : r['action'] === 'ack' ? { acks: [ack] } : r['action'] === 'recorded' ? { count: 0 } : { results: [{ sku: 'AL-1', result: 'applied' }] });
    expect((await runWebsiteSync({ snapshot: async () => local, call, record: async () => false })).recorded).toBe(0);
    expect(call).toHaveBeenCalledWith({ action: 'recorded', ids: [id] });
  });
  it('does not complete or push an adjustment rejected for insufficient stock', async () => {
    const call = vi.fn(async (r: Record<string, unknown>) => r['action'] === 'state' ? state : { acks: [ack] });
    const report = await runWebsiteSync({ snapshot: async () => local, call, record: async () => { throw new Error('Insufficient'); } });
    expect(report.recorded).toBe(0); expect(report.updated).toBe(0);
    expect(call.mock.calls.map(([r]) => r['action'])).toEqual(['state','ack','state']);
  });
  it('stops on website completion failure after local success so retries remain recoverable', async () => {
    const call = vi.fn(async (r: Record<string, unknown>) => {
      if (r['action'] === 'state') return state;
      if (r['action'] === 'ack') return { acks: [ack] };
      throw new Error('Website unavailable');
    });
    const report = await runWebsiteSync({ snapshot: async () => local, call, record: async () => true });
    expect(report.recorded).toBe(1); expect(report.updated).toBe(0); expect(report.error).toBe('Website unavailable');
    expect(call.mock.calls.some(([r]) => r['action'] === 'push')).toBe(false);
  });
  it('does not blindly overwrite concurrent website sales', async () => {
    const call = async (r: Record<string, unknown>) => r['action'] === 'state' ? state : r['action'] === 'ack' ? { acks: [] } : { results: [{ sku: 'AL-1', result: 'changed' }] };
    const report = await runWebsiteSync({ snapshot: async () => local, call, record: async () => true });
    expect(report.updated).toBe(0); expect(report.issues).toContain('AL-1: changed; compare and sync again');
  });
  it('never pushes unmatched website products', async () => {
    const call = vi.fn(async () => ({ items: [{ ...remote, match: 'none', current: null }] }));
    const report = await runWebsiteSync({ snapshot: async () => local, call, record: async () => true });
    expect(report.updated).toBe(0); expect(call).toHaveBeenCalledTimes(1);
  });
  it('rejects unexpected acknowledgement SKUs before recording', async () => {
    const record = vi.fn();
    const call = async (r: Record<string, unknown>) => r['action'] === 'state' ? state : { acks: [{ ...ack, sku: 'OTHER' }] };
    const report = await runWebsiteSync({ snapshot: async () => local, call, record });
    expect(record).not.toHaveBeenCalled(); expect(report.error).toContain('unexpected acknowledgement');
  });
});