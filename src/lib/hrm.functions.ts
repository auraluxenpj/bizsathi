import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  hrmWorkspaceInput, hrmEmployeeInput, hrmAttendanceInput, hrmLeaveTypeInput,
  hrmLeaveRequestInput, hrmLeaveReviewInput, hrmShiftInput, hrmShiftAssignmentInput,
  hrmSalaryInput, hrmPayrollGenerateInput, hrmPayrollActionInput,
} from './hrm-schemas';

// The generated Supabase type file is intentionally not edited for feature-only tables.
const db = (client: unknown) => client as SupabaseClient<any, 'public', any>;

export const getHrmWorkspace = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmWorkspaceInput)
  .handler(async ({ data, context }) => {
    const client = db(context.supabase);
    const [membership, admin, payroll, branches, members, employees, attendance, leaveTypes, leaveRequests, shifts, assignments, salaries, payrollRuns, payrollItems] = await Promise.all([\n      client.rpc('is_business_member', { _business_id: data.businessId }),
      client.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' }),
      client.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'accountant' }),
      client.from('branches').select('id,name,code,is_active').eq('business_id', data.businessId).eq('is_active', true).order('name'),
      client.from('business_memberships').select('user_id,role_code,job_title,status').eq('business_id', data.businessId).eq('status', 'active'),
      client.from('hr_employee_records').select('*').eq('business_id', data.businessId).order('joining_date', { ascending: false }),
      client.from('hr_attendance').select('*').eq('business_id', data.businessId).order('attendance_date', { ascending: false }).limit(150),
      client.from('hr_leave_types').select('*').eq('business_id', data.businessId).eq('is_active', true).order('name'),
      client.from('hr_leave_requests').select('*').eq('business_id', data.businessId).order('created_at', { ascending: false }).limit(150),
      client.from('hr_shifts').select('*').eq('business_id', data.businessId).eq('is_active', true).order('start_time'),
      client.from('hr_shift_assignments').select('*').eq('business_id', data.businessId).order('shift_date', { ascending: false }).limit(150),
      client.from('hr_salary_structures').select('*').eq('business_id', data.businessId).order('effective_from', { ascending: false }).limit(200),
      client.from('hr_payroll_runs').select('*').eq('business_id', data.businessId).order('period_start', { ascending: false }).limit(36),
      client.from('hr_payroll_items').select('*').eq('business_id', data.businessId).order('period_start', { ascending: false }).limit(200),
    ]);
    const errors = [branches, members, employees, attendance, leaveTypes, leaveRequests, shifts, assignments, salaries, payrollRuns, payrollItems].filter(x => x.error);
    if (membership.error || !membership.data || admin.error || payroll.error || errors.length) throw new Error('HR workspace could not be loaded. Check that the HRM migration has been applied and your business access is active.');
    const peopleIds = [...new Set([
      ...(members.data ?? []).map((x: any) => x.user_id),
      ...(employees.data ?? []).map((x: any) => x.user_id),
      ...(attendance.data ?? []).map((x: any) => x.user_id),
      ...(leaveRequests.data ?? []).map((x: any) => x.user_id),
      ...(assignments.data ?? []).map((x: any) => x.user_id),
    ])];
    const { data: profiles, error: profileError } = peopleIds.length
      ? await client.from('profiles').select('id,full_name,phone').in('id', peopleIds)
      : { data: [], error: null };
    if (profileError) throw new Error('Employee names could not be loaded.');
    const names = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, { fullName: p.full_name ?? 'Employee', phone: p.phone ?? null }]));
    const enrich = (rows: any[]) => (rows ?? []).map(row => ({ ...row, employee: names[row.user_id] ?? { fullName: 'Employee', phone: null } }));
    return {
      userId: context.userId, isAdmin: Boolean(admin.data), canPayroll: Boolean(payroll.data),
      branches: branches.data ?? [], members: enrich(members.data ?? []), employees: enrich(employees.data ?? []),
      attendance: enrich(attendance.data ?? []), leaveTypes: leaveTypes.data ?? [],
      leaveRequests: enrich(leaveRequests.data ?? []), shifts: shifts.data ?? [],
      assignments: enrich(assignments.data ?? []), salaries: salaries.data ?? [],
      payrollRuns: payrollRuns.data ?? [], payrollItems: enrich(payrollItems.data ?? []),
    };
  });

export const createHrmEmployee = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmEmployeeInput)
  .handler(async ({ data, context }) => {
    const client = db(context.supabase);
    const { data: member, error: memberError } = await client.from('business_memberships')
      .select('user_id').eq('business_id', data.businessId).eq('user_id', data.userId).eq('status', 'active').maybeSingle();
    if (memberError || !member) throw new Error('Choose an active member of this business.');
    const { data: row, error } = await client.from('hr_employee_records').insert({
      business_id: data.businessId, user_id: data.userId, branch_id: data.branchId ?? null,
      employee_number: data.employeeNumber, department: data.department || null, designation: data.designation || null,
      employment_type: data.employmentType, joining_date: data.joiningDate, confirmation_date: data.confirmationDate ?? null,
      employment_status: data.employmentStatus, emergency_contact_name: data.emergencyContactName || null,
      emergency_contact_phone: data.emergencyContactPhone || null, address: data.address || null, notes: data.notes || null,
      created_by: context.userId,
    }).select('user_id').single();
    if (error || !row) throw new Error('Employee record could not be created. The member may already have an HR record.');
    return { userId: row.user_id as string };
  });

export const saveHrmAttendance = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmAttendanceInput)
  .handler(async ({ data, context }) => {
    const { error } = await db(context.supabase).from('hr_attendance').upsert({
      business_id: data.businessId, user_id: data.userId, branch_id: data.branchId ?? null,
      attendance_date: data.attendanceDate, check_in: data.checkIn ?? null, check_out: data.checkOut ?? null,
      attendance_status: data.attendanceStatus, notes: data.notes || null, recorded_by: context.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,user_id,attendance_date' });
    if (error) throw new Error('Attendance could not be saved. Check the employee, date and branch.');
    return { ok: true };
  });

export const createHrmLeaveType = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmLeaveTypeInput)
  .handler(async ({ data, context }) => {
    const { error } = await db(context.supabase).from('hr_leave_types').insert({
      business_id: data.businessId, name: data.name, annual_quota: data.annualQuota, is_paid: data.isPaid,
    });
    if (error) throw new Error('Leave type could not be created. A type with this name may already exist.');
    return { ok: true };
  });

export const createHrmLeaveRequest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmLeaveRequestInput)
  .handler(async ({ data, context }) => {
    const { error } = await db(context.supabase).from('hr_leave_requests').insert({
      business_id: data.businessId, user_id: context.userId, leave_type_id: data.leaveTypeId,
      start_date: data.startDate, end_date: data.endDate, days: data.days, reason: data.reason || null,
    });
    if (error) throw new Error('Leave request could not be submitted. Confirm that your employee profile and leave type are active.');
    return { ok: true };
  });

export const reviewHrmLeaveRequest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmLeaveReviewInput)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await db(context.supabase).from('hr_leave_requests').update({
      request_status: data.decision, reviewed_by: context.userId, reviewed_at: new Date().toISOString(),
      review_note: data.reviewNote || null, updated_at: new Date().toISOString(),
    }).eq('business_id', data.businessId).eq('id', data.requestId).eq('request_status', 'pending').select('id').maybeSingle();
    if (error || !row) throw new Error('This request could not be reviewed. It may already have been processed.');
    return { ok: true };
  });

export const createHrmShift = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmShiftInput)
  .handler(async ({ data, context }) => {
    const { error } = await db(context.supabase).from('hr_shifts').insert({ business_id: data.businessId, name: data.name, start_time: data.startTime, end_time: data.endTime, break_minutes: data.breakMinutes });
    if (error) throw new Error('Shift could not be created.');
    return { ok: true };
  });

export const assignHrmShift = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmShiftAssignmentInput)
  .handler(async ({ data, context }) => {
    const { error } = await db(context.supabase).from('hr_shift_assignments').upsert({
      business_id: data.businessId, user_id: data.userId, shift_id: data.shiftId,
      shift_date: data.shiftDate, branch_id: data.branchId ?? null, assigned_by: context.userId,
    }, { onConflict: 'business_id,user_id,shift_date' });
    if (error) throw new Error('Shift assignment could not be saved.');
    return { ok: true };
  });

export const saveHrmSalaryStructure = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmSalaryInput)
  .handler(async ({ data, context }) => {
    const { error } = await db(context.supabase).from('hr_salary_structures').upsert({
      business_id: data.businessId, user_id: data.userId, effective_from: data.effectiveFrom,
      basic_salary: data.basicSalary, house_allowance: data.houseAllowance, transport_allowance: data.transportAllowance,
      other_allowance: data.otherAllowance, tax_deduction: data.taxDeduction, provident_fund: data.providentFund,
      insurance_deduction: data.insuranceDeduction, other_deduction: data.otherDeduction, created_by: context.userId,
    }, { onConflict: 'business_id,user_id,effective_from' });
    if (error) throw new Error('Salary structure could not be saved. Payroll access is required.');
    return { ok: true };
  });

export const generateHrmPayroll = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmPayrollGenerateInput)
  .handler(async ({ data, context }) => {
    const { data: runId, error } = await db(context.supabase).rpc('hr_generate_payroll', {
      _business_id: data.businessId, _period_start: data.periodStart, _period_end: data.periodEnd, _period_label: data.periodLabel,
    });
    if (error || !runId) throw new Error('Payroll could not be generated. Check that active employees have effective salary structures and this period has not already been run.');
    return { runId: runId as string };
  });

export const approveHrmPayroll = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmPayrollActionInput)
  .handler(async ({ data, context }) => {
    const { error } = await db(context.supabase).rpc('hr_approve_payroll', { _run_id: data.runId });
    if (error) throw new Error('Only a draft payroll can be approved by an authorized payroll user.');
    return { ok: true };
  });

export const markHrmPayrollPaid = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmPayrollActionInput)
  .handler(async ({ data, context }) => {
    const { error } = await db(context.supabase).rpc('hr_mark_payroll_paid', { _run_id: data.runId });
    if (error) throw new Error('Only an approved payroll can be marked paid by a business administrator.');
    return { ok: true };
  });
