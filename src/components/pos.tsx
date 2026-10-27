import {useState} from 'react';
import {Link} from '@tanstack/react-router';
import {Button} from './ui/button';
import {CommerceFrame,useCommerce} from './commerce-workspace';
import {DocumentEditor} from './document-editor';
export function Pos(){const w=useCommerce();const[saved,setSaved]=useState('');return <CommerceFrame w={w} title="Point of sale" active="/pos">{saved?<section className="border-y py-10"><h2 className="brand text-xl">Sale saved</h2><p className="mt-3 break-all text-sm text-muted-foreground">{saved}</p><div className="mt-5 flex flex-wrap gap-2"><Button onClick={()=>setSaved('')}>New sale</Button><Button asChild variant="outline"><Link to="/sales">Sales & receipts</Link></Button></div></section>:<DocumentEditor key={w.businessId} w={w} kind="sale" onSaved={setSaved}/>}</CommerceFrame>;}