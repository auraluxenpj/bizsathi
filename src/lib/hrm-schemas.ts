import { z } from 'zod';
import { tenantInput } from './business-schemas';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().finite().min(0).max(100000000);
export const hrmWorkspaceInput = tenantInput;
export const hrmEmployeeInput = tenantInput.extend({
  userId: uuid, branchId: uuid.nullable().optional(),
  employeeNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/),
  department: z.string().trim().max(100).optional(), designation: z.string().trim().max(100).optional(),
  employmentType: z.enum(['full_time','part_time','contract','temporary','intern']).default('full_time'),
  joiningDate: date, confirmationDate: date.nullable().optional(),
  employmentStatus: z.enum(['active','on_leave','suspended','terminated']).default('active'),
  emergencyContactName: z.string().trim().max(120).optional(),
  emergencyContactPhone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(500).optional(), notes: z.string().trim().max(1000).optional(),
});
export const hrmClockInput = tenantInput.extend({ attendanceDate: date, direction: z.enum(['check_in','check_out']) });
export const hrmAttendanceInput = tenantInput.extend({
  userId: uuid, branchId: uuid.nullable().optional(), attendanceDate: date,
  checkIn: z.string().datetime().nullable().optional(), checkOut: z.string().datetime().nullable().optional(),
  attendanceStatus: z.enum(['present','late','half_day','absent','holiday','week_off']),
  notes: z.string().trim().max(500).optional(),
});
export const hrmLeaveTypeInput = tenantInput.extend({
  name: z.string().trim().min(2).max(80), annualQuota: z.number().min(0).max(366), isPaid: z.boolean(),
});
export const hrmLeaveRequestInput = tenantInput.extend({
  leaveTypeId: uuid, startDate: date, endDate: date, days: z.number().positive().max(366),
  reason: z.string().trim().max(1000).optional(),
});
export const hrmLeaveReviewInput = z.object({
  businessId: uuid, requestId: uuid, decision: z.enum(['approved','rejected']), reviewNote: z.string().trim().max(500).optional(),
});
export const hrmShiftInput = tenantInput.extend({
  name: z.string().trim().min(2).max(80), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), breakMinutes: z.number().int().min(0).max(480),
});
export const hrmShiftAssignmentInput = tenantInput.extend({
  userId: uuid, shiftId: uuid, shiftDate: date, branchId: uuid.nullable().optional(),
});
export const hrmSalaryInput = tenantInput.extend({
  userId: uuid, effectiveFrom: date, basicSalary: money, houseAllowance: money,
  transportAllowance: money, otherAllowance: money, taxDeduction: money,
  providentFund: money, insuranceDeduction: money, otherDeduction: money,
});
export const hrmPayrollGenerateInput = tenantInput.extend({
  periodStart: date, periodEnd: date, periodLabel: z.string().trim().min(3).max(40),
});
export const hrmPayrollActionInput = z.object({ businessId: uuid, runId: uuid });
