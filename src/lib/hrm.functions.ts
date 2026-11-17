/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  hrmWorkspaceInput, hrmEmployeeInput, hrmEmployeeUpdateInput, hrmAttendanceInput, hrmClockInput, hrmLeaveTypeInput, hrmAttendancePolicyInput,
  hrmLeaveRequestInput, hrmLeaveReviewInput, hrmLeaveBalanceAdjustmentInput, hrmShiftInput, hrmShiftAssignmentInput,
  hrmSalaryInput, hrmPayrollGenerateInput, hrmPayrollActionInput, hrmPayrollPaidInput, hrmReportInput,
} from './hrm-schemas';

// The generated Supabase type file is intentionally not edited for feature-only tables.
const db = (client: unknown) => client as SupabaseClient<any, 'public', any>;

export const getHrmWorkspace = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmWorkspaceInput)
  .handler(async ({ data, context }) => {
    const client = db(context.supabase);
    const [membership, admin, payroll, branches, members, employees, attendance, leaveTypes, leaveRequests, shifts, assignments, salaries, payrollRuns, payrollItems, attendancePolicy, leaveBalanceEntries] = await Promise.all([
      client.rpc('is_business_member', { _business_id: data.businessId }),
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
      client.from('hr_attendance_policies').select('*').eq('business_id', data.businessId).maybeSingle(),
      client.from('hr_leave_balance_entries').select('*').eq('business_id', data.businessId).order('created_at', { ascending: false }).limit(500),
    ]);
    if (membership.error) throw new Error('Your business access could not be verified. Please refresh and confirm that you still belong to this business.');
    if (!membership.data) throw new Error('You do not have active access to this business.');
    if (admin.error || payroll.error) throw new Error('Your HR role permissions could not be checked. Please ask the business owner to review your membership.');

    const datasets = [
      ['branches', branches], ['business members', members], ['employee records', employees],
      ['attendance', attendance], ['leave types', leaveTypes], ['leave requests', leaveRequests],
      ['shifts', shifts], ['shift assignments', assignments], ['salary structures', salaries],
      ['payroll runs', payrollRuns], ['payroll items', payrollItems],
      ['attendance policy', attendancePolicy], ['leave balance ledger', leaveBalanceEntries],
    ] as const;
    const failed = datasets.filter(([, result]) => result.error);
    if (failed.length) {
      const schemaFailures = failed.filter(([, result]) =>
        ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(result.error?.code ?? ''),
      );
      if (schemaFailures.length) {
        const missing = schemaFailures.map(([name]) => name).join(', ');
        throw new Error(`HRM database setup is incomplete (${missing}). Apply and verify Sutra HRM migrations 0061–0064 before opening this workspace.`);
      }
      const names = failed.map(([name]) => name).join(', ');
      throw new Error(`HRM data access failed for: ${names}. Ask the business owner to verify the HRM database permissions and your delegated access.`);
    }
    let employeeRows = employees.data ?? [];
    if (payroll.data && !admin.data) {
      const { data: limitedEmployees, error: employeeListError } = await client.rpc('hr_list_payroll_employees', { _business_id: data.businessId });
      if (employeeListError) throw new Error('Payroll employee list could not be loaded.');
      employeeRows = limitedEmployees ?? [];
    }
    const peopleIds = [...new Set([
      ...(members.data ?? []).map((x: any) => x.user_id),
      ...employeeRows.map((x: any) => x.user_id),
      ...(attendance.data ?? []).map((x: any) => x.user_id),
      ...(leaveRequests.data ?? []).map((x: any) => x.user_id),
      ...(assignments.data ?? []).map((x: any) => x.user_id),
    ])];
    const { data: profiles, error: profileError } = peopleIds.length
      ? await client.from('profiles').select('id,full_name').in('id', peopleIds)
      : { data: [], error: null };
    if (profileError) throw new Error('Employee names could not be loaded.');
    const names = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, { fullName: p.full_name ?? 'Employee' }]));
    const enrich = (rows: any[]) => (rows ?? []).map(row => ({ ...row, employee: names[row.user_id] ?? { fullName: 'Employee', phone: null } }));
    return {
      userId: context.userId, isAdmin: Boolean(admin.data), canPayroll: Boolean(payroll.data),
      branches: branches.data ?? [], members: enrich(members.data ?? []), employees: enrich(employeeRows),
      attendance: enrich(attendance.data ?? []), leaveTypes: leaveTypes.data ?? [],
      leaveRequests: enrich(leaveRequests.data ?? []), shifts: shifts.data ?? [],
      assignments: enrich(assignments.data ?? []), salaries: salaries.data ?? [],
      payrollRuns: payrollRuns.data ?? [], payrollItems: enrich(payrollItems.data ?? []), attendancePolicy: attendancePolicy.data ?? null,
      leaveBalanceEntries: leaveBalanceEntries.data ?? [],
    };
  });

export const getHrmReports = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmReportInput)
  .handler(async ({ data, context }) => {
    const client = db(context.supabase);
    const [membership, admin, payroll, branchResult] = await Promise.all([
      client.rpc('is_business_member', { _business_id: data.businessId }),
      client.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'admin' }),
      client.rpc('has_business_role', { _business_id: data.businessId, _min_role: 'accountant' }),
      client.from('branches').select('id,name,code').eq('business_id', data.businessId).order('name'),
    ]);
    if (membership.error || !membership.data || admin.error || payroll.error || branchResult.error) {
      throw new Error('HR reports could not be loaded. Check business access and HRM setup.');
    }
    const isAdmin = Boolean(admin.data);
    const canPayroll = Boolean(payroll.data);
    if (!isAdmin && !canPayroll) throw new Error('HR reports require administrator or payroll access.');

    let employeeRows: any[] = [];
    if (isAdmin) {
      const { data: rows, error } = await client.from('hr_employee_records')
        .select('user_id,employee_number,branch_id,department,designation,employment_status')
        .eq('business_id', data.businessId);
      if (error) throw new Error('Employee reporting list could not be loaded.');
      employeeRows = rows ?? [];
      const ids = employeeRows.map(row => row.user_id);
      if (ids.length) {
        const { data: profiles, error: profileError } = await client.from('profiles').select('id,full_name').in('id', ids);
        if (profileError) throw new Error('Employee report names could not be loaded.');
        const names = Object.fromEntries((profiles ?? []).map((profile: any) => [profile.id, profile.full_name ?? 'Employee']));
        employeeRows = employeeRows.map(row => ({ ...row, full_name: names[row.user_id] ?? 'Employee' }));
      }
    } else if (canPayroll) {
      const { data: rows, error } = await client.rpc('hr_list_payroll_employees', { _business_id: data.businessId });
      if (error) throw new Error('Payroll employee reporting list could not be loaded.');
      employeeRows = rows ?? [];
    }

    const scopedEmployees = employeeRows.filter(row => !data.branchId || row.branch_id === data.branchId);
    const scopedUserIds = scopedEmployees.map(row => row.user_id);
    const paged = async (makeQuery: () => any) => {
      const allRows: any[] = [];
      for (let offset = 0; offset < 10000; offset += 1000) {
        const { data: page, error } = await makeQuery().range(offset, offset + 999);
        if (error) throw new Error('A report dataset could not be loaded. Try a shorter date range.');
        allRows.push(...(page ?? []));
        if (!page || page.length < 1000) break;
      }
      return allRows;
    };

    let attendance: any[] = [];
    let leaveRequests: any[] = [];
    let leaveTypes: any[] = [];
    if (isAdmin && scopedUserIds.length) {
      [attendance, leaveRequests, leaveTypes] = await Promise.all([
        paged(() => {
          let query = client.from('hr_attendance').select('*').eq('business_id', data.businessId)
            .gte('attendance_date', data.from).lte('attendance_date', data.to).order('attendance_date', { ascending: false });
          if (data.branchId) query = query.eq('branch_id', data.branchId);
          return query;
        }),
        paged(() => client.from('hr_leave_requests').select('*').eq('business_id', data.businessId)
          .lte('start_date', data.to).gte('end_date', data.from).in('user_id', scopedUserIds)
          .order('start_date', { ascending: false })),
        (async () => {
          const { data: rows, error } = await client.from('hr_leave_types').select('id,name,is_paid')
            .eq('business_id', data.businessId);
          if (error) throw new Error('Leave type labels could not be loaded.');
          return rows ?? [];
        })(),
      ]);
    }

    let payrollItems: any[] = [];
    let payrollRuns: any[] = [];
    if (canPayroll && scopedUserIds.length) {
      [payrollItems, payrollRuns] = await Promise.all([
        paged(() => client.from('hr_payroll_items').select('*').eq('business_id', data.businessId)
          .lte('period_start', data.to).gte('period_end', data.from).in('user_id', scopedUserIds)
          .order('period_start', { ascending: false })),
        paged(() => client.from('hr_payroll_runs').select('id,period_start,period_end,period_label,run_status,employee_count,gross_total,deduction_total,net_total')
          .eq('business_id', data.businessId).lte('period_start', data.to).gte('period_end', data.from)
          .order('period_start', { ascending: false })),
      ]);
    }

    return {
      from: data.from, to: data.to, branchId: data.branchId ?? null,
      isAdmin, canPayroll, branches: branchResult.data ?? [], employees: scopedEmployees,
      attendance, leaveRequests, leaveTypes, payrollItems, payrollRuns,
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

export const updateHrmEmployee = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmEmployeeUpdateInput)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await db(context.supabase).from('hr_employee_records').update({
      branch_id: data.branchId ?? null, employee_number: data.employeeNumber,
      department: data.department || null, designation: data.designation || null,
      employment_type: data.employmentType, joining_date: data.joiningDate,
      confirmation_date: data.confirmationDate ?? null, employment_status: data.employmentStatus,
      emergency_contact_name: data.emergencyContactName || null,
      emergency_contact_phone: data.emergencyContactPhone || null,
      address: data.address || null, notes: data.notes || null,
      responsibilities: data.responsibilities ?? [],
      exit_date: data.employmentStatus === 'terminated' ? data.exitDate ?? null : null,
      last_working_date: data.employmentStatus === 'terminated' ? data.lastWorkingDate ?? null : null,
      exit_type: data.employmentStatus === 'terminated' ? data.exitType ?? null : null,
      exit_reason: data.employmentStatus === 'terminated' ? data.exitReason || null : null,
      rehire_eligible: data.rehireEligible ?? true,
      final_settlement_date: data.finalSettlementDate ?? null,
      updated_at: new Date().toISOString(),
    }).eq('business_id', data.businessId).eq('user_id', data.userId).select('user_id').maybeSingle();
    if (error || !row) throw new Error('Employee record could not be updated. Check employee number and administrator access.');
    return { ok: true };
  });

export const saveHrmAttendancePolicy = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmAttendancePolicyInput)
  .handler(async ({ data, context }) => {
    const { error } = await db(context.supabase).from('hr_attendance_policies').upsert({
      business_id: data.businessId, workday_minutes: data.workdayMinutes,
      unpaid_break_minutes: data.unpaidBreakMinutes, grace_minutes: data.graceMinutes,
      overtime_after_minutes: data.overtimeAfterMinutes, overtime_multiplier: data.overtimeMultiplier,
      updated_by: context.userId, updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' });
    if (error) throw new Error('Attendance policy could not be saved. Check administrator access.');
    return { ok: true };
  });

export const clockHrmAttendance = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmClockInput)
  .handler(async ({ data, context }) => {
    const { data: stamp, error } = await db(context.supabase).rpc('hr_clock_attendance', {
      _business_id: data.businessId, _attendance_date: data.attendanceDate, _direction: data.direction,
    });
    if (error || !stamp) throw new Error('Attendance could not be recorded. Check your employee status and whether you have already clocked this action.');
    return { stamp: stamp as string };
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
      business_id: data.businessId, name: data.name, annual_quota: data.annualQuota, is_paid: data.isPaid, accrual_method: data.accrualMethod,
    });
    if (error) throw new Error('Leave type could not be created. A type with this name may already exist.');
    return { ok: true };
  });

export const saveHrmLeaveBalanceEntry = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(hrmLeaveBalanceAdjustmentInput)
  .handler(async ({ data, context }) => {
    const { data: entryId, error } = await db(context.supabase).rpc('hr_adjust_leave_balance', {
      _business_id: data.businessId, _user_id: data.userId, _leave_type_id: data.leaveTypeId,
      _leave_year: data.leaveYear, _entry_type: data.entryType, _delta_days: data.deltaDays,
      _notes: data.notes || null,
    });
    if (error || !entryId) throw new Error('Leave balance entry could not be posted. Check administrator access, employee and leave type.');
    return { entryId: entryId as string };
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
    const { data: row, error } = await db(context.supabase).rpc('hr_review_leave_request', {
      _business_id: data.businessId, _request_id: data.requestId, _decision: data.decision,
      _review_note: data.reviewNote || null, _override_reason: data.overrideReason || null,
    });
    if (error || !row) {
      const message = error?.message || '';
      if (message.includes('Insufficient leave balance')) throw new Error(message);
      throw new Error(message || 'This request could not be reviewed. It may already have been processed.');
    }
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
  .middleware([requireSupabaseAuth]).inputValidator(hrmPayrollPaidInput)
  .handler(async ({ data, context }) => {
    const { error } = await db(context.supabase).rpc('hr_mark_payroll_paid', { _run_id: data.runId, _paid_date: data.paidDate });
    if (error) throw new Error('Only an approved payroll can be marked paid by a business administrator. Choose a valid payment date.');
    return { ok: true };
  });
