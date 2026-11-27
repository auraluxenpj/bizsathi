/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, type ReactNode, type ElementType } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import {
  BadgeCheck, Building2, CalendarDays, CreditCard, Home, Loader2, Plus,
  Receipt, RefreshCw, Share2, TrendingUp, UserPlus, Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  approveRentalInvoice, assignRentalMember, createRentalWorkspace, generateRentalMonthlyInvoices,
  getRentalOverview, listRentalAgreements, listRentalAuditEvents, listRentalChargeRules,
  listRentalChargeTypes, listRentalDeposits, listRentalExpenses, listRentalInvoices,
  listRentalMemberCandidates, listRentalMembers, listRentalMeterReadings, listRentalProperties,
  listRentalTenants, listRentalUnits, listRentalWorkspaces, markRentalInvoiceSent,
  recordRentalDeposit, recordRentalPayment, saveRentalAgreement, saveRentalChargeRule,
  saveRentalChargeType, saveRentalExpense, saveRentalMeterReading, saveRentalProperty,
  saveRentalTenant, saveRentalUnit,
} from '@/lib/rental.functions';

const today = () => new Date().toISOString().slice(0,10);
const money = (value: number | string | null | undefined) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(Number(value ?? 0));
const monthBounds = (month: string) => {
  const [year,mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year,mon-1,1));
  const end = new Date(Date.UTC(year,mon,0));
  return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) };
};
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>;
}
function Metric({ label, value, icon: Icon, hint }: { label: string; value: string; icon: ElementType; hint?: string }) {
  return <Card><CardContent className="flex items-start justify-between p-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}</div><div className="rounded-lg bg-muted p-2"><Icon className="size-5 text-muted-foreground"/></div></CardContent></Card>;
}
function statusBadge(status: string) {
  const variants: Record<string,'default'|'secondary'|'outline'|'destructive'> = {
    pending_approval:'secondary', approved:'default', sent:'outline', partially_paid:'secondary', paid:'default', draft:'outline', void:'destructive',
  };
  const labels: Record<string,string> = { pending_approval:'Awaiting approval', approved:'Approved', sent:'Sent', partially_paid:'Part-paid', paid:'Paid', draft:'Draft', void:'Void' };
  return <Badge variant={variants[status] ?? 'outline'}>{labels[status] ?? status}</Badge>;
}

export function RentalWorkspace() {
  const client = useQueryClient();
  const loadWorkspaces = useServerFn(listRentalWorkspaces);
  const createWorkspace = useServerFn(createRentalWorkspace);
  const workspaces = useQuery({ queryKey:['rental-workspaces'], queryFn:()=>loadWorkspaces(), retry:false });
  const workspace = workspaces.data?.[0];
  const workspaceId = workspace?.id ?? '';
  const role = workspace?.role ?? 'viewer';
  const owner = role === 'owner';
  const editor = role === 'owner' || role === 'accountant';
  const refresh = () => client.invalidateQueries();

  const overviewFn = useServerFn(getRentalOverview);
  const propertiesFn = useServerFn(listRentalProperties);
  const unitsFn = useServerFn(listRentalUnits);
  const tenantsFn = useServerFn(listRentalTenants);
  const agreementsFn = useServerFn(listRentalAgreements);
  const typesFn = useServerFn(listRentalChargeTypes);
  const rulesFn = useServerFn(listRentalChargeRules);
  const readingsFn = useServerFn(listRentalMeterReadings);
  const invoicesFn = useServerFn(listRentalInvoices);
  const expensesFn = useServerFn(listRentalExpenses);
  const depositsFn = useServerFn(listRentalDeposits);
  const membersFn = useServerFn(listRentalMembers);
  const candidatesFn = useServerFn(listRentalMemberCandidates);
  const auditFn = useServerFn(listRentalAuditEvents);
  const saveProperty = useServerFn(saveRentalProperty);
  const saveUnit = useServerFn(saveRentalUnit);
  const saveTenant = useServerFn(saveRentalTenant);
  const saveAgreement = useServerFn(saveRentalAgreement);
  const saveType = useServerFn(saveRentalChargeType);
  const saveRule = useServerFn(saveRentalChargeRule);
  const saveReading = useServerFn(saveRentalMeterReading);
  const generateInvoices = useServerFn(generateRentalMonthlyInvoices);
  const approveInvoice = useServerFn(approveRentalInvoice);
  const markSent = useServerFn(markRentalInvoiceSent);
  const recordPayment = useServerFn(recordRentalPayment);
  const saveExpense = useServerFn(saveRentalExpense);
  const recordDeposit = useServerFn(recordRentalDeposit);
  const assignMember = useServerFn(assignRentalMember);

  const overview = useQuery({ queryKey:['rental-overview',workspaceId], queryFn:()=>overviewFn({data:{workspaceId}}), enabled:!!workspaceId });
  const properties = useQuery({ queryKey:['rental-properties',workspaceId], queryFn:()=>propertiesFn({data:{workspaceId}}), enabled:!!workspaceId });
  const units = useQuery({ queryKey:['rental-units',workspaceId], queryFn:()=>unitsFn({data:{workspaceId}}), enabled:!!workspaceId });
  const tenants = useQuery({ queryKey:['rental-tenants',workspaceId], queryFn:()=>tenantsFn({data:{workspaceId}}), enabled:!!workspaceId });
  const agreements = useQuery({ queryKey:['rental-agreements',workspaceId], queryFn:()=>agreementsFn({data:{workspaceId}}), enabled:!!workspaceId });
  const chargeTypes = useQuery({ queryKey:['rental-charge-types',workspaceId], queryFn:()=>typesFn({data:{workspaceId}}), enabled:!!workspaceId });
  const chargeRules = useQuery({ queryKey:['rental-charge-rules',workspaceId], queryFn:()=>rulesFn({data:{workspaceId}}), enabled:!!workspaceId });
  const readings = useQuery({ queryKey:['rental-meter-readings',workspaceId], queryFn:()=>readingsFn({data:{workspaceId}}), enabled:!!workspaceId });
  const invoices = useQuery({ queryKey:['rental-invoices',workspaceId], queryFn:()=>invoicesFn({data:{workspaceId}}), enabled:!!workspaceId });
  const expenses = useQuery({ queryKey:['rental-expenses',workspaceId], queryFn:()=>expensesFn({data:{workspaceId}}), enabled:!!workspaceId });
  const deposits = useQuery({ queryKey:['rental-deposits',workspaceId], queryFn:()=>depositsFn({data:{workspaceId}}), enabled:!!workspaceId });
  const members = useQuery({ queryKey:['rental-members',workspaceId], queryFn:()=>membersFn({data:{workspaceId}}), enabled:!!workspaceId });
  const candidates = useQuery({ queryKey:['rental-member-candidates',workspaceId], queryFn:()=>candidatesFn({data:{workspaceId}}), enabled:!!workspaceId && owner });
  const audit = useQuery({ queryKey:['rental-audit',workspaceId], queryFn:()=>auditFn({data:{workspaceId}}), enabled:!!workspaceId && owner });

  const [propertyName,setPropertyName] = useState('');
  const [propertyAddress,setPropertyAddress] = useState('');
  const [propertyCity,setPropertyCity] = useState('');
  const [unitProperty,setUnitProperty] = useState('');
  const [unitCode,setUnitCode] = useState('');
  const [unitRent,setUnitRent] = useState('');
  const [unitDeposit,setUnitDeposit] = useState('0');
  const [unitRate,setUnitRate] = useState('8');
  const [unitFloor,setUnitFloor] = useState('');
  const [tenantName,setTenantName] = useState('');
  const [tenantPhone,setTenantPhone] = useState('');
  const [tenantWhatsApp,setTenantWhatsApp] = useState('');
  const [tenantEmail,setTenantEmail] = useState('');
  const [agreementUnit,setAgreementUnit] = useState('');
  const [agreementTenant,setAgreementTenant] = useState('');
  const [agreementRent,setAgreementRent] = useState('');
  const [agreementDeposit,setAgreementDeposit] = useState('0');
  const [agreementStart,setAgreementStart] = useState(today());
  const [agreementDue,setAgreementDue] = useState('15');
  const [meterUnit,setMeterUnit] = useState('');
  const [meterType,setMeterType] = useState('electricity');
  const [meterStart,setMeterStart] = useState(monthBounds(today().slice(0,7)).start);
  const [meterEnd,setMeterEnd] = useState(monthBounds(today().slice(0,7)).end);
  const [meterPrevious,setMeterPrevious] = useState('');
  const [meterCurrent,setMeterCurrent] = useState('');
  const [meterRate,setMeterRate] = useState('8');
  const [chargeName,setChargeName] = useState('Common water');
  const [chargeCategory,setChargeCategory] = useState('water');
  const [chargeProperty,setChargeProperty] = useState('');
  const [chargeUnit,setChargeUnit] = useState('');
  const [chargeType,setChargeType] = useState('');
  const [chargeMethod,setChargeMethod] = useState('equal');
  const [chargeAmount,setChargeAmount] = useState('');
  const [chargePercent,setChargePercent] = useState('');
  const [chargeRecurring,setChargeRecurring] = useState(true);
  const [billingMonth,setBillingMonth] = useState(today().slice(0,7));
  const [selectedInvoice,setSelectedInvoice] = useState('');
  const [paymentAmount,setPaymentAmount] = useState('');
  const [paymentMethod,setPaymentMethod] = useState('bank_transfer');
  const [expenseProperty,setExpenseProperty] = useState('');
  const [expenseUnit,setExpenseUnit] = useState('');
  const [expenseCategory,setExpenseCategory] = useState('maintenance');
  const [expenseDescription,setExpenseDescription] = useState('');
  const [expenseAmount,setExpenseAmount] = useState('');
  const [expenseDate,setExpenseDate] = useState(today());
  const [depositTenant,setDepositTenant] = useState('');
  const [depositUnit,setDepositUnit] = useState('');
  const [depositAmount,setDepositAmount] = useState('');
  const [depositType,setDepositType] = useState('received');
  const [candidateUser,setCandidateUser] = useState('');
  const [memberRole,setMemberRole] = useState('accountant');

  const createWorkspaceMutation = useMutation({ mutationFn:()=>createWorkspace({data:{name:'Rental Property Management'}}), onSuccess:async()=>{await refresh();toast.success('Rental workspace created.');}, onError:(e)=>toast.error(e.message) });
  const propertyMutation = useMutation({ mutationFn:()=>saveProperty({data:{workspaceId,name:propertyName,address:propertyAddress,city:propertyCity}}), onSuccess:async()=>{setPropertyName('');setPropertyAddress('');setPropertyCity('');await refresh();toast.success('Property saved.');}, onError:e=>toast.error(e.message) });
  const unitMutation = useMutation({ mutationFn:()=>saveUnit({data:{workspaceId,propertyId:unitProperty,unitCode,monthlyRent:Number(unitRent),securityDeposit:Number(unitDeposit||0),electricityRate:Number(unitRate||0),floorLabel:unitFloor,dueDay:15,status:'vacant'}}), onSuccess:async()=>{setUnitCode('');setUnitRent('');await refresh();toast.success('Rental unit saved.');}, onError:e=>toast.error(e.message) });
  const tenantMutation = useMutation({ mutationFn:()=>saveTenant({data:{workspaceId,fullName:tenantName,phone:tenantPhone,whatsappNumber:tenantWhatsApp,email:tenantEmail||null}}), onSuccess:async()=>{setTenantName('');setTenantPhone('');setTenantWhatsApp('');setTenantEmail('');await refresh();toast.success('Tenant saved.');}, onError:e=>toast.error(e.message) });
  const agreementMutation = useMutation({ mutationFn:()=>saveAgreement({data:{workspaceId,unitId:agreementUnit,tenantId:agreementTenant,monthlyRent:Number(agreementRent),securityDeposit:Number(agreementDeposit||0),startDate:agreementStart,dueDay:Number(agreementDue),status:'active'}}), onSuccess:async()=>{await refresh();toast.success('Rental agreement activated.');}, onError:e=>toast.error(e.message) });
  const typeMutation = useMutation({ mutationFn:()=>saveType({data:{workspaceId,code:chargeName.toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''),name:chargeName,category:chargeCategory as 'water'|'maintenance'|'parking'|'cleaning'|'other',isActive:true}}), onSuccess:async()=>{await refresh();toast.success('Charge type saved.');}, onError:e=>toast.error(e.message) });
  const ruleMutation = useMutation({ mutationFn:()=>saveRule({data:{workspaceId,propertyId:chargeProperty,unitId:chargeUnit||null,chargeTypeId:chargeType,allocationMethod:chargeMethod as 'fixed'|'equal'|'percentage',amount:Number(chargeAmount),allocationPercent:chargeMethod==='percentage'?Number(chargePercent):null,isRecurring:chargeRecurring,startDate:today(),isActive:true}}), onSuccess:async()=>{await refresh();toast.success('Recurring charge saved.');}, onError:e=>toast.error(e.message) });
  const meterMutation = useMutation({ mutationFn:()=>saveReading({data:{workspaceId,unitId:meterUnit,meterType:meterType as 'electricity'|'water',periodStart:meterStart,periodEnd:meterEnd,previousReading:Number(meterPrevious),currentReading:Number(meterCurrent),ratePerUnit:Number(meterRate),readAt:today()}}), onSuccess:async()=>{await refresh();setMeterPrevious('');setMeterCurrent('');toast.success('Meter reading saved.');}, onError:e=>toast.error(e.message) });
  const invoiceMutation = useMutation({ mutationFn:()=>{const range=monthBounds(billingMonth);return generateInvoices({data:{workspaceId,periodStart:range.start,periodEnd:range.end,issueDate:today()}});}, onSuccess:async(result)=>{await refresh();toast.success(`${result.generated} invoice(s) generated for approval.`);}, onError:e=>toast.error(e.message) });
  const approveMutation = useMutation({ mutationFn:(invoiceId:string)=>approveInvoice({data:{workspaceId,invoiceId}}), onSuccess:async()=>{await refresh();toast.success('Invoice approved.');}, onError:e=>toast.error(e.message) });
  const sentMutation = useMutation({ mutationFn:(invoiceId:string)=>markSent({data:{workspaceId,invoiceId}}), onSuccess:async()=>{await refresh();toast.success('Invoice marked as sent.');}, onError:e=>toast.error(e.message) });
  const paymentMutation = useMutation({ mutationFn:()=>recordPayment({data:{workspaceId,invoiceId:selectedInvoice,amount:Number(paymentAmount),paymentDate:today(),paymentMethod:paymentMethod as 'cash'|'bank_transfer'|'upi'|'qr'|'cheque'|'other'}}), onSuccess:async()=>{setPaymentAmount('');await refresh();toast.success('Payment recorded.');}, onError:e=>toast.error(e.message) });
  const expenseMutation = useMutation({ mutationFn:()=>saveExpense({data:{workspaceId,propertyId:expenseProperty,unitId:expenseUnit||null,category:expenseCategory as 'repairs'|'maintenance'|'utilities'|'taxes'|'insurance'|'cleaning'|'other',description:expenseDescription,amount:Number(expenseAmount),expenseDate}}), onSuccess:async()=>{setExpenseDescription('');setExpenseAmount('');await refresh();toast.success('Expense saved.');}, onError:e=>toast.error(e.message) });
  const depositMutation = useMutation({ mutationFn:()=>recordDeposit({data:{workspaceId,tenantId:depositTenant,unitId:depositUnit,transactionType:depositType as 'received'|'refunded'|'adjustment',amount:Number(depositAmount),transactionDate:today()}}), onSuccess:async()=>{setDepositAmount('');await refresh();toast.success('Deposit transaction recorded.');}, onError:e=>toast.error(e.message) });
  const memberMutation = useMutation({ mutationFn:()=>assignMember({data:{workspaceId,userId:candidateUser,role:memberRole as 'accountant'|'viewer'}}), onSuccess:async()=>{setCandidateUser('');await refresh();toast.success('Existing employee account added.');}, onError:e=>toast.error(e.message) });

  const propertyRows = properties.data ?? [];
  const unitRows = units.data ?? [];
  const tenantRows = tenants.data ?? [];
  const agreementRows = agreements.data ?? [];
  const invoiceRows = invoices.data ?? [];
  const expenseRows = expenses.data ?? [];
  const activeInvoice = invoiceRows.find(i => i.id === selectedInvoice);
  const outstandingForSelected = activeInvoice ? Math.max(0,Number(activeInvoice.total)-(activeInvoice.payments ?? []).reduce((s,p)=>s+Number(p.amount),0)) : 0;
  const currentMonth = today().slice(0,7);
  const monthExpenseTotal = useMemo(()=>expenseRows.filter(e=>e.expense_date.slice(0,7)===currentMonth).reduce((s,e)=>s+Number(e.amount),0),[expenseRows,currentMonth]);
  const currency = (v:number|string|null|undefined)=>money(v);

  async function shareInvoice(invoice: any) {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text('RENT INVOICE',14,20);
    doc.setFontSize(10);
    doc.text(`Invoice: ${invoice.invoice_number}`,14,30);
    doc.text(`Tenant: ${invoice.tenant?.full_name ?? 'Tenant'}`,14,37);
    doc.text(`Unit: ${invoice.unit?.unit_code ?? ''}`,14,44);
    doc.text(`Billing period: ${invoice.billing_period_start} to ${invoice.billing_period_end}`,14,51);
    doc.text(`Issue date: ${invoice.issue_date}     Due date: ${invoice.due_date}`,14,58);
    autoTable(doc,{startY:66,head:[['Description','Qty','Rate','Amount']],body:(invoice.lines ?? []).map((line:any)=>[line.description,String(line.quantity),currency(line.unit_rate),currency(line.amount)]),styles:{fontSize:9},headStyles:{fillColor:[48,62,82]}});
    const finalY = (doc as any).lastAutoTable?.finalY ?? 90;
    doc.setFontSize(12); doc.text(`Total payable: ${currency(invoice.total)}`,14,finalY+12);
    const blob = doc.output('blob');
    const filename = `${invoice.invoice_number}.pdf`;
    const file = new File([blob],filename,{type:'application/pdf'});
    const phone = (invoice.tenant?.whatsapp_number || invoice.tenant?.phone || '').replace(/\D/g,'');
    const message = `Namaste ${invoice.tenant?.full_name ?? ''}, your rent invoice ${invoice.invoice_number} for ${invoice.billing_period_start} to ${invoice.billing_period_end} is ${currency(invoice.total)}. Due date: ${invoice.due_date}. Please find the invoice attached.`;
    if (navigator.share && navigator.canShare?.({files:[file]})) {
      try {
        await navigator.share({files:[file],title:invoice.invoice_number,text:message});
        toast.info('Share sheet completed. Confirm Sent after the tenant message has been sent.');
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        toast.error('WhatsApp sharing was not completed. You can download the PDF and share it manually.');
      }
    } else {
      doc.save(filename);
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(url,'_blank','noopener,noreferrer');
      toast.info('PDF downloaded. Attach it in WhatsApp, send the message, then confirm Sent here.');
    }
  }

  if (workspaces.isPending) return <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin"/>Loading rental workspace…</div>;
  if (workspaces.isError) return <div className="mx-auto max-w-xl p-8"><Card><CardHeader><CardTitle>Rental workspace unavailable</CardTitle><CardDescription>{workspaces.error.message}</CardDescription></CardHeader></Card></div>;
  if (!workspace) return <main className="mx-auto max-w-2xl px-4 py-12"><Card><CardHeader><div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-muted"><Home className="size-6"/></div><CardTitle>Set up Rental Property Management</CardTitle><CardDescription>Create an independent rental workspace. It will not use Auraluxe inventory, sales, or accounts.</CardDescription></CardHeader><CardContent><Button onClick={()=>createWorkspaceMutation.mutate()} disabled={createWorkspaceMutation.isPending}>{createWorkspaceMutation.isPending?<Loader2 className="mr-2 size-4 animate-spin"/>:<Plus className="mr-2 size-4"/>}Create rental workspace</Button></CardContent></Card></main>;

  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-5 md:px-8 md:py-7">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><Building2 className="size-5 text-muted-foreground"/><Badge variant="outline">Separate workspace</Badge></div><h1 className="mt-2 text-2xl font-bold tracking-tight">Rental Property Management</h1><p className="mt-1 text-sm text-muted-foreground">Properties, tenants, rent collection and utilities · Due on the 15th · Invoice series {workspace.invoice_prefix}</p></div>
      <div className="flex items-center gap-2"><Badge variant={owner?'default':'secondary'}>{owner?'Owner':role==='accountant'?'Accountant':'Viewer'}</Badge><Button variant="outline" size="sm" onClick={()=>refresh()}><RefreshCw className="mr-2 size-4"/>Refresh</Button></div>
    </header>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Properties" value={String(overview.data?.properties ?? 0)} icon={Building2}/>
      <Metric label="Rental units" value={String(overview.data?.units ?? 0)} icon={Home} hint={`${overview.data?.occupiedUnits ?? 0} occupied`}/>
      <Metric label="Monthly rent run rate" value={currency(overview.data?.monthlyRentRunRate)} icon={TrendingUp}/>
      <Metric label="Outstanding invoices" value={currency(overview.data?.outstanding)} icon={Receipt} hint={`${overview.data?.pendingApproval ?? 0} awaiting your approval`}/>
    </div>

    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="h-auto flex-wrap justify-start">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="properties">Properties & units</TabsTrigger>
        <TabsTrigger value="tenants">Tenants & agreements</TabsTrigger>
        <TabsTrigger value="utilities">Utilities & charges</TabsTrigger>
        <TabsTrigger value="invoices">Invoices & payments</TabsTrigger>
        <TabsTrigger value="expenses">Expenses & deposits</TabsTrigger>
        {owner && <TabsTrigger value="team">Accountant & audit</TabsTrigger>}
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Rental portfolio</CardTitle><CardDescription>Current occupancy and rent position</CardDescription></CardHeader><CardContent className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Occupied units</span><strong>{overview.data?.occupiedUnits ?? 0} / {overview.data?.units ?? 0}</strong></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${overview.data?.units?Math.min(100,(overview.data.occupiedUnits/overview.data.units)*100):0}%`}}/></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Active tenancies</span><strong>{overview.data?.activeTenancies ?? 0}</strong></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Current-month expenses</span><strong>{currency(monthExpenseTotal)}</strong></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Payments received (all time)</span><strong>{currency(overview.data?.collected)}</strong></div>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Invoice workflow</CardTitle><CardDescription>Invoices cannot be sent before owner approval</CardDescription></CardHeader><CardContent className="space-y-3">
            {['pending_approval','approved','sent','partially_paid','paid'].map(s=><div key={s} className="flex items-center justify-between text-sm"><span>{statusBadge(s)}</span><strong>{invoiceRows.filter(i=>i.status===s).length}</strong></div>)}
          </CardContent></Card>
        </div>
        <Card><CardHeader><CardTitle>Next steps</CardTitle><CardDescription>Set up your rental portfolio in this order</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[['1','Add property and units'],['2','Register tenants and agreements'],['3','Enter meter readings and common charges'],['4','Generate monthly invoices for approval']].map(([n,t])=><div key={n} className="rounded-lg border p-3"><span className="text-xs font-semibold text-muted-foreground">STEP {n}</span><p className="mt-1 text-sm font-medium">{t}</p></div>)}
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="properties" className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Add property</CardTitle><CardDescription>One property can contain multiple rental units.</CardDescription></CardHeader><CardContent><form className="grid gap-3" onSubmit={e=>{e.preventDefault();propertyMutation.mutate();}}>
          <Field label="Property name"><Input required value={propertyName} onChange={e=>setPropertyName(e.target.value)} placeholder="Main rental house"/></Field>
          <Field label="Address"><Input value={propertyAddress} onChange={e=>setPropertyAddress(e.target.value)} placeholder="Street / locality"/></Field>
          <Field label="City"><Input value={propertyCity} onChange={e=>setPropertyCity(e.target.value)} placeholder="City"/></Field>
          <Button type="submit" disabled={!editor||propertyMutation.isPending}><Plus className="mr-2 size-4"/>Save property</Button>
        </form></CardContent></Card>
        <Card><CardHeader><CardTitle>Add rental unit</CardTitle><CardDescription>Set the base rent, security deposit and electricity rate.</CardDescription></CardHeader><CardContent><form className="grid gap-3" onSubmit={e=>{e.preventDefault();unitMutation.mutate();}}>
          <Field label="Property"><select className="h-10 rounded-md border bg-background px-3 text-sm" required value={unitProperty} onChange={e=>setUnitProperty(e.target.value)}><option value="">Select property</option>{propertyRows.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Unit / portion"><Input required value={unitCode} onChange={e=>setUnitCode(e.target.value)} placeholder="Ground floor"/></Field><Field label="Floor"><Input value={unitFloor} onChange={e=>setUnitFloor(e.target.value)} placeholder="Ground"/></Field></div>
          <div className="grid grid-cols-3 gap-3"><Field label="Monthly rent"><Input required type="number" min="0" value={unitRent} onChange={e=>setUnitRent(e.target.value)}/></Field><Field label="Deposit"><Input type="number" min="0" value={unitDeposit} onChange={e=>setUnitDeposit(e.target.value)}/></Field><Field label="Electricity ₹/unit"><Input type="number" min="0" step="0.01" value={unitRate} onChange={e=>setUnitRate(e.target.value)}/></Field></div>
          <Button type="submit" disabled={!editor||!unitProperty||unitMutation.isPending}><Plus className="mr-2 size-4"/>Save unit</Button>
        </form></CardContent></Card>
        <Card className="xl:col-span-2"><CardHeader><CardTitle>Properties and units</CardTitle></CardHeader><CardContent className="space-y-3">
          {propertyRows.length===0&&<p className="text-sm text-muted-foreground">No properties added yet.</p>}
          {propertyRows.map(p=><div key={p.id} className="rounded-lg border p-3"><div className="font-medium">{p.name}</div><p className="text-xs text-muted-foreground">{[p.address,p.city,p.state].filter(Boolean).join(', ')}</p><div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{unitRows.filter(u=>u.property_id===p.id).map(u=><div key={u.id} className="rounded-md bg-muted/50 p-3 text-sm"><div className="flex items-center justify-between"><strong>{u.unit_code}</strong><Badge variant={u.status==='occupied'?'default':'outline'}>{u.status}</Badge></div><div className="mt-1 text-muted-foreground">{currency(u.monthly_rent)} / month · ₹{u.electricity_rate}/unit</div></div>)}</div></div>)}
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="tenants" className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Register tenant</CardTitle></CardHeader><CardContent><form className="grid gap-3" onSubmit={e=>{e.preventDefault();tenantMutation.mutate();}}>
          <Field label="Tenant full name"><Input required value={tenantName} onChange={e=>setTenantName(e.target.value)}/></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Phone"><Input value={tenantPhone} onChange={e=>setTenantPhone(e.target.value)}/></Field><Field label="WhatsApp number"><Input value={tenantWhatsApp} onChange={e=>setTenantWhatsApp(e.target.value)}/></Field></div>
          <Field label="Email (optional)"><Input type="email" value={tenantEmail} onChange={e=>setTenantEmail(e.target.value)}/></Field>
          <Button type="submit" disabled={!editor||tenantMutation.isPending}><Plus className="mr-2 size-4"/>Save tenant</Button>
        </form></CardContent></Card>
        <Card><CardHeader><CardTitle>Create rental agreement</CardTitle><CardDescription>Activating an agreement marks its unit occupied.</CardDescription></CardHeader><CardContent><form className="grid gap-3" onSubmit={e=>{e.preventDefault();agreementMutation.mutate();}}>
          <Field label="Rental unit"><select className="h-10 rounded-md border bg-background px-3 text-sm" required value={agreementUnit} onChange={e=>setAgreementUnit(e.target.value)}><option value="">Select vacant unit</option>{unitRows.filter(u=>u.status==='vacant').map(u=><option key={u.id} value={u.id}>{u.unit_code} · {propertyRows.find(p=>p.id===u.property_id)?.name}</option>)}</select></Field>
          <Field label="Tenant"><select className="h-10 rounded-md border bg-background px-3 text-sm" required value={agreementTenant} onChange={e=>setAgreementTenant(e.target.value)}><option value="">Select tenant</option>{tenantRows.filter(t=>t.status==='active').map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}</select></Field>
          <div className="grid grid-cols-3 gap-3"><Field label="Monthly rent"><Input required type="number" min="0" value={agreementRent} onChange={e=>setAgreementRent(e.target.value)}/></Field><Field label="Deposit"><Input type="number" min="0" value={agreementDeposit} onChange={e=>setAgreementDeposit(e.target.value)}/></Field><Field label="Due day"><Input type="number" min="1" max="28" value={agreementDue} onChange={e=>setAgreementDue(e.target.value)}/></Field></div>
          <Field label="Agreement start date"><Input required type="date" value={agreementStart} onChange={e=>setAgreementStart(e.target.value)}/></Field>
          <Button type="submit" disabled={!editor||agreementMutation.isPending||!agreementUnit||!agreementTenant}><Plus className="mr-2 size-4"/>Activate agreement</Button>
        </form></CardContent></Card>
        <Card className="xl:col-span-2"><CardHeader><CardTitle>Tenants and active agreements</CardTitle></CardHeader><CardContent className="space-y-2">
          {tenantRows.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><div className="font-medium">{t.full_name}</div><p className="text-xs text-muted-foreground">{t.whatsapp_number||t.phone||t.email||'No contact number'}</p></div><Badge variant={t.status==='active'?'default':'outline'}>{t.status}</Badge></div>)}
          {agreementRows.map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3 text-sm"><div><strong>{a.unit_code} · {a.tenant_name}</strong><p className="text-xs text-muted-foreground">{a.property_name} · Since {a.start_date}</p></div><div className="text-right"><strong>{currency(a.monthly_rent)}</strong><p className="text-xs text-muted-foreground">Due day {a.due_day}</p></div></div>)}
          {tenantRows.length===0&&agreementRows.length===0&&<p className="text-sm text-muted-foreground">No tenants or agreements yet.</p>}
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="utilities" className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Record meter reading</CardTitle><CardDescription>Consumption and charge are calculated from the submeter readings.</CardDescription></CardHeader><CardContent><form className="grid gap-3" onSubmit={e=>{e.preventDefault();meterMutation.mutate();}}>
          <Field label="Rental unit"><select className="h-10 rounded-md border bg-background px-3 text-sm" required value={meterUnit} onChange={e=>setMeterUnit(e.target.value)}><option value="">Select unit</option>{unitRows.map(u=><option key={u.id} value={u.id}>{u.unit_code}</option>)}</select></Field>
          <Field label="Meter type"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={meterType} onChange={e=>setMeterType(e.target.value)}><option value="electricity">Electricity submeter</option><option value="water">Water submeter</option></select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Period start"><Input type="date" value={meterStart} onChange={e=>setMeterStart(e.target.value)}/></Field><Field label="Period end"><Input type="date" value={meterEnd} onChange={e=>setMeterEnd(e.target.value)}/></Field></div>
          <div className="grid grid-cols-3 gap-3"><Field label="Previous"><Input required type="number" min="0" step="0.001" value={meterPrevious} onChange={e=>setMeterPrevious(e.target.value)}/></Field><Field label="Current"><Input required type="number" min="0" step="0.001" value={meterCurrent} onChange={e=>setMeterCurrent(e.target.value)}/></Field><Field label="₹ / unit"><Input required type="number" min="0" step="0.01" value={meterRate} onChange={e=>setMeterRate(e.target.value)}/></Field></div>
          <p className="text-xs text-muted-foreground">Units and amount are calculated automatically. Duplicate period readings are rejected.</p>
          <Button type="submit" disabled={!editor||!meterUnit||meterMutation.isPending}><Plus className="mr-2 size-4"/>Save reading</Button>
        </form></CardContent></Card>
        <Card><CardHeader><CardTitle>Additional charge types</CardTitle><CardDescription>Create water, maintenance, parking, cleaning or other charges.</CardDescription></CardHeader><CardContent><form className="grid gap-3" onSubmit={e=>{e.preventDefault();typeMutation.mutate();}}>
          <Field label="Charge name"><Input required value={chargeName} onChange={e=>setChargeName(e.target.value)}/></Field>
          <Field label="Category"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={chargeCategory} onChange={e=>setChargeCategory(e.target.value)}><option value="water">Common water</option><option value="maintenance">Maintenance</option><option value="parking">Parking</option><option value="cleaning">Cleaning</option><option value="other">Other</option></select></Field>
          <Button type="submit" disabled={!editor||typeMutation.isPending}><Plus className="mr-2 size-4"/>Save charge type</Button>
        </form><div className="mt-4 flex flex-wrap gap-2">{(chargeTypes.data??[]).map(t=><Badge key={t.id} variant="outline">{t.name}</Badge>)}</div></CardContent></Card>
        <Card className="xl:col-span-2"><CardHeader><CardTitle>Additional charge allocation</CardTitle><CardDescription>Set common water and maintenance as equal sharing, or assign fixed and percentage charges per unit. Uncheck Repeat every month for a one-time charge in the selected start month.</CardDescription></CardHeader><CardContent><form className="grid gap-3 md:grid-cols-3" onSubmit={e=>{e.preventDefault();ruleMutation.mutate();}}>
          <Field label="Property"><select className="h-10 rounded-md border bg-background px-3 text-sm" required value={chargeProperty} onChange={e=>setChargeProperty(e.target.value)}><option value="">Select property</option>{propertyRows.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Charge type"><select className="h-10 rounded-md border bg-background px-3 text-sm" required value={chargeType} onChange={e=>setChargeType(e.target.value)}><option value="">Select charge</option>{(chargeTypes.data??[]).filter(t=>t.is_active).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Allocation method"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={chargeMethod} onChange={e=>setChargeMethod(e.target.value)}><option value="equal">Equal across occupied units</option><option value="fixed">Fixed per unit</option><option value="percentage">Percentage per unit</option></select></Field>
          {chargeMethod!=='equal'&&<Field label="Unit"><select className="h-10 rounded-md border bg-background px-3 text-sm" required value={chargeUnit} onChange={e=>setChargeUnit(e.target.value)}><option value="">Select unit</option>{unitRows.filter(u=>u.property_id===chargeProperty).map(u=><option key={u.id} value={u.id}>{u.unit_code}</option>)}</select></Field>}
          <Field label={chargeMethod==='equal'?'Total property charge':'Charge amount'}><Input required type="number" min="0" step="0.01" value={chargeAmount} onChange={e=>setChargeAmount(e.target.value)}/></Field>
          {chargeMethod==='percentage'&&<Field label="Unit share (%)"><Input required type="number" min="0.0001" max="100" step="0.01" value={chargePercent} onChange={e=>setChargePercent(e.target.value)}/></Field>}
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={chargeRecurring} onChange={e=>setChargeRecurring(e.target.checked)}/>Repeat every month</label>
          <div className="flex items-end"><Button type="submit" disabled={!editor||!chargeProperty||!chargeType||ruleMutation.isPending}><Plus className="mr-2 size-4"/>Save charge rule</Button></div>
        </form>
        <div className="mt-4 space-y-2">{(chargeRules.data??[]).map(r=><div key={r.id} className="flex flex-wrap justify-between gap-2 rounded-md border p-3 text-sm"><div><strong>{r.charge_name}</strong><p className="text-xs text-muted-foreground">{r.property_name} · {r.unit_code} · {r.allocation_method} · {r.is_recurring?'Recurring':'One-time'}</p></div><div className="font-medium">{currency(r.amount)}{r.allocation_method==='percentage'? ` · ${r.allocation_percent}%`:''}</div></div>)}</div></CardContent></Card>
        <Card className="xl:col-span-2"><CardHeader><CardTitle>Meter reading history</CardTitle></CardHeader><CardContent className="space-y-2">{(readings.data??[]).slice(0,20).map(r=><div key={r.id} className="flex flex-wrap justify-between gap-2 rounded-md bg-muted/40 p-3 text-sm"><span>{unitRows.find(u=>u.id===r.unit_id)?.unit_code} · {r.meter_type} · {r.period_start} – {r.period_end}</span><strong>{r.units_consumed} units · {currency(r.charge_amount)}</strong></div>)}{(readings.data??[]).length===0&&<p className="text-sm text-muted-foreground">No readings entered yet.</p>}</CardContent></Card>
      </TabsContent>

      <TabsContent value="invoices" className="space-y-4">
        <Card><CardHeader><CardTitle>Generate monthly invoices</CardTitle><CardDescription>Creates one invoice per active rental agreement. Rent is prorated for partial months; meter readings and recurring charge rules are added automatically. Every invoice waits for owner approval.</CardDescription></CardHeader><CardContent className="flex flex-wrap items-end gap-3"><Field label="Billing month"><Input type="month" value={billingMonth} onChange={e=>setBillingMonth(e.target.value)}/></Field><Button onClick={()=>invoiceMutation.mutate()} disabled={!editor||invoiceMutation.isPending||agreementRows.length===0}>{invoiceMutation.isPending?<Loader2 className="mr-2 size-4 animate-spin"/>:<CalendarDays className="mr-2 size-4"/>}Generate invoices</Button><span className="text-xs text-muted-foreground">Due date: 15th (or agreement-specific due day)</span></CardContent></Card>
        <Card><CardHeader><CardTitle>Invoice register</CardTitle><CardDescription>Approve invoices before sharing them with tenants.</CardDescription></CardHeader><CardContent className="space-y-3">
          {invoiceRows.map(i=><div key={i.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><strong>{i.invoice_number}</strong>{statusBadge(i.status)}</div><p className="mt-1 text-sm">{i.tenant?.full_name} · {i.unit?.unit_code}</p><p className="text-xs text-muted-foreground">{i.billing_period_start} – {i.billing_period_end} · Due {i.due_date}</p></div><div className="text-right"><div className="text-lg font-semibold">{currency(i.total)}</div><p className="text-xs text-muted-foreground">{(i.payments??[]).length} payment(s)</p></div></div>
            <div className="mt-3 space-y-1 border-t pt-2">{(i.lines??[]).map(line=><div key={line.id} className="flex justify-between gap-2 text-xs"><span>{line.description}</span><span>{currency(line.amount)}</span></div>)}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {owner&&i.status==='pending_approval'&&<Button size="sm" onClick={()=>approveMutation.mutate(i.id)} disabled={approveMutation.isPending}><BadgeCheck className="mr-2 size-4"/>Approve</Button>}
              {owner&&i.status==='approved'&&<Button size="sm" onClick={()=>shareInvoice(i)}><Share2 className="mr-2 size-4"/>Share PDF / WhatsApp</Button>}
              {owner&&i.status==='approved'&&<Button size="sm" variant="outline" onClick={()=>sentMutation.mutate(i.id)} disabled={sentMutation.isPending}>Confirm sent</Button>}
              {i.status==='sent'&&editor&&<Button size="sm" variant="outline" onClick={()=>setSelectedInvoice(i.id)}><CreditCard className="mr-2 size-4"/>Record payment</Button>}
            </div>
          </div>)}
          {invoiceRows.length===0&&<p className="text-sm text-muted-foreground">No invoices yet. Add a tenant agreement and generate the billing month.</p>}
        </CardContent></Card>
        {selectedInvoice&&activeInvoice&&<Card><CardHeader><CardTitle>Record tenant payment</CardTitle><CardDescription>{activeInvoice.invoice_number} · Outstanding {currency(outstandingForSelected)}</CardDescription></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();paymentMutation.mutate();}}>
          <Field label="Amount"><Input required type="number" min="0.01" max={outstandingForSelected} step="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></Field>
          <Field label="Method"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="qr">QR</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option></select></Field>
          <div className="flex items-end gap-2"><Button type="submit" disabled={paymentMutation.isPending||Number(paymentAmount)<=0||Number(paymentAmount)>outstandingForSelected}>Save payment</Button><Button type="button" variant="ghost" onClick={()=>setSelectedInvoice('')}>Cancel</Button></div>
        </form></CardContent></Card>}
      </TabsContent>

      <TabsContent value="expenses" className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Record property expense</CardTitle></CardHeader><CardContent><form className="grid gap-3" onSubmit={e=>{e.preventDefault();expenseMutation.mutate();}}>
          <Field label="Property"><select className="h-10 rounded-md border bg-background px-3 text-sm" required value={expenseProperty} onChange={e=>setExpenseProperty(e.target.value)}><option value="">Select property</option>{propertyRows.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Unit (optional)"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={expenseUnit} onChange={e=>setExpenseUnit(e.target.value)}><option value="">Property-wide</option>{unitRows.filter(u=>u.property_id===expenseProperty).map(u=><option key={u.id} value={u.id}>{u.unit_code}</option>)}</select></Field>
          <Field label="Category"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={expenseCategory} onChange={e=>setExpenseCategory(e.target.value)}><option value="maintenance">Maintenance</option><option value="repairs">Repairs</option><option value="utilities">Utilities</option><option value="taxes">Taxes</option><option value="insurance">Insurance</option><option value="cleaning">Cleaning</option><option value="other">Other</option></select></Field>
          <Field label="Description"><Input required value={expenseDescription} onChange={e=>setExpenseDescription(e.target.value)}/></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Amount"><Input required type="number" min="0.01" step="0.01" value={expenseAmount} onChange={e=>setExpenseAmount(e.target.value)}/></Field><Field label="Expense date"><Input type="date" value={expenseDate} onChange={e=>setExpenseDate(e.target.value)}/></Field></div>
          <Button type="submit" disabled={!editor||!expenseProperty||expenseMutation.isPending}><Plus className="mr-2 size-4"/>Save expense</Button>
        </form></CardContent></Card>
        <Card><CardHeader><CardTitle>Security deposit ledger</CardTitle><CardDescription>Deposits are tracked as liabilities, not rental income.</CardDescription></CardHeader><CardContent><form className="grid gap-3" onSubmit={e=>{e.preventDefault();depositMutation.mutate();}}>
          <Field label="Tenant"><select className="h-10 rounded-md border bg-background px-3 text-sm" required value={depositTenant} onChange={e=>setDepositTenant(e.target.value)}><option value="">Select tenant</option>{tenantRows.map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}</select></Field>
          <Field label="Unit"><select className="h-10 rounded-md border bg-background px-3 text-sm" required value={depositUnit} onChange={e=>setDepositUnit(e.target.value)}><option value="">Select unit</option>{unitRows.map(u=><option key={u.id} value={u.id}>{u.unit_code}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Transaction"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={depositType} onChange={e=>setDepositType(e.target.value)}><option value="received">Deposit received</option><option value="refunded">Deposit refunded</option><option value="adjustment">Adjustment</option></select></Field><Field label="Amount"><Input required type="number" min="0.01" step="0.01" value={depositAmount} onChange={e=>setDepositAmount(e.target.value)}/></Field></div>
          <Button type="submit" disabled={!editor||!depositTenant||!depositUnit||depositMutation.isPending}><Plus className="mr-2 size-4"/>Record deposit</Button>
        </form></CardContent></Card>
        <Card className="xl:col-span-2"><CardHeader><CardTitle>Expense register</CardTitle></CardHeader><CardContent className="space-y-2">{expenseRows.map(e=><div key={e.id} className="flex flex-wrap justify-between gap-2 rounded-md border p-3 text-sm"><div><strong>{e.description}</strong><p className="text-xs text-muted-foreground">{e.category} · {e.expense_date}</p></div><strong>{currency(e.amount)}</strong></div>)}{expenseRows.length===0&&<p className="text-sm text-muted-foreground">No property expenses recorded.</p>}</CardContent></Card>
        <Card className="xl:col-span-2"><CardHeader><CardTitle>Security deposit history</CardTitle></CardHeader><CardContent className="space-y-2">{(deposits.data??[]).map(d=><div key={d.id} className="flex flex-wrap justify-between gap-2 rounded-md bg-muted/40 p-3 text-sm"><span>{tenantRows.find(t=>t.id===d.tenant_id)?.full_name} · {d.transaction_type} · {d.transaction_date}</span><strong>{currency(d.amount)}</strong></div>)}{(deposits.data??[]).length===0&&<p className="text-sm text-muted-foreground">No deposit transactions recorded.</p>}</CardContent></Card>
      </TabsContent>

      {owner&&<TabsContent value="team" className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Give an existing employee access</CardTitle><CardDescription>Choose an existing BizSathi profile. No new login is created.</CardDescription></CardHeader><CardContent><form className="grid gap-3" onSubmit={e=>{e.preventDefault();memberMutation.mutate();}}>
          <Field label="Existing employee account"><select className="h-10 rounded-md border bg-background px-3 text-sm" required value={candidateUser} onChange={e=>setCandidateUser(e.target.value)}><option value="">Select employee</option>{(candidates.data??[]).map(c=><option key={c.id} value={c.id}>{c.full_name||'Unnamed user'}{c.employee_id? ` · ${c.employee_id}`:''}</option>)}</select></Field>
          <Field label="Access profile"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={memberRole} onChange={e=>setMemberRole(e.target.value)}><option value="accountant">Accountant – edit records, cannot approve/send</option><option value="viewer">Viewer – read-only</option></select></Field>
          <Button type="submit" disabled={!candidateUser||memberMutation.isPending}><UserPlus className="mr-2 size-4"/>Assign existing account</Button>
        </form></CardContent></Card>
        <Card><CardHeader><CardTitle>Rental workspace members</CardTitle></CardHeader><CardContent className="space-y-2">{(members.data?.members??[]).map(m=><div key={m.id} className="flex items-center justify-between rounded-md border p-3 text-sm"><div><strong>{m.profiles?.full_name||'BizSathi user'}</strong><p className="text-xs text-muted-foreground">{m.profiles?.employee_id||m.user_id}</p></div><Badge variant={m.role==='owner'?'default':'secondary'}>{m.role}</Badge></div>)}</CardContent></Card>
        <Card className="xl:col-span-2"><CardHeader><CardTitle>Audit history</CardTitle><CardDescription>Owner-only record of changes to rental data.</CardDescription></CardHeader><CardContent className="space-y-2">{(audit.data??[]).slice(0,30).map(a=><div key={a.id} className="flex flex-wrap justify-between gap-2 rounded-md bg-muted/40 p-3 text-xs"><span>{a.action} · {a.entity_table} · {a.entity_id}</span><span>{new Date(a.created_at).toLocaleString()}</span></div>)}{(audit.data??[]).length===0&&<p className="text-sm text-muted-foreground">No changes recorded yet.</p>}</CardContent></Card>
      </TabsContent>}
    </Tabs>
  </main>;
}
