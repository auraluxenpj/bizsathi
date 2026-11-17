import { describe, expect, it } from 'vitest';
import {
  hrmEmployeeInput, hrmAttendancePolicyInput, hrmLeaveTypeInput, hrmLeaveBalanceAdjustmentInput, hrmReportInput, hrmAttendanceInput, hrmShiftInput, hrmSalaryInput, hrmPayrollGenerateInput,
} from './hrm-schemas';
import { rolePresets } from './permissions';
import { jobTitles } from './job-titles';
import { workspaceGroups } from './workspace-navigation';

const businessId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';

describe('BizSathi HRM validation and access defaults', () => {
  it('accepts an employee record linked to an existing business member', () => {
    expect(hrmEmployeeInput.safeParse({
      businessId, userId, employeeNumber: 'emp-0001', joiningDate: '2026-11-01',
      employmentType: 'full_time', employmentStatus: 'active',
    }).success).toBe(true);
  });

  it('rejects invalid employee dates and employee numbers', () => {
    expect(hrmEmployeeInput.safeParse({
      businessId, userId, employeeNumber: 'x', joiningDate: '01-11-2026',
    }).success).toBe(false);
  });

  it('accepts valid attendance statuses and rejects unsupported values', () => {
    const base = { businessId, userId, attendanceDate: '2026-11-17', attendanceStatus: 'present' };
    expect(hrmAttendanceInput.safeParse(base).success).toBe(true);
    expect(hrmAttendanceInput.safeParse({ ...base, attendanceStatus: 'remote' }).success).toBe(false);
  });

  it('supports front-loaded and monthly leave accrual settings', () => {
    const base = { businessId, name: 'Annual Leave', annualQuota: 12, isPaid: true };
    expect(hrmLeaveTypeInput.safeParse({ ...base, accrualMethod: 'monthly' }).success).toBe(true);
    expect(hrmLeaveTypeInput.safeParse({ ...base, accrualMethod: 'unknown' }).success).toBe(false);
  });

  it('validates bounded date and branch filters for HR reports', () => {
    expect(hrmReportInput.safeParse({ businessId, from: '2026-01-01', to: '2026-12-31', branchId: null }).success).toBe(true);
    expect(hrmReportInput.safeParse({ businessId, from: '2026-11-30', to: '2026-11-01' }).success).toBe(false);
    expect(hrmReportInput.safeParse({ businessId, from: '2025-01-01', to: '2026-12-31' }).success).toBe(false);
  });

  it('validates opening balances, carry-forward and documented adjustments', () => {
    const base = { businessId, userId, leaveTypeId: '00000000-0000-4000-8000-000000000003', leaveYear: 2026, deltaDays: 5 };
    expect(hrmLeaveBalanceAdjustmentInput.safeParse({ ...base, entryType: 'opening_balance' }).success).toBe(true);
    expect(hrmLeaveBalanceAdjustmentInput.safeParse({ ...base, entryType: 'carry_forward' }).success).toBe(true);
    expect(hrmLeaveBalanceAdjustmentInput.safeParse({ ...base, entryType: 'adjustment', notes: 'Correct opening balance' }).success).toBe(true);
    expect(hrmLeaveBalanceAdjustmentInput.safeParse({ ...base, entryType: 'adjustment' }).success).toBe(false);
    expect(hrmLeaveBalanceAdjustmentInput.safeParse({ ...base, entryType: 'opening_balance', deltaDays: 0 }).success).toBe(false);
  });

  it('validates bounded attendance and overtime policy values', () => {
    expect(hrmAttendancePolicyInput.safeParse({ businessId, workdayMinutes: 480, unpaidBreakMinutes: 60, graceMinutes: 10, overtimeAfterMinutes: 0, overtimeMultiplier: 1.5 }).success).toBe(true);
    expect(hrmAttendancePolicyInput.safeParse({ businessId, workdayMinutes: 20, unpaidBreakMinutes: 60, graceMinutes: 10, overtimeAfterMinutes: 0, overtimeMultiplier: 1.5 }).success).toBe(false);
  });

  it('validates shift clock values and non-negative compensation', () => {
    expect(hrmShiftInput.safeParse({ businessId, name: 'Morning', startTime: '09:00', endTime: '18:00', breakMinutes: 60 }).success).toBe(true);
    expect(hrmShiftInput.safeParse({ businessId, name: 'Morning', startTime: '9am', endTime: '18:00', breakMinutes: 60 }).success).toBe(false);
    expect(hrmSalaryInput.safeParse({
      businessId, userId, effectiveFrom: '2026-11-01', basicSalary: -1, houseAllowance: 0,
      transportAllowance: 0, otherAllowance: 0, taxDeduction: 0, providentFund: 0,
      insuranceDeduction: 0, otherDeduction: 0,
    }).success).toBe(false);
  });

  it('requires a meaningful payroll period label', () => {
    expect(hrmPayrollGenerateInput.safeParse({ businessId, periodStart: '2026-11-01', periodEnd: '2026-11-30', periodLabel: 'November 2026' }).success).toBe(true);
    expect(hrmPayrollGenerateInput.safeParse({ businessId, periodStart: '2026-11-01', periodEnd: '2026-11-30', periodLabel: 'x' }).success).toBe(false);
  });

  it('grants payroll functions to accountant presets but not ordinary sales staff', () => {
    expect(rolePresets.accountant?.allowed).toContain('hr.payroll.manage');
    expect(jobTitles.sales_person.allowed).toContain('hr.self.view');
    expect(jobTitles.sales_person.allowed).not.toContain('hr.payroll.view');
  });

  it('adds HRM to the existing collapsible workspace navigation', () => {
    expect(workspaceGroups.some(group => group.name === 'HR & People Management' && group.items.some(item => item.to === '/hrm'))).toBe(true);
  });
});
