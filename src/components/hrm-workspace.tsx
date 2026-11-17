/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { CalendarDays, Clock3, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { businessQuery } from '@/lib/inventory-queries';
import { HrmDraftEmployeeProfiles } from '@/components/hrm-draft-employee-profiles';
import { authorizedSelection } from '@/lib/dashboard-data';
import {
  getHrmWorkspace, getHrmReports, createHrmEmployee, updateHrmEmployee, saveHrmAttendance, saveHrmAttendancePolicy, clockHrmAttendance, createHrmLeaveType, createHrmLeaveRequest,
  reviewHrmLeaveRequest, saveHrmLeaveBalanceEntry, createHrmShift, assignHrmShift, saveHrmSalaryStructure,
  generateHrmPayroll, approveHrmPayroll, markHrmPayrollPaid,
} from '@/lib/hrm.functions';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
const money = (value: number | string) => `Rs ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inputClass = 'mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm';
const hrRoles = ['Store Manager','Assistant Store Manager','Branch Manager','Sales Manager','Sales Associate','Cashier','Inventory Executive','Stock Controller','HR Executive','Accountant','Operations Executive','Security Officer','Housekeeping','Delivery Associate','Other'];
const hrDepartments = ['Store Operations','Retail Sales','Inventory & Stock','Finance & Accounts','Human Resources','Customer Service','Logistics','Administration','Security','Other'];
const hrResponsibilities = ['Open and close store','Customer assistance and sales','Billing and cash handling','Product display and merchandising','Stock receiving and verification','Inventory counting and stock transfers','Purchase coordination','Daily sales reporting','Staff scheduling and attendance','Leave coordination','Cash reconciliation and deposits','Customer complaints and returns','Store cleanliness and safety','Branch operations and supervision','Vendor coordination','Payroll input and attendance review'];
const labelClass = 'block text-sm font-medium';
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className={labelClass}>{label}{children}</label>; }
function Empty({ children }: { children: ReactNode }) { return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>; }
function exportCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const quote = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [keys.map(quote).join(','), ...rows.map(row => keys.map(key => quote(row[key])).join(','))].join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
function useHrmMutation(fn: (payload: any) => Promise<any>, onSuccess: () => void, onError: (error: Error) => void) {
  return useMutation({ mutationFn: fn, onSuccess, onError });
}

export function HrmWorkspace() {
  const { data: businesses } = useSuspenseQuery(businessQuery);
  const [selectedBusiness, setSelectedBusiness] = useState('');
  const businessId = authorizedSelection(businesses, selectedBusiness);
  const client = useQueryClient();
  const load = useServerFn(getHrmWorkspace);
  const data = useQuery({ queryKey: ['hrm', businessId], queryFn: () => load({ data: { businessId } }), enabled: Boolean(businessId) });
  const createEmployee = useServerFn(createHrmEmployee);
  const updateEmployee = useServerFn(updateHrmEmployee);
  const saveAttendancePolicy = useServerFn(saveHrmAttendancePolicy);
  const saveAttendance = useServerFn(saveHrmAttendance);
  const clockAttendance = useServerFn(clockHrmAttendance);
  const createLeaveType = useServerFn(createHrmLeaveType);
  const createLeave = useServerFn(createHrmLeaveRequest);
  const reviewLeave = useServerFn(reviewHrmLeaveRequest);
  const saveLeaveBalance = useServerFn(saveHrmLeaveBalanceEntry);
  const createShift = useServerFn(createHrmShift);
  const assignShift = useServerFn(assignHrmShift);
  const saveSalary = useServerFn(saveHrmSalaryStructure);
  const generatePayroll = useServerFn(generateHrmPayroll);
  const approvePayroll = useServerFn(approveHrmPayroll);
  const markPaid = useServerFn(markHrmPayrollPaid);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null);
  const [payDate, setPayDate] = useState(today());
  const [printPayslip, setPrintPayslip] = useState<any>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ['hrm', businessId] });
  const onMutationSuccess = () => { setMessage('Saved successfully.'); setError(''); void refresh(); };
  const onMutationError = (e: Error) => { setError(e.message || 'The request could not be completed.'); setMessage(''); };
  const employeeMutation = useHrmMutation((payload) => createEmployee({ data: payload }), onMutationSuccess, onMutationError);
  const employeeUpdateMutation = useHrmMutation((payload) => updateEmployee({ data: payload }), () => { setEditingEmployee(null); onMutationSuccess(); }, onMutationError);
  const attendancePolicyMutation = useHrmMutation((payload) => saveAttendancePolicy({ data: payload }), onMutationSuccess, onMutationError);
  const attendanceMutation = useHrmMutation((payload) => saveAttendance({ data: payload }), onMutationSuccess, onMutationError);
  const clockMutation = useHrmMutation((payload) => clockAttendance({ data: payload }), onMutationSuccess, onMutationError);
  const leaveTypeMutation = useHrmMutation((payload) => createLeaveType({ data: payload }), onMutationSuccess, onMutationError);
  const leaveMutation = useHrmMutation((payload) => createLeave({ data: payload }), onMutationSuccess, onMutationError);
  const reviewMutation = useHrmMutation((payload) => reviewLeave({ data: payload }), onMutationSuccess, onMutationError);
  const leaveBalanceMutation = useHrmMutation((payload) => saveLeaveBalance({ data: payload }), onMutationSuccess, onMutationError);
  const shiftMutation = useHrmMutation((payload) => createShift({ data: payload }), onMutationSuccess, onMutationError);
  const assignMutation = useHrmMutation((payload) => assignShift({ data: payload }), onMutationSuccess, onMutationError);
  const salaryMutation = useHrmMutation((payload) => saveSalary({ data: payload }), onMutationSuccess, onMutationError);
  const payrollMutation = useHrmMutation((payload) => generatePayroll({ data: payload }), onMutationSuccess, onMutationError);
  const approveMutation = useHrmMutation((payload) => approvePayroll({ data: payload }), onMutationSuccess, onMutationError);
  const paidMutation = useHrmMutation((payload) => markPaid({ data: payload }), onMutationSuccess, onMutationError);
  const employees = data.data?.employees ?? [];
  const members = data.data?.members ?? [];
  const candidates = members.filter((m: any) => !employees.some((e: any) => e.user_id === m.user_id));
  const isAdmin = data.data?.isAdmin ?? false;
  const canPayroll = data.data?.canPayroll ?? false;
  const todayAttendance = (data.data?.attendance ?? []).find((a: any) => a.user_id === data.data?.userId && a.attendance_date === today());
  const totals = useMemo(() => ({
    employees: employees.filter((e: any) => e.employment_status === 'active').length,
    pending: (data.data?.leaveRequests ?? []).filter((x: any) => x.request_status === 'pending').length,
    attendance: (data.data?.attendance ?? []).filter((x: any) => x.attendance_date === today()).length,
    payroll: (data.data?.payrollRuns ?? []).length,
  }), [employees, data.data]);
  const memberOptions = (rows: any[]) => rows.map((m: any) => <option key={m.user_id} value={m.user_id}>{m.employee?.fullName ?? m.user_id.slice(0, 8)} · {m.job_title ?? m.role_code}</option>);
  const employeeOptions = employees.map((e: any) => <option key={e.user_id} value={e.user_id}>{e.employee?.fullName ?? e.employee_number} · {e.employee_number}</option>);

  function submit(form: HTMLFormElement, run: (values: any) => void) {
    const fd = new FormData(form);
    run(Object.fromEntries(fd.entries()));
    form.reset();
  }
  const number = (v: unknown) => Number(v || 0);
  const actionBusy = [employeeMutation,employeeUpdateMutation,attendancePolicyMutation,attendanceMutation,clockMutation,leaveTypeMutation,leaveMutation,reviewMutation,leaveBalanceMutation,shiftMutation,assignMutation,salaryMutation,payrollMutation,approveMutation,paidMutation].some(m => m.isPending);
  useEffect(() => { if (printPayslip) { window.print(); setPrintPayslip(null); } }, [printPayslip]);
  const attendancePolicy = data.data?.attendancePolicy ?? { workday_minutes:480, unpaid_break_minutes:60, grace_minutes:10, overtime_after_minutes:0, overtime_multiplier:1.5 };
  const overtimeFor = (record:any) => { if (!record.check_in || !record.check_out) return 0; const worked = Math.max(0, Math.floor((new Date(record.check_out).getTime()-new Date(record.check_in).getTime())/60000)-Number(attendancePolicy.unpaid_break_minutes||0)); return Math.max(0, worked-Number(attendancePolicy.workday_minutes||480)-Number(attendancePolicy.overtime_after_minutes||0)); };

  if (!businessId) return <main className="mx-auto max-w-6xl px-5 py-8"><h1 className="brand text-2xl">HR & People Management</h1><Empty>Link the AURALUXE business workspace to use HRM.</Empty></main>;
  return <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div><p className="text-xs font-semibold tracking-widest text-primary">BIZSATHI · PEOPLE OPERATIONS</p><h1 className="brand mt-2 text-3xl">HR & People Management</h1><p className="mt-1 text-sm text-muted-foreground">Employees, attendance, leave, shifts and payroll in one workspace.</p></div>
      <Field label="Business"><select aria-label="HRM business" className={inputClass + ' min-w-56'} value={businessId} onChange={e => setSelectedBusiness(e.target.value)}>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
    </header>
    {message && <p role="status" className="mt-4 rounded-lg border p-3 text-sm">{message}</p>}
    {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
    {data.isPending && <p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading HR records…</p>}
    {data.error && <p role="alert" className="my-6 rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{data.error.message}</p>}
    {data.data && <>
      <section className="my-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {label:'Active employees',value:totals.employees,icon:Users},
          {label:'Today attendance records',value:totals.attendance,icon:Clock3},
          {label:'Pending leave requests',value:totals.pending,icon:CalendarDays},
          {label:'Payroll periods',value:totals.payroll,icon:Wallet},
        ].map(item => <article key={item.label} className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{item.label}</span><item.icon className="size-4"/></div><p className="mt-3 text-2xl font-semibold tabular-nums">{item.value}</p></article>)}
      </section>
      <Tabs defaultValue="employees" className="space-y-5">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="employees">Employees</TabsTrigger><TabsTrigger value="attendance">Attendance</TabsTrigger><TabsTrigger value="leave">Leave</TabsTrigger><TabsTrigger value="shifts">Shifts</TabsTrigger>{(isAdmin||canPayroll)&&<TabsTrigger value="reports">Reports</TabsTrigger>}<TabsTrigger value="payroll">Payroll</TabsTrigger>
        </TabsList>
        <TabsContent value="employees" className="space-y-5">
          <HrmDraftEmployeeProfiles businessId={businessId} branches={data.data.branches} isAdmin={isAdmin} />
          {isAdmin && <section className="rounded-xl border p-4 md:p-5"><h2 className="font-semibold">Create employee record</h2><p className="mt-1 text-sm text-muted-foreground">Select an existing active BizSathi member. HRM does not create a duplicate login or a second staff account.</p>
            {candidates.length ? <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const employeeNumber=String(fd.get('employeeNumber')||'').trim()||`EMP-${crypto.randomUUID().slice(0,8).toUpperCase()}`;employeeMutation.mutate({businessId,userId:String(fd.get('userId')),branchId:String(fd.get('branchId')||'')||null,employeeNumber,designation:String(fd.get('designation')||''),department:String(fd.get('department')||''),responsibilities:fd.getAll('responsibilities').map(String),employmentType:String(fd.get('employmentType')||'full_time'),joiningDate:String(fd.get('joiningDate')),employmentStatus:'active'});e.currentTarget.reset();}}>
              <Field label="Existing team member"><select required name="userId" className={inputClass}><option value="">Select member</option>{memberOptions(candidates)}</select></Field>
              <Field label="Employee number (optional)"><input name="employeeNumber" className={inputClass} placeholder="Auto-generated if blank"/></Field>
              <Field label="Branch"><select name="branchId" className={inputClass}><option value="">Unassigned</option>{data.data.branches.map((b:any)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
              <Field label="Job role / designation"><select name="designation" className={inputClass}><option value="">Select role</option>{hrRoles.map(role=><option key={role} value={role}>{role}</option>)}</select></Field>
              <Field label="Department"><select name="department" className={inputClass}>{hrDepartments.map(dept=><option key={dept} value={dept}>{dept}</option>)}</select></Field>
              <fieldset className="sm:col-span-2 lg:col-span-3 rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">Responsibilities</legend><p className="mb-3 text-xs text-muted-foreground">HR job duties only; these do not grant BizSathi application permissions.</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{hrResponsibilities.map(item=><label key={item} className="flex items-start gap-2 text-sm font-normal"><input type="checkbox" name="responsibilities" value={item} className="mt-1"/><span>{item}</span></label>)}</div></fieldset>
              <Field label="Employment type"><select name="employmentType" className={inputClass}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="temporary">Temporary</option><option value="intern">Intern</option></select></Field>
              <Field label="Joining date"><input required type="date" name="joiningDate" defaultValue={today()} className={inputClass}/></Field>
              <div className="flex items-end"><Button type="submit" disabled={actionBusy}>Add employee record</Button></div>
            </form> : <Empty>All active team members already have an employee record, or no active members are available.</Empty>}
          </section>}
<section className="rounded-xl border"><div className="border-b p-4"><h2 className="font-semibold">Employee directory</h2><p className="text-xs text-muted-foreground">Personal HR records are visible to HR administrators and to the employee concerned.</p></div>
            {employees.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Employee','Employee ID','Designation','Department','Branch','Joining date','Exit date','Status',''].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{employees.map((e:any)=><tr key={e.user_id}><td className="px-4 py-3 font-medium">{e.employee?.fullName ?? 'Employee'}</td><td className="px-4 py-3 font-mono text-xs">{e.employee_number}</td><td className="px-4 py-3">{e.designation||'—'}</td><td className="px-4 py-3">{e.department||'—'}</td><td className="px-4 py-3">{data.data.branches.find((b:any)=>b.id===e.branch_id)?.name||'—'}</td><td className="px-4 py-3">{e.joining_date}</td><td className="px-4 py-3">{e.exit_date||'—'}</td><td className="px-4 py-3 capitalize">{e.employment_status.replace('_',' ')}</td><td className="px-4 py-3">{isAdmin&&<Button size="sm" variant="outline" onClick={()=>setEditingEmployee(editingEmployee===e.user_id?null:e.user_id)}>Edit</Button>}</td></tr>)}</tbody></table></div> : <Empty>No employee records are available for this account.</Empty>}
          </section>
          {isAdmin && editingEmployee && (() => { const e=employees.find((row:any)=>row.user_id===editingEmployee); if(!e) return null; return <section className="rounded-xl border p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Edit employee · {e.employee?.fullName}</h2><Button size="sm" variant="ghost" onClick={()=>setEditingEmployee(null)}>Cancel</Button></div>
            <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={event=>{event.preventDefault();const fd=new FormData(event.currentTarget);employeeUpdateMutation.mutate({businessId,userId:e.user_id,employeeNumber:String(fd.get('employeeNumber')),branchId:String(fd.get('branchId')||'')||null,designation:String(fd.get('designation')||''),department:String(fd.get('department')||''),responsibilities:fd.getAll('responsibilities').map(String),employmentType:String(fd.get('employmentType')),joiningDate:String(fd.get('joiningDate')),confirmationDate:String(fd.get('confirmationDate')||'')||null,employmentStatus:String(fd.get('employmentStatus')),exitDate:String(fd.get('exitDate')||'')||null,lastWorkingDate:String(fd.get('lastWorkingDate')||'')||null,exitType:String(fd.get('exitType')||'')||null,exitReason:String(fd.get('exitReason')||''),rehireEligible:fd.get('rehireEligible')==='on',finalSettlementDate:String(fd.get('finalSettlementDate')||'')||null,emergencyContactName:String(fd.get('emergencyContactName')||''),emergencyContactPhone:String(fd.get('emergencyContactPhone')||''),address:String(fd.get('address')||''),notes:String(fd.get('notes')||'')});}}>
              <Field label="Employee number"><input required name="employeeNumber" defaultValue={e.employee_number} className={inputClass}/></Field>
              <Field label="Branch"><select name="branchId" defaultValue={e.branch_id||''} className={inputClass}><option value="">Unassigned</option>{data.data.branches.map((b:any)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
              <Field label="Department"><select name="department" defaultValue={e.department||'Store Operations'} className={inputClass}>{hrDepartments.map(dept=><option key={dept} value={dept}>{dept}</option>)}</select></Field>
              <Field label="Job role / designation"><select name="designation" defaultValue={e.designation||''} className={inputClass}><option value="">Select role</option>{hrRoles.map(role=><option key={role} value={role}>{role}</option>)}</select></Field>
              <fieldset className="sm:col-span-2 lg:col-span-3 rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">Responsibilities</legend><p className="mb-3 text-xs text-muted-foreground">HR job duties only; app access is managed separately under Team & Access.</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{hrResponsibilities.map(item=><label key={item} className="flex items-start gap-2 text-sm font-normal"><input type="checkbox" name="responsibilities" value={item} defaultChecked={(e.responsibilities||[]).includes(item)} className="mt-1"/><span>{item}</span></label>)}</div></fieldset>
              <Field label="Employment type"><select name="employmentType" defaultValue={e.employment_type} className={inputClass}>{['full_time','part_time','contract','temporary','intern'].map(v=><option key={v} value={v}>{v.replace('_',' ')}</option>)}</select></Field>
              <Field label="Employment status"><select name="employmentStatus" defaultValue={e.employment_status} className={inputClass}>{['active','on_leave','suspended','terminated'].map(v=><option key={v} value={v}>{v.replace('_',' ')}</option>)}</select></Field>
              <Field label="Joining date"><input required type="date" name="joiningDate" defaultValue={e.joining_date} className={inputClass}/></Field>
              <Field label="Confirmation date"><input type="date" name="confirmationDate" defaultValue={e.confirmation_date||''} className={inputClass}/></Field>
              <Field label="Emergency contact name"><input name="emergencyContactName" defaultValue={e.emergency_contact_name||''} className={inputClass}/></Field>
              <Field label="Emergency contact phone"><input name="emergencyContactPhone" defaultValue={e.emergency_contact_phone||''} className={inputClass}/></Field>
              <Field label="Address"><input name="address" defaultValue={e.address||''} className={inputClass}/></Field>
              <Field label="HR notes"><input name="notes" defaultValue={e.notes||''} className={inputClass}/></Field>
              <div className="sm:col-span-2 lg:col-span-3 rounded-lg border p-3"><h3 className="text-sm font-semibold">Exit & final settlement details</h3><p className="mt-1 mb-3 text-xs text-muted-foreground">Use this section when an employee leaves. Their record and history are retained; do not delete the employee.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Exit date"><input type="date" name="exitDate" defaultValue={e.exit_date||''} className={inputClass}/></Field>
                <Field label="Last working date"><input type="date" name="lastWorkingDate" defaultValue={e.last_working_date||''} className={inputClass}/></Field>
                <Field label="Exit type"><select name="exitType" defaultValue={e.exit_type||''} className={inputClass}><option value="">Select reason</option><option value="resignation">Resignation</option><option value="termination">Termination</option><option value="contract_end">Contract ended</option><option value="retirement">Retirement</option><option value="absconded">Absconded</option><option value="other">Other</option></select></Field>
                <Field label="Exit reason"><input name="exitReason" defaultValue={e.exit_reason||''} className={inputClass} maxLength={1000}/></Field>
                <Field label="Final settlement date"><input type="date" name="finalSettlementDate" defaultValue={e.final_settlement_date||''} className={inputClass}/></Field>
                <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" name="rehireEligible" defaultChecked={e.rehire_eligible!==false}/> Eligible for rehire</label>
              </div></div>
              <div className="flex items-end"><Button type="submit" disabled={actionBusy}>Save employee changes</Button></div>
            </form></section>; })()}
        </TabsContent>
        <TabsContent value="attendance" className="space-y-5">
          {employees.some((e:any)=>e.user_id===data.data.userId) && <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
            <div><h2 className="font-semibold">My attendance clock</h2><p className="mt-1 text-sm text-muted-foreground">{todayAttendance?.check_in ? `Checked in at ${new Date(todayAttendance.check_in).toLocaleTimeString()}` : 'You have not checked in today.'}{todayAttendance?.check_out ? ` · Checked out at ${new Date(todayAttendance.check_out).toLocaleTimeString()}` : ''}</p></div>
            {!todayAttendance?.check_in
              ? <Button disabled={actionBusy} onClick={()=>clockMutation.mutate({businessId,attendanceDate:today(),direction:'check_in'})}>Check in</Button>
              : !todayAttendance.check_out
                ? <Button disabled={actionBusy} onClick={()=>clockMutation.mutate({businessId,attendanceDate:today(),direction:'check_out'})}>Check out</Button>
                : <span className="rounded-full bg-muted px-3 py-2 text-sm font-medium">Attendance completed</span>}
          </section>}
          {isAdmin && employees.length>0 && <section className="rounded-xl border p-4"><h2 className="font-semibold">Record attendance</h2><form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);attendanceMutation.mutate({businessId,userId:String(fd.get('userId')),branchId:String(fd.get('branchId')||'')||null,attendanceDate:String(fd.get('attendanceDate')),attendanceStatus:String(fd.get('attendanceStatus')),checkIn:fd.get('checkIn')?new Date(`${fd.get('attendanceDate')}T${fd.get('checkIn')}:00`).toISOString():null,checkOut:fd.get('checkOut')?new Date(`${fd.get('attendanceDate')}T${fd.get('checkOut')}:00`).toISOString():null,notes:String(fd.get('notes')||'')});e.currentTarget.reset();}}>
            <Field label="Employee"><select required name="userId" className={inputClass}><option value="">Select employee</option>{employeeOptions}</select></Field>
            <Field label="Date"><input required type="date" name="attendanceDate" defaultValue={today()} className={inputClass}/></Field>
            <Field label="Status"><select name="attendanceStatus" className={inputClass}><option value="present">Present</option><option value="late">Late</option><option value="half_day">Half day</option><option value="absent">Absent</option><option value="holiday">Holiday</option><option value="week_off">Weekly off</option></select></Field>
            <Field label="Branch"><select name="branchId" className={inputClass}><option value="">Unassigned</option>{data.data.branches.map((b:any)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <Field label="Check in"><input type="time" name="checkIn" className={inputClass}/></Field><Field label="Check out"><input type="time" name="checkOut" className={inputClass}/></Field>
            <Field label="Notes"><input name="notes" className={inputClass} maxLength={500}/></Field><div className="flex items-end"><Button type="submit" disabled={actionBusy}>Save attendance</Button></div>
          </form></section>}
          {isAdmin && <section className="rounded-xl border p-4"><h2 className="font-semibold">Attendance & overtime policy</h2><p className="mt-1 text-xs text-muted-foreground">Overtime is estimated for review only; it is not automatically added to payroll.</p><form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);attendancePolicyMutation.mutate({businessId,workdayMinutes:number(fd.get('workdayMinutes')),unpaidBreakMinutes:number(fd.get('unpaidBreakMinutes')),graceMinutes:number(fd.get('graceMinutes')),overtimeAfterMinutes:number(fd.get('overtimeAfterMinutes')),overtimeMultiplier:number(fd.get('overtimeMultiplier'))});}}><Field label="Workday minutes"><input type="number" min="60" max="1440" name="workdayMinutes" defaultValue={attendancePolicy.workday_minutes} className={inputClass}/></Field><Field label="Unpaid break minutes"><input type="number" min="0" max="480" name="unpaidBreakMinutes" defaultValue={attendancePolicy.unpaid_break_minutes} className={inputClass}/></Field><Field label="Late grace minutes"><input type="number" min="0" max="240" name="graceMinutes" defaultValue={attendancePolicy.grace_minutes} className={inputClass}/></Field><Field label="Overtime starts after extra minutes"><input type="number" min="0" max="720" name="overtimeAfterMinutes" defaultValue={attendancePolicy.overtime_after_minutes} className={inputClass}/></Field><Field label="Overtime multiplier (estimate)"><input type="number" min="1" max="3" step="0.1" name="overtimeMultiplier" defaultValue={attendancePolicy.overtime_multiplier} className={inputClass}/></Field><div className="flex items-end"><Button type="submit" disabled={actionBusy}>Save attendance policy</Button></div></form></section>}
          <section className="rounded-xl border"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Attendance register</h2><p className="text-xs text-muted-foreground">Latest 150 records · export the currently loaded register to CSV.</p></div><Button size="sm" variant="outline" disabled={!data.data.attendance.length} onClick={()=>exportCsv(`attendance-${today()}.csv`,data.data.attendance.map((a:any)=>({date:a.attendance_date,employee:a.employee?.fullName,status:a.attendance_status,check_in:a.check_in,check_out:a.check_out,notes:a.notes,branch_id:a.branch_id}))) }>Export CSV</Button></div>
            {data.data.attendance.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Date','Employee','Status','Check in','Check out','Overtime (estimate)','Notes'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{data.data.attendance.map((a:any)=><tr key={a.id}><td className="px-4 py-3">{a.attendance_date}</td><td className="px-4 py-3">{a.employee.fullName}</td><td className="px-4 py-3 capitalize">{a.attendance_status.replace('_',' ')}</td><td className="px-4 py-3">{a.check_in?new Date(a.check_in).toLocaleTimeString():'—'}</td><td className="px-4 py-3">{a.check_out?new Date(a.check_out).toLocaleTimeString():'—'}</td><td className="px-4 py-3">{overtimeFor(a)>0?`${Math.floor(overtimeFor(a)/60)}h ${overtimeFor(a)%60}m`: '—'}</td><td className="px-4 py-3">{a.notes||'—'}</td></tr>)}</tbody></table></div> : <Empty>No attendance records yet.</Empty>}
          </section>
        </TabsContent>
        <TabsContent value="leave" className="space-y-5">
          <section className="rounded-xl border p-4"><h2 className="font-semibold">Request leave</h2>
            {!employees.some((e:any)=>e.user_id===data.data.userId) ? <p className="mt-2 text-sm text-muted-foreground">An employee profile is required before submitting leave. Ask an administrator to add your employee record.</p> :
            <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);leaveMutation.mutate({businessId,leaveTypeId:String(fd.get('leaveTypeId')),startDate:String(fd.get('startDate')),endDate:String(fd.get('endDate')),days:number(fd.get('days')),reason:String(fd.get('reason')||'')});e.currentTarget.reset();}}>
              <Field label="Leave type"><select required name="leaveTypeId" className={inputClass}><option value="">Select type</option>{data.data.leaveTypes.map((t:any)=><option key={t.id} value={t.id}>{t.name} · {t.is_paid?'Paid':'Unpaid'}</option>)}</select></Field>
              <Field label="From"><input required type="date" name="startDate" defaultValue={today()} className={inputClass}/></Field><Field label="To"><input required type="date" name="endDate" defaultValue={today()} className={inputClass}/></Field>
              <Field label="Days"><input required type="number" name="days" min="0.5" step="0.5" defaultValue="1" className={inputClass}/></Field>
              <Field label="Reason"><input name="reason" maxLength={1000} className={inputClass}/></Field><div className="flex items-end"><Button type="submit" disabled={actionBusy||!data.data.leaveTypes.length}>Submit request</Button></div>
            </form>}
            {isAdmin && <form className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);leaveTypeMutation.mutate({businessId,name:String(fd.get('name')),annualQuota:number(fd.get('annualQuota')),isPaid:fd.get('isPaid')==='on',accrualMethod:String(fd.get('accrualMethod')||'front_loaded')});e.currentTarget.reset();}}>
              <Field label="New leave type"><input required name="name" placeholder="e.g. Annual Leave" className={inputClass}/></Field><Field label="Annual quota (days)"><input required type="number" name="annualQuota" min="0" max="366" defaultValue="12" className={inputClass}/></Field><Field label="Accrual method"><select name="accrualMethod" className={inputClass}><option value="front_loaded">Front-loaded yearly</option><option value="monthly">Monthly accrual</option></select></Field><label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="isPaid" defaultChecked/>Paid leave</label><Button type="submit" variant="outline" disabled={actionBusy}>Add leave type</Button>
            </form>}
          </section>
          {isAdmin && <section className="rounded-xl border p-4">
            <h2 className="font-semibold">Opening balance, carry-forward & adjustments</h2>
            <p className="mt-1 text-xs text-muted-foreground">Every entry is appended to an audit ledger. Historical entries cannot be edited or deleted. Use a positive number to add days and a negative number to reduce days.</p>
            {employees.length > 0 && data.data.leaveTypes.length > 0 ? <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);leaveBalanceMutation.mutate({businessId,userId:String(fd.get('userId')),leaveTypeId:String(fd.get('leaveTypeId')),leaveYear:number(fd.get('leaveYear')),entryType:String(fd.get('entryType')),deltaDays:number(fd.get('deltaDays')),notes:String(fd.get('notes')||'')});e.currentTarget.reset();}}>
              <Field label="Employee"><select required name="userId" className={inputClass}><option value="">Select employee</option>{employeeOptions}</select></Field>
              <Field label="Leave type"><select required name="leaveTypeId" className={inputClass}><option value="">Select leave type</option>{data.data.leaveTypes.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
              <Field label="Leave year"><input required type="number" name="leaveYear" min="2000" max="2200" defaultValue={Number(today().slice(0,4))} className={inputClass}/></Field>
              <Field label="Entry type"><select name="entryType" className={inputClass}><option value="opening_balance">Opening balance</option><option value="carry_forward">Carry-forward</option><option value="adjustment">Manual adjustment</option></select></Field>
              <Field label="Days (+ add / − reduce)"><input required type="number" name="deltaDays" step="0.5" min="-3660" max="3660" className={inputClass}/></Field>
              <Field label="Reason / reference"><input name="notes" maxLength={500} className={inputClass} placeholder="Required for manual adjustments"/></Field>
              <div className="flex items-end"><Button type="submit" disabled={actionBusy}>Post balance entry</Button></div>
            </form> : <Empty>Add an employee and an active leave type before posting balances.</Empty>}
          </section>}
          {(isAdmin || employees.some((e:any)=>e.user_id===data.data.userId)) && <section className="rounded-xl border">
            <div className="border-b p-4"><h2 className="font-semibold">Leave balance overview · {today().slice(0,4)}</h2><p className="text-xs text-muted-foreground">Accrued entitlement is calculated from the configured front-loaded or monthly policy. Opening balances, carry-forward, corrections and approved leave come from the append-only ledger.</p></div>
            {(() => {
              const year = Number(today().slice(0,4));
              const month = Number(today().slice(5,7));
              const visibleEmployees = employees.filter((e:any)=>isAdmin || e.user_id===data.data.userId);
              const rows = visibleEmployees.flatMap((e:any)=>data.data.leaveTypes.map((t:any)=>{
                const annual=Number(t.annual_quota||0);
                const accrued=t.accrual_method==='monthly'?annual*month/12:annual;
                const entries=(data.data.leaveBalanceEntries??[]).filter((entry:any)=>entry.user_id===e.user_id && entry.leave_type_id===t.id && Number(entry.leave_year)===year);
                const ledgerDelta=entries.reduce((sum:number,entry:any)=>sum+Number(entry.delta_days||0),0);
                const used=-entries.filter((entry:any)=>entry.entry_type==='leave_taken'||entry.entry_type==='leave_reversal').reduce((sum:number,entry:any)=>sum+Number(entry.delta_days||0),0);
                const adjustments=entries.filter((entry:any)=>entry.entry_type!=='leave_taken'&&entry.entry_type!=='leave_reversal').reduce((sum:number,entry:any)=>sum+Number(entry.delta_days||0),0);
                return {employee:e.employee?.fullName||e.employee_number,type:t.name,quota:annual,accrued,used,adjustments,remaining:accrued+ledgerDelta};
              }));
              return rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Employee','Leave type','Annual quota','Accrued to date','Ledger adjustments','Approved used','Available balance'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{rows.map((r:any,i:number)=><tr key={i}><td className="px-4 py-3 font-medium">{r.employee}</td><td className="px-4 py-3">{r.type}</td><td className="px-4 py-3">{r.quota.toFixed(1)}</td><td className="px-4 py-3">{r.accrued.toFixed(1)}</td><td className="px-4 py-3">{r.adjustments.toFixed(1)}</td><td className="px-4 py-3">{r.used.toFixed(1)}</td><td className="px-4 py-3 font-semibold">{r.remaining.toFixed(1)}</td></tr>)}</tbody></table></div> : <Empty>Add an employee and leave type to see the balance overview.</Empty>;
            })()}
            <div className="border-t p-4"><h3 className="font-semibold text-sm">Recent ledger entries</h3>{(data.data.leaveBalanceEntries??[]).length ? <div className="mt-2 divide-y">{data.data.leaveBalanceEntries.slice(0,20).map((entry:any)=><div key={entry.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{employees.find((e:any)=>e.user_id===entry.user_id)?.employee?.fullName||'Employee'} · {data.data.leaveTypes.find((t:any)=>t.id===entry.leave_type_id)?.name||'Leave'} · <span className="capitalize">{entry.entry_type.replace('_',' ')}</span></span><span className="tabular-nums">{Number(entry.delta_days)>0?'+':''}{Number(entry.delta_days).toFixed(2)} days · {entry.leave_year}</span></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No balance entries have been posted yet. Approved leave will appear here automatically. Approvals are blocked when the calculated balance is insufficient; an administrator can use Override & approve only with a recorded reason.</p>}</div>
          </section>}
          <section className="rounded-xl border"><div className="border-b p-4"><h2 className="font-semibold">Leave requests</h2></div>
            {data.data.leaveRequests.length ? <div className="divide-y">{data.data.leaveRequests.map((l:any)=><article key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{l.employee.fullName} · {data.data.leaveTypes.find((t:any)=>t.id===l.leave_type_id)?.name||'Leave'}</p><p className="text-sm text-muted-foreground">{l.start_date} to {l.end_date} · {l.days} day(s) · <span className="capitalize">{l.request_status}</span></p>{l.reason&&<p className="mt-1 text-sm">{l.reason}</p>}</div>{isAdmin&&l.request_status==='pending'&&<div className="flex flex-wrap gap-2"><Button size="sm" disabled={actionBusy} onClick={()=>reviewMutation.mutate({businessId,requestId:l.id,decision:'approved'})}>Approve</Button><Button size="sm" variant="outline" disabled={actionBusy} onClick={()=>reviewMutation.mutate({businessId,requestId:l.id,decision:'rejected'})}>Reject</Button><Button size="sm" variant="secondary" disabled={actionBusy} onClick={()=>{const reason=window.prompt('Administrator override reason (required)');if(reason?.trim())reviewMutation.mutate({businessId,requestId:l.id,decision:'approved',overrideReason:reason.trim()});}}>Override &amp; approve</Button></div>}</article>)}</div> : <Empty>No leave requests yet.</Empty>}
          </section>
        </TabsContent>
        <TabsContent value="shifts" className="space-y-5">
          {isAdmin && <section className="rounded-xl border p-4"><h2 className="font-semibold">Create shift</h2><form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);shiftMutation.mutate({businessId,name:String(fd.get('name')),startTime:String(fd.get('startTime')),endTime:String(fd.get('endTime')),breakMinutes:number(fd.get('breakMinutes'))});e.currentTarget.reset();}}>
            <Field label="Shift name"><input required name="name" className={inputClass} placeholder="Morning"/></Field><Field label="Start time"><input required type="time" name="startTime" defaultValue="09:00" className={inputClass}/></Field><Field label="End time"><input required type="time" name="endTime" defaultValue="18:00" className={inputClass}/></Field><Field label="Break (minutes)"><input type="number" min="0" max="480" name="breakMinutes" defaultValue="60" className={inputClass}/></Field><div className="flex items-end"><Button type="submit" disabled={actionBusy}>Create shift</Button></div>
          </form></section>}
          {isAdmin && data.data.shifts.length>0 && employees.length>0 && <section className="rounded-xl border p-4"><h2 className="font-semibold">Assign shift</h2><form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);assignMutation.mutate({businessId,userId:String(fd.get('userId')),shiftId:String(fd.get('shiftId')),shiftDate:String(fd.get('shiftDate')),branchId:String(fd.get('branchId')||'')||null});e.currentTarget.reset();}}>
            <Field label="Employee"><select required name="userId" className={inputClass}><option value="">Select employee</option>{employeeOptions}</select></Field><Field label="Shift"><select required name="shiftId" className={inputClass}>{data.data.shifts.map((s:any)=><option key={s.id} value={s.id}>{s.name} · {s.start_time.slice(0,5)}–{s.end_time.slice(0,5)}</option>)}</select></Field><Field label="Date"><input required type="date" name="shiftDate" defaultValue={today()} className={inputClass}/></Field><Field label="Branch"><select name="branchId" className={inputClass}><option value="">Unassigned</option>{data.data.branches.map((b:any)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><div className="flex items-end"><Button type="submit" disabled={actionBusy}>Assign shift</Button></div>
          </form></section>}
          <section className="rounded-xl border p-4"><h2 className="font-semibold">Shift roster</h2>{data.data.assignments.length ? <div className="mt-3 divide-y">{data.data.assignments.map((a:any)=><div key={a.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{a.employee.fullName} · {data.data.shifts.find((s:any)=>s.id===a.shift_id)?.name||'Shift'}</span><span className="text-muted-foreground">{a.shift_date}</span></div>)}</div> : <Empty>No shifts have been assigned.</Empty>}</section>
        </TabsContent>
        {(isAdmin||canPayroll) && <TabsContent value="reports" className="space-y-5">
          <HrmReportsPanel businessId={businessId} isAdmin={isAdmin} canPayroll={canPayroll} branches={data.data.branches} attendancePolicy={attendancePolicy}/>
        </TabsContent>}
        <TabsContent value="payroll" className="space-y-5">
          {canPayroll ? <>
            {canPayroll && employees.length>0 && <section className="rounded-xl border p-4"><h2 className="font-semibold">Salary structure</h2><p className="mt-1 text-xs text-muted-foreground">Salary details are restricted to payroll-authorized users and are not shown in the general employee directory.</p>
              <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const n=(k:string)=>number(fd.get(k));salaryMutation.mutate({businessId,userId:String(fd.get('userId')),effectiveFrom:String(fd.get('effectiveFrom')),basicSalary:n('basicSalary'),houseAllowance:n('houseAllowance'),transportAllowance:n('transportAllowance'),otherAllowance:n('otherAllowance'),taxDeduction:n('taxDeduction'),providentFund:n('providentFund'),insuranceDeduction:n('insuranceDeduction'),otherDeduction:n('otherDeduction')});e.currentTarget.reset();}}>
                <Field label="Employee"><select required name="userId" className={inputClass}><option value="">Select employee</option>{employeeOptions}</select></Field><Field label="Effective from"><input required type="date" name="effectiveFrom" defaultValue={today()} className={inputClass}/></Field>
                {['basicSalary','houseAllowance','transportAllowance','otherAllowance','taxDeduction','providentFund','insuranceDeduction','otherDeduction'].map((k,i)=><Field key={k} label={['Basic salary','House allowance','Transport allowance','Other allowance','Tax deduction','Provident fund','Insurance deduction','Other deduction'][i]}><input type="number" min="0" step="0.01" name={k} defaultValue={k==='basicSalary'?'0':'0'} className={inputClass}/></Field>)}
                <div className="flex items-end"><Button type="submit" disabled={actionBusy}>Save salary structure</Button></div>
              </form>
            </section>}
            <section className="rounded-xl border p-4"><h2 className="font-semibold">Generate payroll</h2><p className="mt-1 text-xs text-muted-foreground">Payroll snapshots the latest effective salary and approved unpaid leave. It does not transfer money or post accounting entries.</p>
              <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);payrollMutation.mutate({businessId,periodStart:String(fd.get('periodStart')),periodEnd:String(fd.get('periodEnd')),periodLabel:String(fd.get('periodLabel'))});e.currentTarget.reset();}}>
                <Field label="Period label"><input required name="periodLabel" className={inputClass} placeholder="November 2026"/></Field><Field label="Start date"><input required type="date" name="periodStart" className={inputClass}/></Field><Field label="End date"><input required type="date" name="periodEnd" className={inputClass}/></Field><div className="flex items-end"><Button type="submit" disabled={actionBusy}>Generate draft payroll</Button></div>
              </form>
            </section>
            <section className="rounded-xl border"><div className="flex flex-wrap items-end justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Payroll history</h2><p className="text-xs text-muted-foreground">Record the actual salary payment date when confirming payment.</p></div><Field label="Payment date"><input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} className={inputClass}/></Field></div>
              {data.data.payrollRuns.length ? <div className="divide-y">{data.data.payrollRuns.map((p:any)=><article key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{p.period_label} · {p.employee_count} employees</p><p className="text-sm text-muted-foreground">Gross {money(p.gross_total)} · Deductions {money(p.deduction_total)} · Net {money(p.net_total)} · <span className="capitalize">{p.run_status}</span>{p.paid_at ? ` · Paid on ${new Date(p.paid_at).toLocaleDateString()}` : ''}</p></div><div className="flex gap-2">{p.run_status==='draft'&&<Button size="sm" disabled={actionBusy} onClick={()=>approveMutation.mutate({businessId,runId:p.id})}>Approve</Button>}{isAdmin&&p.run_status==='approved'&&<Button size="sm" disabled={actionBusy||!payDate} onClick={()=>paidMutation.mutate({businessId,runId:p.id,paidDate:payDate})}>Mark paid</Button>}</div></article>)}</div> : <Empty>No payroll runs yet. Add salary structures before generating payroll.</Empty>}
            </section>
            <section className="rounded-xl border"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Payslip details</h2><p className="text-xs text-muted-foreground">Export the payroll snapshot currently available to your role.</p></div><Button size="sm" variant="outline" disabled={!data.data.payrollItems.length} onClick={()=>exportCsv(`payslips-${today()}.csv`,data.data.payrollItems.map((p:any)=>({period:p.period_label,employee:p.employee_name,basic_salary:p.basic_salary,allowances:p.allowances,gross_pay:p.gross_pay,fixed_deductions:p.fixed_deductions,unpaid_leave_days:p.unpaid_leave_days,unpaid_leave_deduction:p.unpaid_leave_deduction,total_deductions:p.total_deductions,net_pay:p.net_pay}))) }>Export CSV</Button></div>
              {data.data.payrollItems.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Period','Employee','Basic','Allowances','Gross','Deductions','Unpaid leave','Net pay',''].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{data.data.payrollItems.map((p:any)=><tr key={p.id}><td className="px-4 py-3">{p.period_label}</td><td className="px-4 py-3">{p.employee_name}</td><td className="px-4 py-3">{money(p.basic_salary)}</td><td className="px-4 py-3">{money(p.allowances)}</td><td className="px-4 py-3">{money(p.gross_pay)}</td><td className="px-4 py-3">{money(p.total_deductions)}</td><td className="px-4 py-3">{p.unpaid_leave_days}</td><td className="px-4 py-3 font-semibold">{money(p.net_pay)}</td><td className="px-4 py-3"><Button size="sm" variant="outline" onClick={()=>setPrintPayslip(p)}>Print</Button></td></tr>)}</tbody></table></div> : <Empty>No payslip snapshots are available.</Empty>}
            </section>
          </> : data.data.payrollItems.length ? <section className="rounded-xl border"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">My approved payslips</h2><p className="text-xs text-muted-foreground">Only approved or paid payroll snapshots are released to employees.</p></div><Button size="sm" variant="outline" disabled={!data.data.payrollItems.length} onClick={()=>exportCsv(`my-payslips-${today()}.csv`,data.data.payrollItems.map((p:any)=>({period:p.period_label,basic_salary:p.basic_salary,allowances:p.allowances,gross_pay:p.gross_pay,total_deductions:p.total_deductions,net_pay:p.net_pay}))) }>Export CSV</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Period','Basic','Allowances','Gross','Deductions','Net pay',''].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{data.data.payrollItems.map((p:any)=><tr key={p.id}><td className="px-4 py-3">{p.period_label}</td><td className="px-4 py-3">{money(p.basic_salary)}</td><td className="px-4 py-3">{money(p.allowances)}</td><td className="px-4 py-3">{money(p.gross_pay)}</td><td className="px-4 py-3">{money(p.total_deductions)}</td><td className="px-4 py-3 font-semibold">{money(p.net_pay)}</td><td className="px-4 py-3"><Button size="sm" variant="outline" onClick={()=>setPrintPayslip(p)}>Print</Button></td></tr>)}</tbody></table></div></section> : <Empty>Your approved payslips will appear here after payroll is approved.</Empty>}
        </TabsContent>
      </Tabs>
      {printPayslip && <><style>{'@media print { body * { visibility: hidden !important; } #hrm-print-slip, #hrm-print-slip * { visibility: visible !important; } #hrm-print-slip { display:block !important; position:absolute; inset:0 auto auto 0; width:100%; padding:32px; background:white; color:#111; } }'}</style><section id="hrm-print-slip" className="hidden print:block"><div style={{maxWidth:720,margin:'0 auto',fontFamily:'Arial,sans-serif'}}><h1 style={{fontSize:24,fontWeight:700}}>PAYSLIP</h1><p>BizSathi · {printPayslip.period_label}</p><hr style={{margin:'20px 0'}}/><p><strong>Employee:</strong> {printPayslip.employee_name || 'Employee'}</p><p><strong>Period:</strong> {printPayslip.period_start} to {printPayslip.period_end}</p><table style={{width:'100%',borderCollapse:'collapse',marginTop:24}}><tbody>{[['Basic salary',printPayslip.basic_salary],['Allowances',printPayslip.allowances],['Gross pay',printPayslip.gross_pay],['Tax deduction',printPayslip.tax_deduction],['Provident fund',printPayslip.provident_fund],['Insurance deduction',printPayslip.insurance_deduction],['Other deduction',printPayslip.other_deduction],['Unpaid leave deduction',printPayslip.unpaid_leave_deduction],['Total deductions',printPayslip.total_deductions],['Net pay',printPayslip.net_pay]].map(([label,value]:any)=><tr key={label}><td style={{padding:'10px 4px',borderBottom:'1px solid #ddd'}}>{label}</td><td style={{padding:'10px 4px',borderBottom:'1px solid #ddd',textAlign:'right'}}>{money(value)}</td></tr>)}</tbody></table><p style={{marginTop:28,fontSize:12}}>This payslip is an HR payroll snapshot. Statutory deductions are subject to employer verification.</p></div></section></>}
    </>}
    <p className="mt-6 text-xs text-muted-foreground">Payroll figures are draft records until approved. Marking payroll paid is a manual status confirmation only; bank transfers and general-ledger posting are not performed by this HRM module.</p>
  </main>;
}

function HrmReportsPanel({businessId,isAdmin,canPayroll,branches,attendancePolicy}:{businessId:string;isAdmin:boolean;canPayroll:boolean;branches:any[];attendancePolicy:any}) {
  const load = useServerFn(getHrmReports);
  const [from,setFrom] = useState(()=>`${today().slice(0,7)}-01`);
  const [to,setTo] = useState(today);
  const [branchId,setBranchId] = useState('all');
  const days = (Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000;
  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from<=to && days<=366;
  const report = useQuery({
    queryKey:['hrm-reports',businessId,from,to,branchId],
    queryFn:()=>load({data:{businessId,from,to,branchId:branchId==='all'?null:branchId}}),
    enabled:Boolean(businessId && validRange && (isAdmin||canPayroll)),
  });
  const rows = report.data;
  const branchName = (id:string|null|undefined) => branches.find(b=>b.id===id)?.name ?? 'Unassigned';
  const employeeName = (id:string) => rows?.employees.find((e:any)=>e.user_id===id)?.full_name ?? rows?.employees.find((e:any)=>e.user_id===id)?.employee_number ?? 'Employee';
  const employeeBranch = (id:string) => rows?.employees.find((e:any)=>e.user_id===id)?.branch_id ?? null;
  const attendanceRows = rows?.attendance ?? [];
  const leaveRows = rows?.leaveRequests ?? [];
  const payrollRows = rows?.payrollItems ?? [];
  const payrollStatus = (id:string) => rows?.payrollRuns.find((run:any)=>run.id===id)?.run_status ?? '—';
  const overtimeMinutes = (record:any) => {
    if(!record.check_in||!record.check_out) return 0;
    const worked=Math.max(0,Math.floor((new Date(record.check_out).getTime()-new Date(record.check_in).getTime())/60000)-Number(attendancePolicy.unpaid_break_minutes||0));
    return Math.max(0,worked-Number(attendancePolicy.workday_minutes||480)-Number(attendancePolicy.overtime_after_minutes||0));
  };
  const summaryBranches = [...branches.map(b=>({id:b.id,name:b.name})),{id:null,name:'Unassigned'}].filter(b=>{
    const hasAttendance=attendanceRows.some((r:any)=>r.branch_id===b.id);
    const hasLeave=leaveRows.some((r:any)=>employeeBranch(r.user_id)===b.id);
    const hasPayroll=payrollRows.some((r:any)=>employeeBranch(r.user_id)===b.id);
    return hasAttendance||hasLeave||hasPayroll||(branchId!=='all'&&b.id===branchId);
  });
  return <>
    <section className="rounded-xl border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From date"><input type="date" value={from} onChange={e=>setFrom(e.target.value)} className={inputClass}/></Field>
        <Field label="Through date"><input type="date" value={to} onChange={e=>setTo(e.target.value)} className={inputClass}/></Field>
        <Field label="Branch"><select value={branchId} onChange={e=>setBranchId(e.target.value)} className={inputClass}><option value="all">All branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Choose up to 367 days. Attendance and leave reports are available to HR administrators; payroll reports require payroll permission.</p>
      {!validRange&&<p role="alert" className="mt-2 text-sm text-destructive">Choose a valid date range of no more than 367 days.</p>}
    </section>
    {report.isPending&&validRange&&<p role="status" className="py-8 text-center text-sm text-muted-foreground">Preparing HR reports…</p>}
    {report.error&&<p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{report.error.message}</p>}
    {rows&&<>
      {summaryBranches.length>0&&<section className="rounded-xl border p-4">
        <h2 className="font-semibold">Branch-wise summary</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Branch','Attendance records','Late / absent','Leave requests','Approved leave days','Payroll gross','Payroll net'].map(x=><th key={x} className="px-3 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{summaryBranches.map(b=>{
          const a=attendanceRows.filter((r:any)=>r.branch_id===b.id);
          const l=leaveRows.filter((r:any)=>employeeBranch(r.user_id)===b.id);
          const p=payrollRows.filter((r:any)=>employeeBranch(r.user_id)===b.id);
          return <tr key={b.id??'unassigned'}><td className="px-3 py-3 font-medium">{b.name}</td><td className="px-3 py-3">{isAdmin?a.length:'—'}</td><td className="px-3 py-3">{isAdmin?a.filter((r:any)=>r.attendance_status==='late'||r.attendance_status==='absent').length:'—'}</td><td className="px-3 py-3">{isAdmin?l.length:'—'}</td><td className="px-3 py-3">{isAdmin?l.filter((r:any)=>r.request_status==='approved').reduce((n:number,r:any)=>n+Number(r.days||0),0).toFixed(1):'—'}</td><td className="px-3 py-3">{canPayroll?money(p.reduce((n:number,r:any)=>n+Number(r.gross_pay||0),0)):'—'}</td><td className="px-3 py-3 font-semibold">{canPayroll?money(p.reduce((n:number,r:any)=>n+Number(r.net_pay||0),0)):'—'}</td></tr>;
        })}</tbody></table></div>
        {canPayroll&&<p className="mt-2 text-xs text-muted-foreground">Payroll branch totals use each employee’s current HR branch assignment; payroll snapshots do not yet preserve historical branch transfers.</p>}
      </section>}
      {isAdmin&&<section className="rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Attendance report</h2><p className="text-xs text-muted-foreground">{attendanceRows.length} records · {from} to {to}</p></div><Button size="sm" variant="outline" disabled={!attendanceRows.length} onClick={()=>exportCsv(`hr-attendance-${from}-to-${to}.csv`,attendanceRows.map((r:any)=>({date:r.attendance_date,employee:employeeName(r.user_id),branch:branchName(r.branch_id),status:r.attendance_status,check_in:r.check_in,check_out:r.check_out,overtime_minutes:overtimeMinutes(r),notes:r.notes}))) }>Export CSV</Button></div>
        {attendanceRows.length?<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Date','Employee','Branch','Status','Check in','Check out','Overtime estimate'].map(x=><th key={x} className="px-3 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{attendanceRows.map((r:any)=><tr key={r.id}><td className="px-3 py-3">{r.attendance_date}</td><td className="px-3 py-3 font-medium">{employeeName(r.user_id)}</td><td className="px-3 py-3">{branchName(r.branch_id)}</td><td className="px-3 py-3 capitalize">{r.attendance_status.replace('_',' ')}</td><td className="px-3 py-3">{r.check_in?new Date(r.check_in).toLocaleTimeString():'—'}</td><td className="px-3 py-3">{r.check_out?new Date(r.check_out).toLocaleTimeString():'—'}</td><td className="px-3 py-3">{overtimeMinutes(r)?`${Math.floor(overtimeMinutes(r)/60)}h ${overtimeMinutes(r)%60}m`:'—'}</td></tr>)}</tbody></table></div>:<Empty>No attendance records match this date range and branch.</Empty>}
      </section>}
      {isAdmin&&<section className="rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Leave report</h2><p className="text-xs text-muted-foreground">{leaveRows.length} requests overlapping {from} to {to}</p></div><Button size="sm" variant="outline" disabled={!leaveRows.length} onClick={()=>exportCsv(`hr-leave-${from}-to-${to}.csv`,leaveRows.map((r:any)=>({employee:employeeName(r.user_id),branch:branchName(employeeBranch(r.user_id)),leave_type:rows.leaveTypes.find((t:any)=>t.id===r.leave_type_id)?.name??'Leave',start_date:r.start_date,end_date:r.end_date,days:r.days,status:r.request_status,reason:r.reason,review_note:r.review_note}))) }>Export CSV</Button></div>
        {leaveRows.length?<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Employee','Branch','Leave type','From','To','Days','Status'].map(x=><th key={x} className="px-3 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{leaveRows.map((r:any)=><tr key={r.id}><td className="px-3 py-3 font-medium">{employeeName(r.user_id)}</td><td className="px-3 py-3">{branchName(employeeBranch(r.user_id))}</td><td className="px-3 py-3">{rows.leaveTypes.find((t:any)=>t.id===r.leave_type_id)?.name??'Leave'}</td><td className="px-3 py-3">{r.start_date}</td><td className="px-3 py-3">{r.end_date}</td><td className="px-3 py-3">{Number(r.days).toFixed(1)}</td><td className="px-3 py-3 capitalize">{r.request_status}</td></tr>)}</tbody></table></div>:<Empty>No leave requests overlap this date range and branch.</Empty>}
      </section>}
      {canPayroll&&<section className="rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Payroll report</h2><p className="text-xs text-muted-foreground">{payrollRows.length} employee snapshots · {from} to {to}</p></div><Button size="sm" variant="outline" disabled={!payrollRows.length} onClick={()=>exportCsv(`hr-payroll-${from}-to-${to}.csv`,payrollRows.map((r:any)=>({period:r.period_label,employee:r.employee_name,branch:branchName(employeeBranch(r.user_id)),gross_pay:r.gross_pay,total_deductions:r.total_deductions,net_pay:r.net_pay,unpaid_leave_days:r.unpaid_leave_days,unpaid_leave_deduction:r.unpaid_leave_deduction,status:payrollStatus(r.payroll_run_id)}))) }>Export CSV</Button></div>
        {payrollRows.length?<div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Period','Employee','Branch','Gross pay','Deductions','Net pay','Run status'].map(x=><th key={x} className="px-3 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{payrollRows.map((r:any)=><tr key={r.id}><td className="px-3 py-3">{r.period_label}</td><td className="px-3 py-3 font-medium">{r.employee_name}</td><td className="px-3 py-3">{branchName(employeeBranch(r.user_id))}</td><td className="px-3 py-3">{money(r.gross_pay)}</td><td className="px-3 py-3">{money(r.total_deductions)}</td><td className="px-3 py-3 font-semibold">{money(r.net_pay)}</td><td className="px-3 py-3 capitalize">{payrollStatus(r.payroll_run_id)}</td></tr>)}</tbody></table></div>:<Empty>No payroll snapshots overlap this date range and branch.</Empty>}
      </section>}
    </>}
  </>;
}
