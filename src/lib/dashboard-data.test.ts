import { describe, expect, it } from 'vitest';
import { authorizedSelection, financialAvailability } from './dashboard-data';
describe('Dashboard data integrity', () => {
 it('does not invent sales or cash balances without source records', () => { expect(financialAvailability().sales).toBeNull(); expect(financialAvailability().cash).toBeNull(); });
 it('does not invent inventory valuation or profit', () => { expect(financialAvailability().inventoryValue).toBeNull(); expect(financialAvailability().grossProfit).toBeNull(); });
 it('rejects a selection outside authorized records', () => expect(authorizedSelection([{id:'allowed'}], 'another-business')).toBe('allowed'));
 it('has no selected business without authorized membership', () => expect(authorizedSelection([], 'another-business')).toBe(''));
});