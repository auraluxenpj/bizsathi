/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { CalendarDays, Clock3, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { businessQuery } from '@/lib/inventory-queries';
import { authorizedSelection } from '@/lib/dashboard-data';
import {
  getHrmWorkspace, createHrmEmployee, saveHrmAttendance, clockHrmAttendance, createHrmLeaveType, createHrmLeaveRequest,
  reviewHrmLeaveRequest, createHrmShift, assignHrmShift, saveHrmSalaryStructure,
  generateHrmPayroll, approveHrmPayroll, markHrmPayrollPaid,
} from '@/lib/hrm.functions';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
const money = (value: number | string) => `Rs ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inputClass = 'mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm';
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
  const saveAttendance = useServerFn(saveHrmAttendance);
  const clockAttendance = useServerFn(clockHrmAttendance);
  const createLeaveType = useServerFn(createHrmLeaveType);
  const createLeave = useServerFn(createHrmLeaveRequest);
  const reviewLeave = useServerFn(reviewHrmLeaveRequest);
  const createShift = useServerFn(createHrmShift);
  const assignShift = useServerFn(assignHrmShift);
  const saveSalary = useServerFn(saveHrmSalaryStructure);
  const generatePayroll = useServerFn(generateHrmPayroll);
  const approvePayroll = useServerFn(approveHrmPayroll);
  const markPaid = useServerFn(markHrmPayrollPaid);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const refresh = () => client.invalidateQueries({ queryKey: ['hrm', businessId] });
  const onMutationSuccess = () => { setMessage('Saved successfully.'); setError(''); void refresh(); };
  const onMutationError = (e: Error) => { setError(e.message || 'The request could not be completed.'); setMessage(''); };
  const employeeMutation = useHrmMutation((payload) => createEmployee({ data: payload }), onMutationSuccess, onMutationError);
  const attendanceMutation = useHrmMutation((payload) => saveAttendance({ data: payload }), onMutationSuccess, onMutationError);
  const clockMutation = useHrmMutation((payload) => clockAttendance({ data: payload }), onMutationSuccess, onMutationError);
  const leaveTypeMutation = useHrmMutation((payload) => createLeaveType({ data: payload }), onMutationSuccess, onMutationError);
  const leaveMutation = useHrmMutation((payload) => createLeave({ data: payload }), onMutationSuccess, onMutationError);
  const reviewMutation = useHrmMutation((payload) => reviewLeave({ data: payload }), onMutationSuccess, onMutationError);
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
  const actionBusy = [employeeMutation,attendanceMutation,clockMutation,leaveTypeMutation,leaveMutation,reviewMutation,shiftMutation,assignMutation,salaryMutation,payrollMutation,approveMutation,paidMutation].some(m => m.isPending);

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
          <TabsTrigger value="employees">Employees</TabsTrigger><TabsTrigger value="attendance">Attendance</TabsTrigger><TabsTrigger value="leave">Leave</TabsTrigger><TabsTrigger value="shifts">Shifts</TabsTrigger><TabsTrigger value="payroll">Payroll</TabsTrigger>
        </TabsList>
        <TabsContent value="employees" className="space-y-5">
          {isAdmin && <section className="rounded-xl border p-4 md:p-5"><h2 className="font-semibold">Create employee record</h2><p className="mt-1 text-sm text-muted-foreground">Select an existing active BizSathi member. HRM does not create a duplicate login or a second staff account.</p>
            {candidates.length ? <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const employeeNumber=String(fd.get('employeeNumber')||'').trim()||`EMP-${crypto.randomUUID().slice(0,8).toUpperCase()}`;employeeMutation.mutate({businessId,userId:String(fd.get('userId')),branchId:String(fd.get('branchId')||'')||null,employeeNumber,designation:String(fd.get('designation')||''),department:String(fd.get('department')||''),employmentType:String(fd.get('employmentType')||'full_time'),joiningDate:String(fd.get('joiningDate')),employmentStatus:'active'});e.currentTarget.reset();}}>
              <Field label="Existing team member"><select required name="userId" className={inputClass}><option value="">Select member</option>{memberOptions(candidates)}</select></Field>
              <Field label="Employee number (optional)"><input name="employeeNumber" className={inputClass} placeholder="Auto-generated if blank"/></Field>
              <Field label="Branch"><select name="branchId" className={inputClass}><option value="">Unassigned</option>{data.data.branches.map((b:any)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
              <Field label="Designation"><input name="designation" className={inputClass} placeholder="e.g. Store Supervisor"/></Field>
              <Field label="Department"><input name="department" className={inputClass} placeholder="e.g. Retail Operations"/></Field>
              <Field label="Employment type"><select name="employmentType" className={inputClass}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="temporary">Temporary</option><option value="intern">Intern</option></select></Field>
              <Field label="Joining date"><input required type="date" name="joiningDate" defaultValue={today()} className={inputClass}/></Field>
              <div className="flex items-end"><Button type="submit" disabled={actionBusy}>Add employee record</Button></div>
            </form> : <Empty>All active team members already have an employee record, or no active members are available.</Empty>}
          </section>}
          <section className="rounded-xl border"><div className="border-b p-4"><h2 className="font-semibold">Employee directory</h2><p className="text-xs text-muted-foreground">Personal HR records are visible to HR administrators and to the employee concerned.</p></div>
            {employees.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Employee','Employee ID','Designation','Department','Branch','Joining date','Status'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{employees.map((e:any)=><tr key={e.user_id}><td className="px-4 py-3 font-medium">{e.employee?.fullName ?? 'Employee'}</td><td className="px-4 py-3 font-mono text-xs">{e.employee_number}</td><td className="px-4 py-3">{e.designation||'—'}</td><td className="px-4 py-3">{e.department||'—'}</td><td className="px-4 py-3">{data.data.branches.find((b:any)=>b.id===e.branch_id)?.name||'—'}</td><td className="px-4 py-3">{e.joining_date}</td><td className="px-4 py-3 capitalize">{e.employment_status.replace('_',' ')}</td></tr>)}</tbody></table></div> : <Empty>No employee records are available for this account.</Empty>}
          </section>
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
          <section className="rounded-xl border"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Attendance register</h2><p className="text-xs text-muted-foreground">Latest 150 records · export the currently loaded register to CSV.</p></div><Button size="sm" variant="outline" disabled={!data.data.attendance.length} onClick={()=>exportCsv(`attendance-${today()}.csv`,data.data.attendance.map((a:any)=>({date:a.attendance_date,employee:a.employee?.fullName,status:a.attendance_status,check_in:a.check_in,check_out:a.check_out,notes:a.notes,branch_id:a.branch_id}))) }>Export CSV</Button></div>
            {data.data.attendance.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Date','Employee','Status','Check in','Check out','Notes'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{data.data.attendance.map((a:any)=><tr key={a.id}><td className="px-4 py-3">{a.attendance_date}</td><td className="px-4 py-3">{a.employee.fullName}</td><td className="px-4 py-3 capitalize">{a.attendance_status.replace('_',' ')}</td><td className="px-4 py-3">{a.check_in?new Date(a.check_in).toLocaleTimeString():'—'}</td><td className="px-4 py-3">{a.check_out?new Date(a.check_out).toLocaleTimeString():'—'}</td><td className="px-4 py-3">{a.notes||'—'}</td></tr>)}</tbody></table></div> : <Empty>No attendance records yet.</Empty>}
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
            {isAdmin && <form className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);leaveTypeMutation.mutate({businessId,name:String(fd.get('name')),annualQuota:number(fd.get('annualQuota')),isPaid:fd.get('isPaid')==='on'});e.currentTarget.reset();}}>
              <Field label="New leave type"><input required name="name" placeholder="e.g. Annual Leave" className={inputClass}/></Field><Field label="Annual quota (days)"><input required type="number" name="annualQuota" min="0" max="366" defaultValue="12" className={inputClass}/></Field><label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="isPaid" defaultChecked/>Paid leave</label><Button type="submit" variant="outline" disabled={actionBusy}>Add leave type</Button>
            </form>}
          </section>
          <section className="rounded-xl border"><div className="border-b p-4"><h2 className="font-semibold">Leave requests</h2></div>
            {data.data.leaveRequests.length ? <div className="divide-y">{data.data.leaveRequests.map((l:any)=><article key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{l.employee.fullName} · {data.data.leaveTypes.find((t:any)=>t.id===l.leave_type_id)?.name||'Leave'}</p><p className="text-sm text-muted-foreground">{l.start_date} to {l.end_date} · {l.days} day(s) · <span className="capitalize">{l.request_status}</span></p>{l.reason&&<p className="mt-1 text-sm">{l.reason}</p>}</div>{isAdmin&&l.request_status==='pending'&&<div className="flex gap-2"><Button size="sm" disabled={actionBusy} onClick={()=>reviewMutation.mutate({businessId,requestId:l.id,decision:'approved'})}>Approve</Button><Button size="sm" variant="outline" disabled={actionBusy} onClick={()=>reviewMutation.mutate({businessId,requestId:l.id,decision:'rejected'})}>Reject</Button></div>}</article>)}</div> : <Empty>No leave requests yet.</Empty>}
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
            <section className="rounded-xl border"><div className="border-b p-4"><h2 className="font-semibold">Payroll history</h2></div>
              {data.data.payrollRuns.length ? <div className="divide-y">{data.data.payrollRuns.map((p:any)=><article key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{p.period_label} · {p.employee_count} employees</p><p className="text-sm text-muted-foreground">Gross {money(p.gross_total)} · Deductions {money(p.deduction_total)} · Net {money(p.net_total)} · <span className="capitalize">{p.run_status}</span></p></div><div className="flex gap-2">{p.run_status==='draft'&&<Button size="sm" disabled={actionBusy} onClick={()=>approveMutation.mutate({businessId,runId:p.id})}>Approve</Button>}{isAdmin&&p.run_status==='approved'&&<Button size="sm" disabled={actionBusy} onClick={()=>paidMutation.mutate({businessId,runId:p.id})}>Mark paid</Button>}</div></article>)}</div> : <Empty>No payroll runs yet. Add salary structures before generating payroll.</Empty>}
            </section>
            <section className="rounded-xl border"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Payslip details</h2><p className="text-xs text-muted-foreground">Export the payroll snapshot currently available to your role.</p></div><Button size="sm" variant="outline" disabled={!data.data.payrollItems.length} onClick={()=>exportCsv(`payslips-${today()}.csv`,data.data.payrollItems.map((p:any)=>({period:p.period_label,employee:p.employee_name,basic_salary:p.basic_salary,allowances:p.allowances,gross_pay:p.gross_pay,fixed_deductions:p.fixed_deductions,unpaid_leave_days:p.unpaid_leave_days,unpaid_leave_deduction:p.unpaid_leave_deduction,total_deductions:p.total_deductions,net_pay:p.net_pay}))) }>Export CSV</Button></div>
              {data.data.payrollItems.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Period','Employee','Basic','Allowances','Gross','Deductions','Unpaid leave','Net pay'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{data.data.payrollItems.map((p:any)=><tr key={p.id}><td className="px-4 py-3">{p.period_label}</td><td className="px-4 py-3">{p.employee_name}</td><td className="px-4 py-3">{money(p.basic_salary)}</td><td className="px-4 py-3">{money(p.allowances)}</td><td className="px-4 py-3">{money(p.gross_pay)}</td><td className="px-4 py-3">{money(p.total_deductions)}</td><td className="px-4 py-3">{p.unpaid_leave_days}</td><td className="px-4 py-3 font-semibold">{money(p.net_pay)}</td></tr>)}</tbody></table></div> : <Empty>No payslip snapshots are available.</Empty>}
            </section>
          </> : data.data.payrollItems.length ? <section className="rounded-xl border"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">My approved payslips</h2><p className="text-xs text-muted-foreground">Only approved or paid payroll snapshots are released to employees.</p></div><Button size="sm" variant="outline" disabled={!data.data.payrollItems.length} onClick={()=>exportCsv(`my-payslips-${today()}.csv`,data.data.payrollItems.map((p:any)=>({period:p.period_label,basic_salary:p.basic_salary,allowances:p.allowances,gross_pay:p.gross_pay,total_deductions:p.total_deductions,net_pay:p.net_pay}))) }>Export CSV</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Period','Basic','Allowances','Gross','Deductions','Net pay'].map(x=><th key={x} className="px-4 py-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{data.data.payrollItems.map((p:any)=><tr key={p.id}><td className="px-4 py-3">{p.period_label}</td><td className="px-4 py-3">{money(p.basic_salary)}</td><td className="px-4 py-3">{money(p.allowances)}</td><td className="px-4 py-3">{money(p.gross_pay)}</td><td className="px-4 py-3">{money(p.total_deductions)}</td><td className="px-4 py-3 font-semibold">{money(p.net_pay)}</td></tr>)}</tbody></table></div></section> : <Empty>Your approved payslips will appear here after payroll is approved.</Empty>}
        </TabsContent>
      </Tabs>
    </>}
    <p className="mt-6 text-xs text-muted-foreground">Payroll figures are draft records until approved. Marking payroll paid is a manual status confirmation only; bank transfers and general-ledger posting are not performed by this HRM module.</p>
  </main>;
}
