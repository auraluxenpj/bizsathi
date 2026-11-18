import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { createHrmDraftEmployee, getHrmDraftEmployees } from '@/lib/hrm-draft-employees.functions';

type BranchOption = { id: string; name: string; code?: string | null };
type DraftEmployee = {
  id: string; full_name: string; employee_number: string; designation: string | null;
  department: string | null; branch_id: string | null; profile_status: string;
  responsibilities?: string[] | null;
};
type DraftEmployeeInput = {
  businessId: string; fullName: string; employeeNumber: string; branchId: string | null;
  designation: string; department: string; joiningDate: string | null; email: string; phone: string;
  responsibilities: string[];
};
const field = 'mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm';
const roles = ['Store Manager','Assistant Store Manager','Branch Manager','Department Manager','Sales Manager','Sales Associate','Cashier','Inventory Executive','Stock Controller','HR Executive','Accountant','Operations Executive','Security Officer','Housekeeping','Delivery Associate','Other'];
const departments = ['Store Operations','Retail Sales','Inventory & Stock','Finance & Accounts','Human Resources','Customer Service','Logistics','Administration','Security','Other'];
const responsibilities = [
  'Open and close store','Customer assistance and sales','Billing and cash handling','Product display and merchandising',
  'Stock receiving and verification','Inventory counting and stock transfers','Purchase coordination','Daily sales reporting',
  'Staff scheduling and attendance','Leave coordination','Cash reconciliation and deposits','Customer complaints and returns',
  'Store cleanliness and safety','Branch operations and supervision','Vendor coordination','Payroll input and attendance review',
];

export function HrmDraftEmployeeProfiles({ businessId, branches, isAdmin }: { businessId: string; branches: BranchOption[]; isAdmin: boolean }) {
  const client = useQueryClient();
  const load = useServerFn(getHrmDraftEmployees);
  const save = useServerFn(createHrmDraftEmployee);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['hrm-draft-employees', businessId],
    queryFn: async () => await load({ data: { businessId } }) as DraftEmployee[],
    enabled: Boolean(businessId && isAdmin),
  });
  const mutation = useMutation({
    mutationFn: (payload: DraftEmployeeInput) => save({ data: payload }),
    onSuccess: () => {
      setError('');
      setMessage('Draft employee profile saved. No login or staff account was created.');
      void client.invalidateQueries({ queryKey: ['hrm-draft-employees', businessId] });
    },
    onError: (e: Error) => { setMessage(''); setError(e.message); },
  });
  if (!isAdmin) return null;
  return <section className="rounded-xl border p-4 md:p-5 space-y-4">
    <div><h2 className="font-semibold">Pre-onboarding employee profiles</h2><p className="mt-1 text-sm text-muted-foreground">Save staff details before they receive a Sutra login. Drafts stay outside attendance, leave and payroll until linked to a real member account.</p></div>
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={event => {
      event.preventDefault();
      const fd = new FormData(event.currentTarget);
      mutation.mutate({
        businessId, fullName: String(fd.get('fullName') || ''), employeeNumber: String(fd.get('employeeNumber') || ''),
        branchId: String(fd.get('branchId') || '') || null, designation: String(fd.get('designation') || ''),
        department: String(fd.get('department') || ''), joiningDate: String(fd.get('joiningDate') || '') || null,
        email: String(fd.get('email') || ''), phone: String(fd.get('phone') || ''),
        responsibilities: fd.getAll('responsibilities').map(String),
      });
    }}>
      <label className="text-sm font-medium">Full name<input required name="fullName" className={field} placeholder="Employee full name" maxLength={120}/></label>
      <label className="text-sm font-medium">Employee number<input required name="employeeNumber" className={field} placeholder="e.g. AL-NPJ-001" maxLength={24}/></label>
      <label className="text-sm font-medium">Branch<select name="branchId" defaultValue={branches[0]?.id ?? ''} className={field}><option value="">Unassigned</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="text-sm font-medium">Job role / designation<select name="designation" defaultValue="" className={field}><option value="">Select role</option>{roles.map(role=><option key={role} value={role}>{role}</option>)}</select></label>
      <label className="text-sm font-medium">Department<select name="department" defaultValue="Store Operations" className={field}>{departments.map(dept=><option key={dept} value={dept}>{dept}</option>)}</select></label>
      <label className="text-sm font-medium">Joining date (optional)<input type="date" name="joiningDate" className={field}/></label>
      <label className="text-sm font-medium">Email (optional)<input type="email" name="email" placeholder="Not provided" className={field}/></label>
      <label className="text-sm font-medium">Mobile (optional)<input name="phone" placeholder="Not provided" className={field}/></label>
      <fieldset className="sm:col-span-2 lg:col-span-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">Responsibilities</legend>
        <p className="mb-3 text-xs text-muted-foreground">Choose the duties assigned to this job. These are HR descriptions and do not grant Sutra app permissions.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{responsibilities.map(item=><label key={item} className="flex items-start gap-2 text-sm font-normal"><input type="checkbox" name="responsibilities" value={item} className="mt-1"/><span>{item}</span></label>)}</div>
      </fieldset>
      <div className="flex items-end"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save draft profile'}</Button></div>
    </form>
    <div className="border-t pt-4"><h3 className="text-sm font-semibold">Draft employee list</h3>
      {query.isPending ? <p className="py-4 text-sm text-muted-foreground">Loading draft profiles…</p> : query.error ? <p role="alert" className="py-3 text-sm text-destructive">{(query.error as Error).message}</p> : query.data?.length ? <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Name','Employee ID','Job role','Department','Branch','Responsibilities','Status'].map(x=><th key={x} className="px-3 py-2 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y">{query.data.map(row=><tr key={row.id}><td className="px-3 py-3 font-medium">{row.full_name}</td><td className="px-3 py-3 font-mono text-xs">{row.employee_number}</td><td className="px-3 py-3">{row.designation || '—'}</td><td className="px-3 py-3">{row.department || '—'}</td><td className="px-3 py-3">{branches.find(b=>b.id===row.branch_id)?.name || 'Unassigned'}</td><td className="px-3 py-3">{row.responsibilities?.length ?? 0}</td><td className="px-3 py-3 capitalize">{row.profile_status.replace('_',' ')}</td></tr>)}</tbody></table></div> : <p className="py-3 text-sm text-muted-foreground">No draft employee profiles yet.</p>}
    </div>
  </section>;
}
