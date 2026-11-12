import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {useState} from 'react';
const api=vi.hoisted(()=>({save:vi.fn(async(_request:unknown)=>({ok:true})),qr:{url:'data:image/png;base64,iVBORw0KGgo=',provider:'Fonepay',payee:'Auraluxe',instructions:'Use invoice reference'}}));
vi.mock('@tanstack/react-start',()=>({useServerFn:(f:unknown)=>f}));
vi.mock('@/lib/sales-cash-flow.functions',()=>({getPaymentQr:async()=>api.qr,saveCreditLimit:(r:unknown)=>api.save(r)}));
import {InvoiceSheet} from '@/components/invoice-print';
import {PartyStatementShare} from '@/components/party-statement-share';
import {CreditLimitEditor} from '@/components/party-credit';
const id='11111111-1111-4111-8111-111111111111';
function mount(ui:React.ReactNode){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{ui}</QueryClientProvider>);}
describe('Sales cash flow integration',()=>{
 it('keeps payment QR on both A4 and thermal sale receipts',async()=>{function View(){const [layout,setLayout]=useState<'a4'|'thermal'>('a4');return <><button onClick={()=>setLayout('thermal')}>Thermal</button><InvoiceSheet layout={layout} data={{businessId:id,business:'Auraluxe',pan:'',reference:'INV-1',date:'2026-11-12',status:'confirmed',kind:'sale',branch:'Main',party:'Customer',phone:'9812345678',lines:[],subtotal:100,tax:0,total:100,paid:0,returned:0,outstanding:100,docId:id}}/></>;}mount(<View/>);expect(await screen.findByRole('img',{name:'Fonepay payment QR'})).toBeInTheDocument();fireEvent.click(screen.getByText('Thermal'));expect(await screen.findByRole('img',{name:'Fonepay payment QR'})).toBeInTheDocument();expect(screen.getByLabelText('Invoice receipt')).toHaveAttribute('data-layout','thermal');});
 it('opens a reviewed WhatsApp statement with correct party balance and payment details',async()=>{mount(<PartyStatementShare businessId={id} business="Auraluxe" party="Customer" phone="9812345678" balance={240} invoices={[{reference:'INV-1',outstanding:240}]}/>);fireEvent.click(screen.getByRole('button',{name:'WhatsApp statement'}));const link=await screen.findByRole('link',{name:'Open WhatsApp'});await waitFor(()=>expect(decodeURIComponent(link.getAttribute('href')??'')).toContain('Use invoice reference'));expect(decodeURIComponent(link.getAttribute('href')??'')).toContain('To receive from party: Rs. 240.00');expect(link.getAttribute('href')).toMatch(/^https:\/\/wa.me\/9779812345678/);});
 it('saves zero credit limit distinctly from an unconfigured blank',async()=>{mount(<CreditLimitEditor businessId={id} partyId={id} limit={null}/>);fireEvent.change(screen.getByLabelText('Customer credit limit'),{target:{value:'0'}});fireEvent.click(screen.getByRole('button',{name:'Save limit'}));await waitFor(()=>expect(api.save).toHaveBeenCalledWith({data:{businessId:id,partyId:id,limit:0}}));});
});